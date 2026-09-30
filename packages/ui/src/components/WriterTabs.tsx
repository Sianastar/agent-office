import React, { useEffect, useState } from 'react';
import { api, DraftOption, inputStyle, ItemCard, primaryButton, smallButton, StatusFilter, StoredItem, useItems } from './studioShared';

interface Settings {
    myName: string;
    calendly: string;
    voice: string;
}

const optionList = (labels: Record<string, string>) => (data: any): DraftOption[] =>
    (data.options || []).map((o: any) => ({ label: labels[o.style] || 'Option', text: o.text, warning: o.warning }));

const withOptionTexts = (data: any, texts: string[]) => ({
    ...data,
    options: data.options.map((o: any, i: number) => ({ ...o, text: texts[i] })),
});

function Hint({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 11, marginBottom: 8, color: '#e6d6f0' }}>{children}</div>;
}

function Busy({ busy, idle, working, disabled, onClick }: { busy: boolean; idle: string; working: string; disabled: boolean; onClick: () => void }) {
    return (
        <button style={{ ...primaryButton, opacity: busy || disabled ? 0.6 : 1 }} onClick={onClick} disabled={busy || disabled}>
            {busy ? working : idle}
        </button>
    );
}

export function SettingsBox() {
    const [open, setOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>({ myName: '', calendly: '', voice: '' });
    const [status, setStatus] = useState('');

    useEffect(() => {
        api<{ settings: Settings }>('/api/outreach/settings').then((d) => setSettings(d.settings)).catch(() => undefined);
    }, []);

    const update = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setSettings((prev) => ({ ...prev, [key]: e.target.value }));
        setStatus('');
    };

    const save = async () => {
        try {
            const d = await api<{ settings: Settings }>('/api/outreach/settings', { method: 'PUT', body: JSON.stringify(settings) });
            setSettings(d.settings);
            setStatus('Saved.');
        } catch (e: any) {
            setStatus(e.message);
        }
    };

    return (
        <div style={{ marginBottom: 8 }}>
            <button style={smallButton} onClick={() => setOpen((v) => !v)}>
                {open ? '▾' : '▸'} ⚙️ Settings{!settings.calendly ? ' (add your Calendly link)' : ''}
            </button>
            {open && (
                <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                    <input value={settings.myName} onChange={update('myName')} placeholder="Your name as it shows on LinkedIn" style={inputStyle} />
                    <input value={settings.calendly} onChange={update('calendly')} placeholder="Your Calendly link (https://calendly.com/...)" style={inputStyle} />
                    <textarea
                        value={settings.voice}
                        onChange={update('voice')}
                        placeholder="Your voice (optional): paste 3–5 comments, replies, or messages you wrote so the team sounds like you…"
                        rows={4}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                    <div>
                        <button style={smallButton} onClick={save}>Save settings</button>
                        {status && <span style={{ fontSize: 10, marginLeft: 6, color: '#e6d6f0' }}>{status}</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

export function DmReplyTab() {
    const { items, error, setError, add, replace, remove } = useItems('dm_reply');
    const [thread, setThread] = useState('');
    const [notes, setNotes] = useState('');
    const [filter, setFilter] = useState('drafted');
    const [busy, setBusy] = useState(false);

    const draft = async () => {
        setBusy(true);
        setError('');
        try {
            const d = await api<{ item: StoredItem }>('/api/outreach/dm-replies', { method: 'POST', body: JSON.stringify({ thread, notes }) });
            add(d.item);
            setThread('');
            setNotes('');
            setFilter('drafted');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const visible = items.filter((i) => filter === 'all' || i.status === filter);
    return (
        <div>
            <Hint>
                Paste the LinkedIn conversation (at least their latest message). Raze drafts two replies: one that asks a probing
                question, and one that invites them to a chat with your Calendly link from ⚙️ Settings.
            </Hint>
            <textarea value={thread} onChange={(e) => setThread(e.target.value)} placeholder="Paste the conversation here…" rows={7} style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }} />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: anything Raze should keep in mind" style={{ ...inputStyle, marginBottom: 6 }} />
            <Busy busy={busy} idle="📨 Ask Raze for replies" working="Raze is writing… (can take a minute or two)" disabled={thread.trim().length < 20} onClick={draft} />
            {error && <div style={{ fontSize: 11, color: '#ffadad', marginTop: 6 }}>{error}</div>}
            <StatusFilter items={items} value={filter} onChange={setFilter} doneStatus="sent" doneLabel="Sent" />
            {visible.length === 0 && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#e6d6f0' }}>Nothing here yet.</div>}
            {visible.map((item) => (
                <ItemCard
                    key={item.id}
                    item={item}
                    subtitle={item.data.whereTheyAre}
                    getOptions={optionList({ probe: '🔍 Probe with a question', invite: '📅 Invite to a chat (with Calendly)' })}
                    setOptions={withOptionTexts}
                    doneStatus="sent"
                    doneLabel="Sent"
                    onChange={replace}
                    onDelete={() => remove(item.id)}
                />
            ))}
        </div>
    );
}

export function CommentReplyTab() {
    const { items, error, setError, add, replace, remove } = useItems('comment_reply');
    const [commenter, setCommenter] = useState('');
    const [comment, setComment] = useState('');
    const [post, setPost] = useState('');
    const [showPost, setShowPost] = useState(false);
    const [filter, setFilter] = useState('drafted');
    const [busy, setBusy] = useState(false);

    const draft = async () => {
        setBusy(true);
        setError('');
        try {
            const d = await api<{ item: StoredItem }>('/api/outreach/comment-replies', { method: 'POST', body: JSON.stringify({ commenter, comment, post }) });
            add(d.item);
            setCommenter('');
            setComment('');
            setFilter('drafted');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const visible = items.filter((i) => filter === 'all' || i.status === filter);
    return (
        <div>
            <Hint>Paste a comment someone left on your post. Clove drafts two warm, natural replies you can post.</Hint>
            <input value={commenter} onChange={(e) => setCommenter(e.target.value)} placeholder="Comment from (name)" style={{ ...inputStyle, marginBottom: 6 }} />
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Paste their comment here…" rows={4} style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }} />
            <button style={{ ...smallButton, marginBottom: 6 }} onClick={() => setShowPost((v) => !v)}>
                {showPost ? '▾' : '▸'} Your post (optional, helps Clove reply in context)
            </button>
            {showPost && (
                <textarea value={post} onChange={(e) => setPost(e.target.value)} placeholder="Paste your original post…" rows={4} style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }} />
            )}
            <div>
                <Busy busy={busy} idle="💬 Ask Clove for replies" working="Clove is writing… (can take a minute or two)" disabled={comment.trim().length < 3} onClick={draft} />
            </div>
            {error && <div style={{ fontSize: 11, color: '#ffadad', marginTop: 6 }}>{error}</div>}
            <StatusFilter items={items} value={filter} onChange={setFilter} doneStatus="posted" doneLabel="Posted" />
            {visible.length === 0 && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#e6d6f0' }}>Nothing here yet.</div>}
            {visible.map((item) => (
                <ItemCard
                    key={item.id}
                    item={item}
                    context={item.data.comment}
                    getOptions={optionList({ agree: 'Agree & build on it', continue: 'Keep the conversation going' })}
                    setOptions={withOptionTexts}
                    doneStatus="posted"
                    doneLabel="Posted"
                    onChange={replace}
                    onDelete={() => remove(item.id)}
                />
            ))}
        </div>
    );
}

const COMMUNITY_TYPES: Array<[string, string]> = [
    ['announcement', '📣 Announcement'],
    ['inbox', '✉️ Inbox message'],
    ['reminder', '⏰ Reminder'],
    ['welcome', '👋 Welcome post'],
    ['other', '📝 Other'],
];

export function JettTab() {
    const { items, error, setError, add, replace, remove } = useItems('community');
    const [type, setType] = useState('announcement');
    const [brief, setBrief] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [zone, setZone] = useState('PT');
    const [link, setLink] = useState('');
    const [filter, setFilter] = useState('drafted');
    const [busy, setBusy] = useState(false);

    const draft = async () => {
        setBusy(true);
        setError('');
        try {
            const d = await api<{ item: StoredItem }>('/api/community/drafts', {
                method: 'POST',
                body: JSON.stringify({ type, brief, date, time, zone, link }),
            });
            add(d.item);
            setFilter('drafted');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const visible = items.filter((i) => filter === 'all' || i.status === filter);
    const typeLabel = (t: string) => COMMUNITY_TYPES.find(([k]) => k === t)?.[1] || t;
    return (
        <div>
            <Hint>
                Tell Jett what you want to share with your community. Add a date, time, and link if there is one; Jett shows the
                time in PT, CT, and ET and puts your link in exactly as you typed it.
            </Hint>
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }}>
                {COMMUNITY_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder={'What is it about? e.g. "Live sales call training: The 5X Closer, with our guest [name, title]. Topics: qualifying prospects, handling objections…"'}
                rows={5}
                style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }}
            />
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
                <select value={zone} onChange={(e) => setZone(e.target.value)} style={{ ...inputStyle, width: 70 }}>
                    <option value="PT">PT</option>
                    <option value="CT">CT</option>
                    <option value="ET">ET</option>
                </select>
            </div>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Optional link (Zoom, event page…)" style={{ ...inputStyle, marginBottom: 6 }} />
            <Busy busy={busy} idle="🚀 Ask Jett to draft" working="Jett is writing… (can take a minute or two)" disabled={brief.trim().length < 5} onClick={draft} />
            {error && <div style={{ fontSize: 11, color: '#ffadad', marginTop: 6 }}>{error}</div>}
            <StatusFilter items={items} value={filter} onChange={setFilter} doneStatus="posted" doneLabel="Posted" />
            {visible.length === 0 && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#e6d6f0' }}>Nothing here yet.</div>}
            {visible.map((item) => (
                <ItemCard
                    key={item.id}
                    item={item}
                    subtitle={typeLabel(item.data.type)}
                    getOptions={(data) => [{ label: 'Draft', text: data.text }]}
                    setOptions={(data, texts) => ({ ...data, text: texts[0] })}
                    doneStatus="posted"
                    doneLabel="Posted"
                    onChange={replace}
                    onDelete={() => remove(item.id)}
                />
            ))}
        </div>
    );
}

export function IntentReplyTab() {
    const { items, error, setError, add, replace, remove } = useItems('intent_reply');
    const [from, setFrom] = useState('');
    const [message, setMessage] = useState('');
    const [intent, setIntent] = useState('');
    const [filter, setFilter] = useState('drafted');
    const [busy, setBusy] = useState(false);

    const draft = async () => {
        setBusy(true);
        setError('');
        try {
            const d = await api<{ item: StoredItem }>('/api/outreach/intent-replies', { method: 'POST', body: JSON.stringify({ from, message, intent }) });
            add(d.item);
            setFrom('');
            setMessage('');
            setIntent('');
            setFilter('drafted');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const visible = items.filter((i) => filter === 'all' || i.status === filter);
    return (
        <div>
            <Hint>Paste the message you got, then type roughly what you want to say. Raze turns it into a clear, warm reply.</Hint>
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Message from (name)" style={{ ...inputStyle, marginBottom: 6 }} />
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Their message, e.g. Can you clarify the central time for today's live?" rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }} />
            <textarea value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="What you want to say, e.g. it will be at 11am cst" rows={2} style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }} />
            <Busy busy={busy} idle="↩️ Ask Raze to write it" working="Raze is writing… (can take a minute)" disabled={message.trim().length < 2 || intent.trim().length < 2} onClick={draft} />
            {error && <div style={{ fontSize: 11, color: '#ffadad', marginTop: 6 }}>{error}</div>}
            <StatusFilter items={items} value={filter} onChange={setFilter} doneStatus="sent" doneLabel="Sent" />
            {visible.length === 0 && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#e6d6f0' }}>Nothing here yet.</div>}
            {visible.map((item) => (
                <ItemCard
                    key={item.id}
                    item={item}
                    subtitle={`You wanted to say: ${item.data.intent}`}
                    context={item.data.message}
                    getOptions={optionList({ friendly: '😊 Friendly', brief: '⚡ Brief' })}
                    setOptions={withOptionTexts}
                    doneStatus="sent"
                    doneLabel="Sent"
                    onChange={replace}
                    onDelete={() => remove(item.id)}
                />
            ))}
        </div>
    );
}

const TONE_OPTIONS: Array<[string, string]> = [
    ['polite and warm', '🌸 Polite & warm'],
    ['friendly and casual', '😊 Friendly & casual'],
    ['professional and formal', '💼 Professional & formal'],
    ['confident and direct', '💪 Confident & direct'],
];

export function PolishTab() {
    const { items, error, setError, add, replace, remove } = useItems('polish');
    const [draftText, setDraftText] = useState('');
    const [audience, setAudience] = useState('');
    const [tone, setTone] = useState(TONE_OPTIONS[0][0]);
    const [filter, setFilter] = useState('drafted');
    const [busy, setBusy] = useState(false);

    const polish = async () => {
        setBusy(true);
        setError('');
        try {
            const d = await api<{ item: StoredItem }>('/api/outreach/polish', { method: 'POST', body: JSON.stringify({ draft: draftText, audience, tone }) });
            add(d.item);
            setDraftText('');
            setFilter('drafted');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const visible = items.filter((i) => filter === 'all' || i.status === filter);
    return (
        <div>
            <Hint>
                Type your message, or describe it (like "I want to tell my boss that…"). Raze checks your grammar and gives you
                3 versions: your words corrected, a polished one, and a short one.
            </Hint>
            <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="Type your message or what you want to say…" rows={5} style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }} />
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Who is it for? (e.g. my boss)" style={inputStyle} />
                <select value={tone} onChange={(e) => setTone(e.target.value)} style={{ ...inputStyle, width: 190 }}>
                    {TONE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
            </div>
            <Busy busy={busy} idle="✨ Ask Raze to polish it" working="Raze is polishing… (can take a minute)" disabled={draftText.trim().length < 3} onClick={polish} />
            {error && <div style={{ fontSize: 11, color: '#ffadad', marginTop: 6 }}>{error}</div>}
            <StatusFilter items={items} value={filter} onChange={setFilter} doneStatus="sent" doneLabel="Sent" />
            {visible.length === 0 && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#e6d6f0' }}>Nothing here yet.</div>}
            {visible.map((item) => (
                <ItemCard
                    key={item.id}
                    item={item}
                    subtitle={[item.data.audience && `For ${item.data.audience}`, item.data.tone].filter(Boolean).join(' · ')}
                    context={item.data.draft}
                    notes={item.data.notes}
                    getOptions={optionList({ corrected: '✅ Your words, corrected', polished: '✨ Polished', short: '⚡ Short' })}
                    setOptions={withOptionTexts}
                    doneStatus="sent"
                    doneLabel="Sent"
                    onChange={replace}
                    onDelete={() => remove(item.id)}
                />
            ))}
        </div>
    );
}
