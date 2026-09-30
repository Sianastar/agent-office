import React, { useEffect, useState } from 'react';
import { FloatingPanel } from './FloatingPanel';
import { eventBus } from '../events';
import { api, inputStyle, ItemCard, primaryButton, smallButton, StatusFilter, StoredItem, useItems } from './studioShared';

interface TeamState {
    officeOpen: boolean;
    meeting: boolean;
    onBreak: string[];
    agents: Array<{ id: string; name: string; role: string }>;
}

export function TeamPanel() {
    const [team, setTeam] = useState<TeamState>({ officeOpen: false, meeting: false, onBreak: [], agents: [] });
    const [message, setMessage] = useState('');
    const [breakWho, setBreakWho] = useState('all');
    const [assignee, setAssignee] = useState('jett');
    const [task, setTask] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [filter, setFilter] = useState('drafted');
    const { items, error, setError, add, replace, remove } = useItems('agent_task');

    const refresh = () => api<TeamState>('/api/team/state')
        .then((state) => {
            setTeam(state);
            eventBus.dispatchEvent(new CustomEvent('meeting-state', { detail: { active: state.meeting } }));
        })
        .catch(() => undefined);

    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, 5000);
        return () => clearInterval(timer);
    }, []);

    const run = async (fn: () => Promise<unknown>) => {
        setNotice('');
        try {
            await fn();
            await refresh();
        } catch (e: any) {
            setNotice(e.message);
        }
    };

    const toggleMeeting = () => run(() => api('/api/team/meeting', { method: 'POST', body: JSON.stringify({ active: !team.meeting }) }));
    const sendBreak = () => run(() => api('/api/team/break', { method: 'POST', body: JSON.stringify({ agentId: breakWho === 'all' ? undefined : breakWho }) }));
    const say = () => run(async () => {
        await api('/api/team/say', { method: 'POST', body: JSON.stringify({ text: message }) });
        setMessage('');
    });

    const assign = async () => {
        setBusy(true);
        setError('');
        try {
            const d = await api<{ item: StoredItem }>('/api/team/tasks', { method: 'POST', body: JSON.stringify({ agentId: assignee, task }) });
            add(d.item);
            setTask('');
            setFilter('drafted');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };

    const nameOf = (id: string) => team.agents.find((a) => a.id === id)?.name || id;
    const visible = items.filter((i) => filter === 'all' || i.status === filter);

    return (
        <FloatingPanel id="team-meeting" title="📣 Team Meeting" subtitle="Meet, assign tasks, send on breaks" width={360} defaultDock="left" defaultY={330} zIndex={19}>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
                <div style={{ fontSize: 11, color: '#e6d6f0', marginBottom: 8 }}>
                    {!team.officeOpen
                        ? 'The office is still loading…'
                        : team.meeting
                            ? '📣 Meeting in progress in the meeting room.'
                            : team.onBreak.length > 0
                                ? `☕ On break: ${team.onBreak.map(nameOf).join(', ')}`
                                : 'Everyone is at work.'}
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <button style={primaryButton} onClick={toggleMeeting}>{team.meeting ? '👋 End meeting' : '📣 Call meeting'}</button>
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && message.trim()) say(); }}
                        placeholder="Talk to the team…"
                        style={inputStyle}
                    />
                    <button style={smallButton} onClick={say} disabled={!message.trim()}>Send</button>
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <select value={breakWho} onChange={(e) => setBreakWho(e.target.value)} style={{ ...inputStyle, width: 150 }}>
                        <option value="all">Everyone</option>
                        {team.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <button style={smallButton} onClick={sendBreak} disabled={team.meeting}>☕ Send on coffee break</button>
                </div>
                <div style={{ fontSize: 10, color: '#e6d6f0', marginBottom: 10 }}>
                    A break lasts about a minute and clears their built-up office chatter so they start fresh. They also take one on
                    their own after 4 jobs in a row or when their risk level gets high.
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: '#f7c6dc', marginBottom: 4 }}>📋 Assign a task</div>
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }}>
                    {team.agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
                </select>
                <textarea
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    placeholder='e.g. "Write 3 LinkedIn post ideas about overthinking before meetings"'
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', marginBottom: 6 }}
                />
                <button style={{ ...primaryButton, opacity: busy || task.trim().length < 5 ? 0.6 : 1 }} onClick={assign} disabled={busy || task.trim().length < 5}>
                    {busy ? `${nameOf(assignee)} is working… (can take a minute or two)` : `👍 Assign to ${nameOf(assignee)}`}
                </button>
                {(error || notice) && <div style={{ fontSize: 11, color: '#ffadad', marginTop: 6 }}>{error || notice}</div>}

                <StatusFilter items={items} value={filter} onChange={setFilter} doneStatus="sent" doneLabel="Done" />
                {visible.length === 0 && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#e6d6f0' }}>No task results yet.</div>}
                {visible.map((item) => (
                    <ItemCard
                        key={item.id}
                        item={{ ...item, title: `${item.data.agentName}: ${item.title}` }}
                        context={item.data.task}
                        getOptions={(data) => [{ label: 'Result', text: data.result }]}
                        setOptions={(data, texts) => ({ ...data, result: texts[0] })}
                        doneStatus="sent"
                        doneLabel="Done"
                        onChange={replace}
                        onDelete={() => remove(item.id)}
                    />
                ))}
            </div>
        </FloatingPanel>
    );
}
