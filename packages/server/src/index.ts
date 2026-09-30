import express from 'express';
import { Server } from 'colyseus';
import { createServer } from 'http';
import { OfficeRoom } from './rooms/OfficeRoom';
import { OllamaAdapter } from '@agent-office/adapters';
import { AGENT_MODEL, OLLAMA_URL } from './config';
import { OutreachStore, DraftStatus, CommentStatus, CommentOption } from './outreach/OutreachStore';
import { OutreachService } from './outreach/OutreachService';
import { SEGMENTS, Segment } from './outreach/profile';
import { WritingService, WriterSettings, COMMUNITY_TYPES, CommunityType, TimeZone, TONES } from './outreach/WritingService';
import { TEAM, isTeamMember } from './team';

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
const writer = new WritingService(new OllamaAdapter(OLLAMA_URL), AGENT_MODEL, outreachStore);

const isSegment = (value: any): value is Segment => typeof value === 'string' && value in SEGMENTS;
const DRAFT_STATUSES: DraftStatus[] = ['drafted', 'sent', 'skipped'];
const COMMENT_STATUSES: CommentStatus[] = ['drafted', 'posted', 'skipped'];
const SETTING_KEYS = { myName: 'my_name', calendly: 'calendly_link', voice: 'voice_samples' };
const ITEM_KINDS = ['dm_reply', 'comment_reply', 'community', 'agent_task', 'intent_reply', 'polish'];
const ITEM_STATUSES = ['drafted', 'sent', 'posted', 'skipped'];

async function loadSettings(): Promise<WriterSettings> {
    return {
        myName: await outreachStore.getSetting(SETTING_KEYS.myName),
        calendly: await outreachStore.getSetting(SETTING_KEYS.calendly),
        voice: await outreachStore.getSetting(SETTING_KEYS.voice),
    };
}

const text = (value: any, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// Runs a writing job with the agent shown at their desk and announcing progress in the office chat.
async function runAgentJob<T>(
    res: express.Response,
    agentId: string,
    task: string,
    start: string,
    job: () => Promise<T>,
    done: (result: T) => string
) {
    const room = OfficeRoom.getActiveRoom();
    room?.startAgentJob(agentId, task, start);
    try {
        const item = await job();
        room?.finishAgentJob(agentId, done(item));
        res.json({ ok: true, item });
    } catch (e: any) {
        room?.finishAgentJob(agentId, `⚠️ I couldn't finish that: ${e?.message || e}`);
        res.status(502).json({ ok: false, error: String(e?.message || e) });
    }
}

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
        const voice = await outreachStore.getSetting(SETTING_KEYS.voice);
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

app.get('/api/outreach/settings', route(async (req, res) => {
    res.json({ ok: true, settings: await loadSettings() });
}));

app.put('/api/outreach/settings', route(async (req, res) => {
    const calendly = text(req.body?.calendly, 500);
    if (calendly && !/^https?:\/\/\S+$/.test(calendly)) {
        res.status(400).json({ ok: false, error: 'The Calendly link should start with https://' });
        return;
    }
    await outreachStore.setSetting(SETTING_KEYS.myName, text(req.body?.myName, 100));
    await outreachStore.setSetting(SETTING_KEYS.calendly, calendly);
    await outreachStore.setSetting(SETTING_KEYS.voice, text(req.body?.voice, 6000));
    res.json({ ok: true, settings: await loadSettings() });
}));

app.get('/api/items', route(async (req, res) => {
    const kind = String(req.query.kind || '');
    if (!ITEM_KINDS.includes(kind)) {
        res.status(400).json({ ok: false, error: 'Unknown kind.' });
        return;
    }
    res.json({ ok: true, items: await outreachStore.listItems(kind) });
}));

app.patch('/api/items/:id', route(async (req, res) => {
    const { status, data } = req.body || {};
    if (status !== undefined && !ITEM_STATUSES.includes(status)) {
        res.status(400).json({ ok: false, error: 'Unknown status.' });
        return;
    }
    const item = await outreachStore.updateItem(Number(req.params.id), {
        status,
        data: data && typeof data === 'object' ? data : undefined,
    });
    res.status(item ? 200 : 404).json({ ok: Boolean(item), item });
}));

app.delete('/api/items/:id', route(async (req, res) => {
    const ok = await outreachStore.deleteItem(Number(req.params.id));
    res.status(ok ? 200 : 404).json({ ok });
}));

app.post('/api/outreach/dm-replies', route(async (req, res) => {
    const thread = text(req.body?.thread, 10000);
    if (thread.length < 20) {
        res.status(400).json({ ok: false, error: 'Paste the LinkedIn conversation, including their latest message.' });
        return;
    }
    const notes = text(req.body?.notes, 500);
    const settings = await loadSettings();
    await runAgentJob(res, 'raze', 'Drafting a DM reply', '📨 Reading this conversation and drafting replies...',
        () => writer.draftDmReply(thread, notes, settings),
        (item) => `✅ Two reply options for ${item.title} are ready.`);
}));

app.post('/api/outreach/intent-replies', route(async (req, res) => {
    const message = text(req.body?.message, 6000);
    const intent = text(req.body?.intent, 2000);
    if (message.length < 2 || intent.length < 2) {
        res.status(400).json({ ok: false, error: 'Paste the message you got and type what you want to say.' });
        return;
    }
    const settings = await loadSettings();
    await runAgentJob(res, 'raze', 'Writing a reply your way', '↩️ Turning your notes into a reply...',
        () => writer.draftReplyWithIntent(text(req.body?.from, 100), message, intent, settings),
        () => '✅ Your reply options are ready.');
}));

app.post('/api/outreach/polish', route(async (req, res) => {
    const draft = text(req.body?.draft, 6000);
    if (draft.length < 3) {
        res.status(400).json({ ok: false, error: 'Type the message you want Raze to polish.' });
        return;
    }
    const tone = TONES.includes(req.body?.tone) ? req.body.tone : TONES[0];
    const settings = await loadSettings();
    await runAgentJob(res, 'raze', 'Polishing a message', '✨ Polishing your message...',
        () => writer.polishMessage(draft, text(req.body?.audience, 100), tone, settings),
        () => '✅ Your polished message is ready.');
}));

app.post('/api/outreach/comment-replies', route(async (req, res) => {
    const comment = text(req.body?.comment, 4000);
    if (comment.length < 3) {
        res.status(400).json({ ok: false, error: 'Paste the comment you want to reply to.' });
        return;
    }
    const settings = await loadSettings();
    await runAgentJob(res, 'clove', 'Replying to a comment', '💬 Drafting a reply to this comment...',
        () => writer.draftCommentReply(text(req.body?.commenter, 100), comment, text(req.body?.post, 6000), settings),
        (item) => `✅ Replies to ${item.title} are ready.`);
}));

app.post('/api/community/drafts', route(async (req, res) => {
    const type = req.body?.type as CommunityType;
    const brief = text(req.body?.brief, 6000);
    if (!COMMUNITY_TYPES.includes(type) || brief.length < 5) {
        res.status(400).json({ ok: false, error: 'Pick a type and describe what you want Jett to write.' });
        return;
    }
    const zone = ['PT', 'CT', 'ET'].includes(req.body?.zone) ? (req.body.zone as TimeZone) : undefined;
    const link = text(req.body?.link, 500);
    if (link && !/^https?:\/\/\S+$/.test(link)) {
        res.status(400).json({ ok: false, error: 'The link should start with https://' });
        return;
    }
    await runAgentJob(res, 'jett', `Writing a community ${type}`, `🚀 On it! Drafting a community ${type}...`,
        () => writer.draftCommunity({ type, brief, date: text(req.body?.date, 20), time: text(req.body?.time, 10), zone, link }),
        () => `✅ Your community ${type} draft is ready.`);
}));

app.get('/api/team/state', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    res.json({
        ok: true,
        officeOpen: Boolean(room),
        meeting: room?.isMeetingActive() || false,
        onBreak: room?.agentsOnBreak() || [],
        agents: Object.entries(TEAM).map(([id, m]) => ({ id, name: m.name, role: m.role })),
    });
});

app.post('/api/team/meeting', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'Open the office in your browser first.' });
        return;
    }
    room.setMeeting(Boolean(req.body?.active));
    res.json({ ok: true, meeting: room.isMeetingActive() });
});

app.post('/api/team/say', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    const message = text(req.body?.text, 500);
    if (!room || !message) {
        res.status(400).json({ ok: false, error: room ? 'Type a message first.' : 'Open the office in your browser first.' });
        return;
    }
    room.sayToTeam(message);
    res.json({ ok: true });
});

app.post('/api/team/break', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'Open the office in your browser first.' });
        return;
    }
    if (room.isMeetingActive()) {
        res.status(409).json({ ok: false, error: 'End the meeting first.' });
        return;
    }
    const ids = isTeamMember(req.body?.agentId) ? [req.body.agentId] : Object.keys(TEAM);
    ids.forEach((id) => room.startBreak(id, 'because you sent them, to reset and stay sharp'));
    res.json({ ok: true, onBreak: room.agentsOnBreak() });
});

app.get('/api/team/tasks', route(async (req, res) => {
    res.json({ ok: true, items: await outreachStore.listItems('agent_task') });
}));

app.post('/api/team/tasks', route(async (req, res) => {
    const agentId = req.body?.agentId;
    const task = text(req.body?.task, 2000);
    if (!isTeamMember(agentId) || task.length < 5) {
        res.status(400).json({ ok: false, error: 'Pick a teammate and describe the task.' });
        return;
    }
    OfficeRoom.getActiveRoom()?.broadcast('chat', { sender: 'You', text: `📋 ${TEAM[agentId].name}, please: ${task}` });
    const settings = await loadSettings();
    await runAgentJob(res, agentId, task.slice(0, 60), `👍 Got it! Working on: ${task.slice(0, 80)}`,
        () => writer.doAgentTask(agentId, task, settings),
        (item) => item.data.summary ? `✅ ${item.data.summary}` : '✅ Done! Check the Team Meeting panel.');
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
