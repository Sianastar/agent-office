import express from 'express';
import { Server } from 'colyseus';
import { createServer } from 'http';
import { OfficeRoom } from './rooms/OfficeRoom';
import { OllamaAdapter } from '@agent-office/adapters';
import { AGENT_MODEL, OLLAMA_URL } from './config';
import { OutreachStore, DraftStatus, CommentStatus, CommentOption } from './outreach/OutreachStore';
import { OutreachService } from './outreach/OutreachService';
import { SEGMENTS, Segment } from './outreach/profile';

// Setup Express
const app = express();
app.use(express.json());

// Basic REST API for Office Management
app.get('/api/offices', (req, res) => {
    res.json({ status: 'ok', offices: [] });
});

app.post('/api/vote-chaos', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'No active office room.' });
        return;
    }
    const { event, voterId } = req.body || {};
    const result = room.registerAudienceVote(event || 'server_outage', voterId);
    res.json({ ok: true, ...result });
});

app.get('/api/episode-recap', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'No active office room.' });
        return;
    }
    res.json({ ok: true, recap: room.getEpisodeRecap() });
});

// ─── Outreach Studio (Killjoy: lead searches, Raze: outreach drafts, Clove: comments) ───
const outreachStore = new OutreachStore();
const outreachReady = outreachStore.initialize();
const outreach = new OutreachService(new OllamaAdapter(OLLAMA_URL), AGENT_MODEL, outreachStore);

const isSegment = (value: any): value is Segment => typeof value === 'string' && value in SEGMENTS;
const DRAFT_STATUSES: DraftStatus[] = ['drafted', 'sent', 'skipped'];
const COMMENT_STATUSES: CommentStatus[] = ['drafted', 'posted', 'skipped'];
const VOICE_KEY = 'voice_samples';

type Handler = (req: express.Request, res: express.Response) => Promise<void>;
const route = (handler: Handler) => async (req: express.Request, res: express.Response) => {
    try {
        await outreachReady;
        await handler(req, res);
    } catch (e: any) {
        res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
};

app.get('/api/outreach/segments', (req, res) => {
    res.json({ ok: true, segments: Object.entries(SEGMENTS).map(([id, s]) => ({ id, label: s.label })) });
});

app.get('/api/outreach/searches', route(async (req, res) => {
    res.json({ ok: true, searches: await outreachStore.listSearches() });
}));

app.post('/api/outreach/searches', route(async (req, res) => {
    const { segment, focus } = req.body || {};
    if (!isSegment(segment)) {
        res.status(400).json({ ok: false, error: 'Pick a segment.' });
        return;
    }
    const focusText = typeof focus === 'string' ? focus.trim().slice(0, 300) : '';
    const room = OfficeRoom.getActiveRoom();
    room?.startAgentJob('killjoy', `Sales Navigator searches: ${SEGMENTS[segment].label}`,
        `🔎 On it! Building Sales Navigator searches for ${SEGMENTS[segment].label}.`);
    try {
        const searches = await outreach.generateSearches(segment, focusText);
        room?.finishAgentJob('killjoy', `✅ ${searches.length} new searches are ready in Outreach Studio.`);
        res.json({ ok: true, searches });
    } catch (e: any) {
        room?.finishAgentJob('killjoy', `⚠️ I couldn't finish those searches: ${e?.message || e}`);
        res.status(502).json({ ok: false, error: String(e?.message || e) });
    }
}));

app.delete('/api/outreach/searches/:id', route(async (req, res) => {
    const ok = await outreachStore.deleteSearch(Number(req.params.id));
    res.status(ok ? 200 : 404).json({ ok });
}));

app.get('/api/outreach/drafts', route(async (req, res) => {
    res.json({ ok: true, drafts: await outreachStore.listDrafts() });
}));

app.post('/api/outreach/drafts', route(async (req, res) => {
    const { leadProfile, segment } = req.body || {};
    const profileText = typeof leadProfile === 'string' ? leadProfile.trim() : '';
    if (profileText.length < 20) {
        res.status(400).json({ ok: false, error: "Paste the lead's LinkedIn profile (name, headline, company, About)." });
        return;
    }
    const chosenSegment: Segment | 'auto' = isSegment(segment) ? segment : 'auto';
    const room = OfficeRoom.getActiveRoom();
    room?.startAgentJob('raze', 'Drafting LinkedIn outreach', '✍️ Reading this lead and drafting outreach...');
    try {
        const draft = await outreach.draftOutreach(profileText.slice(0, 8000), chosenSegment);
        const verdict = draft.fit === 'disqualified'
            ? `🚫 ${draft.leadName} is not a fit: ${draft.fitReason}`
            : `✅ Drafts for ${draft.leadName} are ready for your review.`;
        room?.finishAgentJob('raze', verdict);
        res.json({ ok: true, draft });
    } catch (e: any) {
        room?.finishAgentJob('raze', `⚠️ I couldn't draft that one: ${e?.message || e}`);
        res.status(502).json({ ok: false, error: String(e?.message || e) });
    }
}));

app.patch('/api/outreach/drafts/:id', route(async (req, res) => {
    const { status, connectionNote, followUp } = req.body || {};
    if (status !== undefined && !DRAFT_STATUSES.includes(status)) {
        res.status(400).json({ ok: false, error: 'Unknown status.' });
        return;
    }
    const draft = await outreachStore.updateDraft(Number(req.params.id), {
        status,
        connectionNote: typeof connectionNote === 'string' ? connectionNote : undefined,
        followUp: typeof followUp === 'string' ? followUp : undefined,
    });
    res.status(draft ? 200 : 404).json({ ok: Boolean(draft), draft });
}));

app.delete('/api/outreach/drafts/:id', route(async (req, res) => {
    const ok = await outreachStore.deleteDraft(Number(req.params.id));
    res.status(ok ? 200 : 404).json({ ok });
}));

app.get('/api/outreach/voice', route(async (req, res) => {
    res.json({ ok: true, voice: await outreachStore.getSetting(VOICE_KEY) });
}));

app.put('/api/outreach/voice', route(async (req, res) => {
    const voice = typeof req.body?.voice === 'string' ? req.body.voice.slice(0, 6000) : '';
    await outreachStore.setSetting(VOICE_KEY, voice);
    res.json({ ok: true, voice });
}));

app.get('/api/outreach/comments', route(async (req, res) => {
    res.json({ ok: true, comments: await outreachStore.listComments() });
}));

app.post('/api/outreach/comments', route(async (req, res) => {
    const postText = typeof req.body?.postText === 'string' ? req.body.postText.trim() : '';
    if (postText.length < 20) {
        res.status(400).json({ ok: false, error: 'Paste the LinkedIn post (and the author name and headline if you have them).' });
        return;
    }
    const room = OfficeRoom.getActiveRoom();
    room?.startAgentJob('clove', 'Drafting LinkedIn comments', '💬 Reading this post and drafting comments...');
    try {
        const voice = await outreachStore.getSetting(VOICE_KEY);
        const set = await outreach.draftComments(postText.slice(0, 8000), voice);
        room?.finishAgentJob('clove', `✅ ${set.comments.length} comment options for ${set.authorName}'s post are ready.`);
        res.json({ ok: true, set });
    } catch (e: any) {
        room?.finishAgentJob('clove', `⚠️ I couldn't draft comments for that post: ${e?.message || e}`);
        res.status(502).json({ ok: false, error: String(e?.message || e) });
    }
}));

app.patch('/api/outreach/comments/:id', route(async (req, res) => {
    const { status, comments } = req.body || {};
    if (status !== undefined && !COMMENT_STATUSES.includes(status)) {
        res.status(400).json({ ok: false, error: 'Unknown status.' });
        return;
    }
    const cleanComments: CommentOption[] | undefined = Array.isArray(comments)
        ? comments
            .filter((c: any) => typeof c?.text === 'string')
            .map((c: any) => ({ style: String(c.style || 'comment'), text: c.text }))
        : undefined;
    const set = await outreachStore.updateComments(Number(req.params.id), { status, comments: cleanComments });
    res.status(set ? 200 : 404).json({ ok: Boolean(set), set });
}));

app.delete('/api/outreach/comments/:id', route(async (req, res) => {
    const ok = await outreachStore.deleteComments(Number(req.params.id));
    res.status(ok ? 200 : 404).json({ ok });
}));

// Create HTTP and Colyseus server
const httpServer = createServer(app);
const colyseusServer = new Server({
    server: httpServer,
});

// Define Rooms
colyseusServer.define('office', OfficeRoom);

// Start listening
const PORT = Number(process.env.PORT || 3000);
colyseusServer.listen(PORT).then(() => {
    console.log(`[Server] AgentOffice Engine listening on ws://localhost:${PORT}`);
});
