import React, { useEffect, useState } from 'react';

export const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 7,
    border: '1px solid #c9a7eb', backgroundColor: '#7a5a93', color: 'white', fontSize: 11,
    fontFamily: 'inherit',
};

export const primaryButton: React.CSSProperties = {
    border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
    backgroundColor: '#e58fb6', color: 'white', fontWeight: 700, fontSize: 11,
};

export const smallButton: React.CSSProperties = {
    border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.1)', color: '#f2e9ff', fontSize: 10,
};

export const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(247,168,196,0.35)',
    borderRadius: 10, padding: 10, marginBottom: 8,
};

export const labelStyle: React.CSSProperties = { fontSize: 10, color: '#f7c6dc', fontWeight: 700, marginTop: 6, marginBottom: 2 };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const data = await response.json().catch(() => ({ ok: false, error: `Server error (${response.status})` }));
    if (!response.ok || !data?.ok) throw new Error(data?.error || `Server error (${response.status})`);
    return data as T;
}

export function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            window.prompt('Copy this text:', text);
        }
    };
    return <button style={smallButton} onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>;
}


export interface StoredItem {
    id: number;
    kind: string;
    title: string;
    data: any;
    status: string;
    createdAt: string;
}

export interface DraftOption {
    label: string;
    text: string;
    warning?: string;
}

export function SubTabs<T extends string>({ value, onChange, options }: {
    value: T;
    onChange: (value: T) => void;
    options: Array<[T, string]>;
}) {
    return (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {options.map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    style={{ ...smallButton, flex: 1, padding: '5px 6px', background: value === key ? 'rgba(229,143,182,0.7)' : smallButton.background }}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

export function useItems(kind: string) {
    const [items, setItems] = useState<StoredItem[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        api<{ items: StoredItem[] }>(`/api/items?kind=${kind}`)
            .then((data) => setItems(data.items))
            .catch((e) => setError(e.message));
    }, [kind]);

    const add = (item: StoredItem) => setItems((prev) => [item, ...prev]);
    const replace = (item: StoredItem) => setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
    const remove = async (id: number) => {
        try {
            await api(`/api/items/${id}`, { method: 'DELETE' });
            setItems((prev) => prev.filter((i) => i.id !== id));
        } catch (e: any) {
            setError(e.message);
        }
    };
    return { items, error, setError, add, replace, remove };
}

export function ItemCard({ item, subtitle, context, notes, getOptions, setOptions, doneStatus, doneLabel, onChange, onDelete }: {
    item: StoredItem;
    subtitle?: string;
    context?: string;
    notes?: string[];
    getOptions: (data: any) => DraftOption[];
    setOptions: (data: any, texts: string[]) => any;
    doneStatus: string;
    doneLabel: string;
    onChange: (item: StoredItem) => void;
    onDelete: () => void;
}) {
    const options = getOptions(item.data);
    const [texts, setTexts] = useState(options.map((o) => o.text));
    const [error, setError] = useState('');

    const save = async (fields: { status?: string; data?: any }) => {
        try {
            const data = await api<{ item: StoredItem }>(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(fields) });
            setError('');
            onChange(data.item);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const saveTexts = () => {
        if (texts.some((t, i) => t !== options[i].text)) save({ data: setOptions(item.data, texts) });
    };

    const statusLabel = item.status === doneStatus ? `✅ ${doneLabel}` : item.status === 'skipped' ? '⏭️ Skipped' : '📝 To do';
    const excerpt = context && context.length > 220 ? `${context.slice(0, 220)}…` : context;

    return (
        <div style={{ ...cardStyle, opacity: item.status === 'drafted' ? 1 : 0.7 }}>
            <strong style={{ fontSize: 12 }}>{item.title}</strong>
            <div style={{ fontSize: 10, opacity: 0.8 }}>{statusLabel}{subtitle ? ` · ${subtitle}` : ''}</div>
            {excerpt && (
                <div style={{ fontSize: 10, marginTop: 4, padding: 6, borderRadius: 6, background: 'rgba(0,0,0,0.18)', whiteSpace: 'pre-wrap' }}>
                    {excerpt}
                </div>
            )}
            {notes && notes.length > 0 && (
                <div style={{ fontSize: 10, marginTop: 6, color: '#e6d6f0' }}>
                    <strong style={{ color: '#f7c6dc' }}>What Raze fixed:</strong>
                    {notes.map((n, i) => <div key={i}>• {n}</div>)}
                </div>
            )}
            {options.map((o, i) => (
                <div key={i}>
                    <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>
                            {o.label}
                            {o.warning && <span style={{ color: '#ffd166', fontWeight: 400 }}> ⚠️ {o.warning}</span>}
                        </span>
                        <CopyButton text={texts[i]} />
                    </div>
                    <textarea
                        value={texts[i]}
                        onChange={(e) => setTexts((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))}
                        onBlur={saveTexts}
                        rows={Math.min(14, Math.max(2, Math.ceil(texts[i].length / 60) + texts[i].split('\n').length))}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {item.status !== doneStatus && <button style={smallButton} onClick={() => save({ status: doneStatus })}>Mark {doneLabel.toLowerCase()}</button>}
                {item.status === 'drafted' && <button style={smallButton} onClick={() => save({ status: 'skipped' })}>Skip</button>}
                {item.status !== 'drafted' && <button style={smallButton} onClick={() => save({ status: 'drafted' })}>Move back to "to do"</button>}
                <button style={smallButton} onClick={onDelete}>Delete</button>
            </div>
            {error && <div style={{ fontSize: 10, color: '#ffadad', marginTop: 4 }}>{error}</div>}
        </div>
    );
}

export function StatusFilter({ items, value, onChange, doneStatus, doneLabel }: {
    items: StoredItem[];
    value: string;
    onChange: (value: string) => void;
    doneStatus: string;
    doneLabel: string;
}) {
    const filters: Array<[string, string]> = [['drafted', 'To do'], [doneStatus, doneLabel], ['skipped', 'Skipped'], ['all', 'All']];
    return (
        <div style={{ display: 'flex', gap: 4, marginTop: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            {filters.map(([key, label]) => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    style={{ ...smallButton, background: value === key ? '#e58fb6' : smallButton.background }}
                >
                    {label} ({items.filter((i) => key === 'all' || i.status === key).length})
                </button>
            ))}
        </div>
    );
}
