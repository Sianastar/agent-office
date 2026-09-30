import React, { useEffect, useState } from 'react';
import { FloatingPanel } from './FloatingPanel';
import { api, cardStyle, CopyButton, inputStyle, labelStyle, primaryButton, smallButton, SubTabs } from './studioShared';
import { CommentReplyTab, DmReplyTab, IntentReplyTab, JettTab, PolishTab, SettingsBox } from './WriterTabs';

type Segment = 'founder' | 'executive';
type Fit = 'good' | 'maybe' | 'disqualified';
type DraftStatus = 'drafted' | 'sent' | 'skipped';

interface SavedSearch {
    id: number;
    segment: Segment;
    focus: string;
    name: string;
    why: string;
    keywords: string;
    keywordsWithExclusions: string;
    titles: string[];
    seniority: string[];
    companyHeadcount: string[];
    industries: string[];
    geography: string[];
    yearsOfExperience: string[];
    spotlights: string[];
}

interface OutreachDraft {
    id: number;
    leadName: string;
    segment: Segment;
    fit: Fit;
    fitReason: string;
    personalHook: string;
    connectionNote: string;
    followUp: string;
    status: DraftStatus;
    createdAt: string;
}

const SEGMENT_LABELS: Record<Segment, string> = {
    founder: 'Founders & CEOs',
    executive: 'Senior executives',
};

const FIT_BADGES: Record<Fit, { label: string; color: string }> = {
    good: { label: '✅ Good fit', color: '#b9fbc0' },
    maybe: { label: '🤔 Maybe', color: '#f9dc7a' },
    disqualified: { label: '🚫 Not a fit', color: '#ffadad' },
};

const NOTE_LIMIT = 300;

function FilterRow({ label, values }: { label: string; values: string[] }) {
    if (values.length === 0) return null;
    return (
        <div style={{ fontSize: 11, marginTop: 3 }}>
            <span style={{ color: '#f7c6dc' }}>{label}: </span>{values.join(', ')}
        </div>
    );
}

function SearchCard({ search, onDelete }: { search: SavedSearch; onDelete: () => void }) {
    return (
        <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <strong style={{ fontSize: 12 }}>{search.name}</strong>
                <button style={smallButton} onClick={onDelete}>Delete</button>
            </div>
            <div style={{ fontSize: 10, opacity: 0.75 }}>
                {SEGMENT_LABELS[search.segment]}{search.focus ? ` · ${search.focus}` : ''}
            </div>
            {search.why && <div style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>{search.why}</div>}

            <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Keywords (paste into Sales Navigator)</span>
                <CopyButton text={search.keywordsWithExclusions} />
            </div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', background: 'rgba(0,0,0,0.18)', padding: 6, borderRadius: 6, wordBreak: 'break-word' }}>
                {search.keywordsWithExclusions}
            </div>

            <div style={labelStyle}>Filters to set</div>
            <FilterRow label="Current job title" values={search.titles} />
            <FilterRow label="Seniority level" values={search.seniority} />
            <FilterRow label="Company headcount" values={search.companyHeadcount} />
            <FilterRow label="Industry" values={search.industries} />
            <FilterRow label="Geography" values={search.geography} />
            <FilterRow label="Years of experience" values={search.yearsOfExperience} />
            <FilterRow label="Spotlight" values={search.spotlights} />
        </div>
    );
}

function DraftCard({ draft, onChange, onDelete }: {
    draft: OutreachDraft;
    onChange: (updated: OutreachDraft) => void;
    onDelete: () => void;
}) {
    const [note, setNote] = useState(draft.connectionNote);
    const [followUp, setFollowUp] = useState(draft.followUp);
    const [error, setError] = useState('');

    const save = async (fields: Partial<Pick<OutreachDraft, 'status' | 'connectionNote' | 'followUp'>>) => {
        try {
            const data = await api<{ draft: OutreachDraft }>(`/api/outreach/drafts/${draft.id}`, {
                method: 'PATCH',
                body: JSON.stringify(fields),
            });
            setError('');
            onChange(data.draft);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const badge = FIT_BADGES[draft.fit];
    const noteTooLong = note.length > NOTE_LIMIT;

    return (
        <div style={{ ...cardStyle, opacity: draft.status === 'drafted' ? 1 : 0.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                <strong style={{ fontSize: 12 }}>{draft.leadName}</strong>
                <span style={{ fontSize: 10, color: badge.color, fontWeight: 700 }}>{badge.label}</span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.75 }}>
                {SEGMENT_LABELS[draft.segment]} · {draft.status === 'sent' ? '📨 Sent' : draft.status === 'skipped' ? '⏭️ Skipped' : '📝 To send'}
            </div>
            {draft.fitReason && <div style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>{draft.fitReason}</div>}

            {draft.fit !== 'disqualified' && (
                <>
                    <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                            Connection note{' '}
                            <span style={{ color: noteTooLong ? '#ffadad' : '#e6d6f0', fontWeight: 400 }}>
                                ({note.length}/{NOTE_LIMIT}{noteTooLong ? ' — too long, trim before sending' : ''})
                            </span>
                        </span>
                        <CopyButton text={note} />
                    </div>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onBlur={() => note !== draft.connectionNote && save({ connectionNote: note })}
                        rows={4}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />

                    <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Follow-up after they accept</span>
                        <CopyButton text={followUp} />
                    </div>
                    <textarea
                        value={followUp}
                        onChange={(e) => setFollowUp(e.target.value)}
                        onBlur={() => followUp !== draft.followUp && save({ followUp })}
                        rows={6}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                </>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {draft.fit !== 'disqualified' && draft.status !== 'sent' && (
                    <button style={smallButton} onClick={() => save({ status: 'sent' })}>Mark sent</button>
                )}
                {draft.status === 'drafted' && (
                    <button style={smallButton} onClick={() => save({ status: 'skipped' })}>Skip</button>
                )}
                {draft.status !== 'drafted' && (
                    <button style={smallButton} onClick={() => save({ status: 'drafted' })}>Move back to "to send"</button>
                )}
                <button style={smallButton} onClick={onDelete}>Delete</button>
            </div>
            {error && <div style={{ fontSize: 10, color: '#ffadad', marginTop: 4 }}>{error}</div>}
        </div>
    );
}

function LeadSearchTab() {
    const [segment, setSegment] = useState<Segment>('founder');
    const [focus, setFocus] = useState('');
    const [searches, setSearches] = useState<SavedSearch[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api<{ searches: SavedSearch[] }>('/api/outreach/searches')
            .then((data) => setSearches(data.searches))
            .catch((e) => setError(e.message));
    }, []);

    const generate = async () => {
        setBusy(true);
        setError('');
        try {
            const data = await api<{ searches: SavedSearch[] }>('/api/outreach/searches', {
                method: 'POST',
                body: JSON.stringify({ segment, focus }),
            });
            setSearches((prev) => [...data.searches, ...prev]);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: number) => {
        try {
            await api(`/api/outreach/searches/${id}`, { method: 'DELETE' });
            setSearches((prev) => prev.filter((s) => s.id !== id));
        } catch (e: any) {
            setError(e.message);
        }
    };

    return (
        <div>
            <div style={{ fontSize: 11, marginBottom: 8, color: '#e6d6f0' }}>
                Killjoy writes Sales Navigator searches for your ideal client. In Sales Navigator, open <strong>Lead filters</strong>,
                paste the keywords, set the filters, then select the leads you like and click <strong>Save to list</strong>.
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <select value={segment} onChange={(e) => setSegment(e.target.value as Segment)} style={{ ...inputStyle, width: 170 }}>
                    <option value="founder">{SEGMENT_LABELS.founder}</option>
                    <option value="executive">{SEGMENT_LABELS.executive}</option>
                </select>
                <input
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    placeholder="Optional focus, e.g. climate tech, US, Series A-B"
                    style={inputStyle}
                />
            </div>
            <button style={{ ...primaryButton, opacity: busy ? 0.6 : 1 }} onClick={generate} disabled={busy}>
                {busy ? 'Killjoy is working… (can take a minute or two)' : '🔎 Ask Killjoy for 4 searches'}
            </button>
            {error && <div style={{ fontSize: 11, color: '#ffadad', marginTop: 6 }}>{error}</div>}

            <div style={{ marginTop: 10 }}>
                {searches.length === 0 && !busy && (
                    <div style={{ fontSize: 11, fontStyle: 'italic', color: '#e6d6f0' }}>No searches yet.</div>
                )}
                {searches.map((s) => <SearchCard key={s.id} search={s} onDelete={() => remove(s.id)} />)}
            </div>
        </div>
    );
}

type DraftFilter = 'drafted' | 'sent' | 'skipped' | 'disqualified' | 'all';

function OutreachTab() {
    const [segment, setSegment] = useState<Segment | 'auto'>('auto');
    const [leadProfile, setLeadProfile] = useState('');
    const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
    const [filter, setFilter] = useState<DraftFilter>('drafted');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api<{ drafts: OutreachDraft[] }>('/api/outreach/drafts')
            .then((data) => setDrafts(data.drafts))
            .catch((e) => setError(e.message));
    }, []);

    const draft = async () => {
        setBusy(true);
        setError('');
        try {
            const data = await api<{ draft: OutreachDraft }>('/api/outreach/drafts', {
                method: 'POST',
                body: JSON.stringify({ leadProfile, segment }),
            });
            setDrafts((prev) => [data.draft, ...prev]);
            setLeadProfile('');
            setFilter(data.draft.fit === 'disqualified' ? 'disqualified' : 'drafted');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const replace = (updated: OutreachDraft) => setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));

    const remove = async (id: number) => {
        try {
            await api(`/api/outreach/drafts/${id}`, { method: 'DELETE' });
            setDrafts((prev) => prev.filter((d) => d.id !== id));
        } catch (e: any) {
            setError(e.message);
        }
    };

    const visible = drafts.filter((d) => {
        if (filter === 'all') return true;
        if (filter === 'disqualified') return d.fit === 'disqualified';
        return d.fit !== 'disqualified' && d.status === filter;
    });
    const count = (f: DraftFilter) => drafts.filter((d) => {
        if (f === 'all') return true;
        if (f === 'disqualified') return d.fit === 'disqualified';
        return d.fit !== 'disqualified' && d.status === f;
    }).length;

    const filters: Array<[DraftFilter, string]> = [
        ['drafted', 'To send'], ['sent', 'Sent'], ['skipped', 'Skipped'], ['disqualified', 'Not a fit'], ['all', 'All'],
    ];

    return (
        <div>
            <div style={{ fontSize: 11, marginBottom: 8, color: '#e6d6f0' }}>
                Paste a lead's LinkedIn profile (name, headline, company, About, a recent post). Raze checks the fit and drafts a
                connection note and a follow-up. You review, copy, and send them yourself on LinkedIn.
            </div>
            <select value={segment} onChange={(e) => setSegment(e.target.value as Segment | 'auto')} style={{ ...inputStyle, marginBottom: 6 }}>
                <option value="auto">Let Raze decide the segment</option>
                <option value="founder">{SEGMENT_LABELS.founder}</option>
                <option value="executive">{SEGMENT_LABELS.executive}</option>
            </select>
            <textarea
                value={leadProfile}
                onChange={(e) => setLeadProfile(e.target.value)}
                placeholder="Paste the lead's profile here…"
                rows={6}
                style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }}
            />
            <button
                style={{ ...primaryButton, opacity: busy || leadProfile.trim().length < 20 ? 0.6 : 1 }}
                onClick={draft}
                disabled={busy || leadProfile.trim().length < 20}
            >
                {busy ? 'Raze is writing… (can take a minute or two)' : '✍️ Ask Raze to draft'}
            </button>
            {error && <div style={{ fontSize: 11, color: '#ffadad', marginTop: 6 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 4, marginTop: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                {filters.map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        style={{ ...smallButton, background: filter === key ? '#e58fb6' : smallButton.background }}
                    >
                        {label} ({count(key)})
                    </button>
                ))}
            </div>
            {visible.length === 0 && (
                <div style={{ fontSize: 11, fontStyle: 'italic', color: '#e6d6f0' }}>Nothing here yet.</div>
            )}
            {visible.map((d) => (
                <DraftCard key={d.id} draft={d} onChange={replace} onDelete={() => remove(d.id)} />
            ))}
        </div>
    );
}

type CommentFit = Fit | 'unknown';
type CommentStatus = 'drafted' | 'posted' | 'skipped';

interface CommentSet {
    id: number;
    authorName: string;
    fit: CommentFit;
    fitReason: string;
    comments: Array<{ style: string; text: string }>;
    postText: string;
    status: CommentStatus;
}

const COMMENT_FIT_BADGES: Record<CommentFit, { label: string; color: string }> = {
    ...FIT_BADGES,
    unknown: { label: '❔ Unknown fit', color: '#e6d6f0' },
};

const STYLE_LABELS: Record<string, string> = {
    insight: 'Adds an insight',
    question: 'Asks a question',
    short: 'Short & specific',
};

function CommentCard({ set, onChange, onDelete }: {
    set: CommentSet;
    onChange: (updated: CommentSet) => void;
    onDelete: () => void;
}) {
    const [texts, setTexts] = useState(set.comments.map((c) => c.text));
    const [error, setError] = useState('');

    const save = async (fields: { status?: CommentStatus; comments?: CommentSet['comments'] }) => {
        try {
            const data = await api<{ set: CommentSet }>(`/api/outreach/comments/${set.id}`, {
                method: 'PATCH',
                body: JSON.stringify(fields),
            });
            setError('');
            onChange(data.set);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const saveTexts = () => {
        const edited = set.comments.map((c, i) => ({ ...c, text: texts[i] }));
        if (edited.some((c, i) => c.text !== set.comments[i].text)) save({ comments: edited });
    };

    const badge = COMMENT_FIT_BADGES[set.fit];
    const excerpt = set.postText.length > 160 ? `${set.postText.slice(0, 160)}…` : set.postText;

    return (
        <div style={{ ...cardStyle, opacity: set.status === 'drafted' ? 1 : 0.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                <strong style={{ fontSize: 12 }}>{set.authorName}</strong>
                <span style={{ fontSize: 10, color: badge.color, fontWeight: 700 }}>{badge.label}</span>
            </div>
            <div style={{ fontSize: 10, opacity: 0.75 }}>
                {set.status === 'posted' ? '💬 Posted' : set.status === 'skipped' ? '⏭️ Skipped' : '📝 To post'}
                {set.fitReason ? ` · ${set.fitReason}` : ''}
            </div>
            <div style={{ fontSize: 10, marginTop: 4, padding: 6, borderRadius: 6, background: 'rgba(0,0,0,0.18)', whiteSpace: 'pre-wrap' }}>
                {excerpt}
            </div>

            {set.comments.map((c, i) => (
                <div key={i}>
                    <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{STYLE_LABELS[c.style] || 'Comment'}</span>
                        <CopyButton text={texts[i]} />
                    </div>
                    <textarea
                        value={texts[i]}
                        onChange={(e) => setTexts((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))}
                        onBlur={saveTexts}
                        rows={c.style === 'short' ? 2 : 3}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                </div>
            ))}

            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {set.status !== 'posted' && <button style={smallButton} onClick={() => save({ status: 'posted' })}>Mark posted</button>}
                {set.status === 'drafted' && <button style={smallButton} onClick={() => save({ status: 'skipped' })}>Skip</button>}
                {set.status !== 'drafted' && <button style={smallButton} onClick={() => save({ status: 'drafted' })}>Move back to "to post"</button>}
                <button style={smallButton} onClick={onDelete}>Delete</button>
            </div>
            {error && <div style={{ fontSize: 10, color: '#ffadad', marginTop: 4 }}>{error}</div>}
        </div>
    );
}

function CommentsTab() {
    const [postText, setPostText] = useState('');
    const [sets, setSets] = useState<CommentSet[]>([]);
    const [filter, setFilter] = useState<CommentStatus | 'all'>('drafted');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api<{ comments: CommentSet[] }>('/api/outreach/comments')
            .then((data) => setSets(data.comments))
            .catch((e) => setError(e.message));
    }, []);

    const draft = async () => {
        setBusy(true);
        setError('');
        try {
            const data = await api<{ set: CommentSet }>('/api/outreach/comments', {
                method: 'POST',
                body: JSON.stringify({ postText }),
            });
            setSets((prev) => [data.set, ...prev]);
            setPostText('');
            setFilter('drafted');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const replace = (updated: CommentSet) => setSets((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

    const remove = async (id: number) => {
        try {
            await api(`/api/outreach/comments/${id}`, { method: 'DELETE' });
            setSets((prev) => prev.filter((s) => s.id !== id));
        } catch (e: any) {
            setError(e.message);
        }
    };

    const filters: Array<[CommentStatus | 'all', string]> = [['drafted', 'To post'], ['posted', 'Posted'], ['skipped', 'Skipped'], ['all', 'All']];
    const matches = (s: CommentSet, f: CommentStatus | 'all') => f === 'all' || s.status === f;
    const visible = sets.filter((s) => matches(s, filter));

    return (
        <div>
            <div style={{ fontSize: 11, marginBottom: 8, color: '#e6d6f0' }}>
                Paste a LinkedIn post from a founder or exec you want to warm up (include their name and headline if you can).
                Clove writes 3 comment options in your voice from ⚙️ Settings. Pick one, tweak it, and post it yourself on LinkedIn.
            </div>

            <textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder="Paste the LinkedIn post here…"
                rows={6}
                style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }}
            />
            <button
                style={{ ...primaryButton, opacity: busy || postText.trim().length < 20 ? 0.6 : 1 }}
                onClick={draft}
                disabled={busy || postText.trim().length < 20}
            >
                {busy ? 'Clove is writing… (can take a minute or two)' : '💬 Ask Clove for comments'}
            </button>
            {error && <div style={{ fontSize: 11, color: '#ffadad', marginTop: 6 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 4, marginTop: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                {filters.map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        style={{ ...smallButton, background: filter === key ? '#e58fb6' : smallButton.background }}
                    >
                        {label} ({sets.filter((s) => matches(s, key)).length})
                    </button>
                ))}
            </div>
            {visible.length === 0 && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#e6d6f0' }}>Nothing here yet.</div>}
            {visible.map((s) => (
                <CommentCard key={s.id} set={s} onChange={replace} onDelete={() => remove(s.id)} />
            ))}
        </div>
    );
}

type MainTab = 'killjoy' | 'raze' | 'clove' | 'jett';

function RazeTab() {
    const [mode, setMode] = useState<'notes' | 'dms' | 'intent' | 'polish'>('notes');
    return (
        <div>
            <SubTabs
                value={mode}
                onChange={setMode}
                options={[['notes', '🤝 Notes'], ['dms', '📨 DM replies'], ['intent', '↩️ Reply my way'], ['polish', '✨ Polish']]}
            />
            <div style={{ display: mode === 'notes' ? 'block' : 'none' }}><OutreachTab /></div>
            <div style={{ display: mode === 'dms' ? 'block' : 'none' }}><DmReplyTab /></div>
            <div style={{ display: mode === 'intent' ? 'block' : 'none' }}><IntentReplyTab /></div>
            <div style={{ display: mode === 'polish' ? 'block' : 'none' }}><PolishTab /></div>
        </div>
    );
}

function CloveTab() {
    const [mode, setMode] = useState<'comment' | 'reply'>('comment');
    return (
        <div>
            <SubTabs value={mode} onChange={setMode} options={[['comment', "💬 Comment on posts"], ['reply', '↩️ Reply to comments']]} />
            <div style={{ display: mode === 'comment' ? 'block' : 'none' }}><CommentsTab /></div>
            <div style={{ display: mode === 'reply' ? 'block' : 'none' }}><CommentReplyTab /></div>
        </div>
    );
}

export function OutreachStudio() {
    const [tab, setTab] = useState<MainTab>('killjoy');

    const tabButton = (key: MainTab, label: string) => (
        <button
            onClick={() => setTab(key)}
            style={{
                flex: 1, border: 'none', borderRadius: 8, padding: '7px 4px', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: tab === key ? '#e58fb6' : 'rgba(255,255,255,0.1)', color: 'white',
            }}
        >
            {label}
        </button>
    );

    return (
        <FloatingPanel
            id="outreach-studio"
            title="💼 Outreach Studio"
            subtitle="Your team drafts · you review and send"
            width={480}
            defaultDock="right"
            defaultY={20}
            zIndex={20}
        >
            <SettingsBox />
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {tabButton('killjoy', '🔎 Killjoy')}
                {tabButton('raze', '✍️ Raze')}
                {tabButton('clove', '💬 Clove')}
                {tabButton('jett', '🚀 Jett')}
            </div>
            <div style={{ maxHeight: '62vh', overflowY: 'auto', paddingRight: 4 }}>
                <div style={{ display: tab === 'killjoy' ? 'block' : 'none' }}><LeadSearchTab /></div>
                <div style={{ display: tab === 'raze' ? 'block' : 'none' }}><RazeTab /></div>
                <div style={{ display: tab === 'clove' ? 'block' : 'none' }}><CloveTab /></div>
                <div style={{ display: tab === 'jett' ? 'block' : 'none' }}><JettTab /></div>
            </div>
        </FloatingPanel>
    );
}
