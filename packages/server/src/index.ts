import express from 'express';
import { Server } from 'colyseus';
import { createServer } from 'http';
import { OfficeRoom } from './rooms/OfficeRoom';
import { OllamaAdapter } from '@agent-office/adapters';
import { AGENT_MODEL, OLLAMA_URL } from './config';
import { OutreachStore, DraftStatus } from './outreach/OutreachStore';
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

// ─── Outreach Studio (Sia: lead searches, Karl: outreach drafts) ───
const outreachStore = new OutreachStore();
const outreachReady = outreachStore.initialize();
const outreach = new OutreachService(new OllamaAdapter(OLLAMA_URL), AGENT_MODEL, outreachStore);

const isSegment = (value: any): value is Segment => typeof value === 'string' && value in SEGMENTS;
const DRAFT_STATUSES: DraftStatus[] = ['drafted', 'sent', 'skipped'];

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
    room?.startAgentJob('sia', `Sales Navigator searches: ${SEGMENTS[segment].label}`,
        `🔎 On it! Building Sales Navigator searches for ${SEGMENTS[segment].label}.`);
    try {
        const searches = await outreach.generateSearches(segment, focusText);
        room?.finishAgentJob('sia', `✅ ${searches.length} new searches are ready in Outreach Studio.`);
        res.json({ ok: true, searches });
    } catch (e: any) {
        room?.finishAgentJob('sia', `⚠️ I couldn't finish those searches: ${e?.message || e}`);
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
    room?.startAgentJob('karl', 'Drafting LinkedIn outreach', '✍️ Reading this lead and drafting outreach...');
    try {
        const draft = await outreach.draftOutreach(profileText.slice(0, 8000), chosenSegment);
        const verdict = draft.fit === 'disqualified'
            ? `🚫 ${draft.leadName} is not a fit: ${draft.fitReason}`
            : `✅ Drafts for ${draft.leadName} are ready for your review.`;
        room?.finishAgentJob('karl', verdict);
        res.json({ ok: true, draft });
    } catch (e: any) {
        room?.finishAgentJob('karl', `⚠️ I couldn't draft that one: ${e?.message || e}`);
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
