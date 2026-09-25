import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { Segment } from './profile';

export interface LeadSearch {
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

export interface SavedSearch extends LeadSearch {
    id: number;
    segment: Segment;
    focus: string;
    createdAt: string;
}

export type Fit = 'good' | 'maybe' | 'disqualified';
export type DraftStatus = 'drafted' | 'sent' | 'skipped';

export interface DraftContent {
    leadName: string;
    segment: Segment;
    fit: Fit;
    fitReason: string;
    personalHook: string;
    connectionNote: string;
    followUp: string;
}

export interface OutreachDraft extends DraftContent {
    id: number;
    leadProfile: string;
    status: DraftStatus;
    createdAt: string;
}

export type CommentFit = Fit | 'unknown';
export type CommentStatus = 'drafted' | 'posted' | 'skipped';

export interface CommentOption {
    style: string;
    text: string;
}

export interface CommentContent {
    authorName: string;
    fit: CommentFit;
    fitReason: string;
    comments: CommentOption[];
}

export interface CommentDraft extends CommentContent {
    id: number;
    postText: string;
    status: CommentStatus;
    createdAt: string;
}

export class OutreachStore {
    private db?: Database;

    async initialize(dbPath: string = './data/outreach.db') {
        const { mkdir } = await import('fs/promises');
        const path = await import('path');
        await mkdir(path.dirname(dbPath), { recursive: true });

        this.db = await open({ filename: dbPath, driver: sqlite3.Database });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS outreach_searches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                segment TEXT NOT NULL,
                focus TEXT NOT NULL DEFAULT '',
                data_json TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS outreach_drafts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_name TEXT NOT NULL,
                segment TEXT NOT NULL,
                fit TEXT NOT NULL,
                fit_reason TEXT NOT NULL,
                personal_hook TEXT NOT NULL,
                connection_note TEXT NOT NULL,
                follow_up TEXT NOT NULL,
                lead_profile TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'drafted',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS comment_drafts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_name TEXT NOT NULL,
                fit TEXT NOT NULL,
                fit_reason TEXT NOT NULL,
                comments_json TEXT NOT NULL,
                post_text TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'drafted',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);
    }

    private get conn(): Database {
        if (!this.db) throw new Error('Outreach store is not initialized');
        return this.db;
    }

    async saveSearch(segment: Segment, focus: string, search: LeadSearch): Promise<SavedSearch> {
        const result = await this.conn.run(
            'INSERT INTO outreach_searches (segment, focus, data_json) VALUES (?, ?, ?)',
            [segment, focus, JSON.stringify(search)]
        );
        const row = await this.conn.get('SELECT * FROM outreach_searches WHERE id = ?', [result.lastID]);
        return this.toSearch(row);
    }

    async listSearches(limit = 50): Promise<SavedSearch[]> {
        const rows = await this.conn.all('SELECT * FROM outreach_searches ORDER BY id DESC LIMIT ?', [limit]);
        return rows.map((r) => this.toSearch(r));
    }

    async deleteSearch(id: number): Promise<boolean> {
        const result = await this.conn.run('DELETE FROM outreach_searches WHERE id = ?', [id]);
        return (result.changes || 0) > 0;
    }

    async saveDraft(content: DraftContent, leadProfile: string): Promise<OutreachDraft> {
        const result = await this.conn.run(
            `INSERT INTO outreach_drafts
                (lead_name, segment, fit, fit_reason, personal_hook, connection_note, follow_up, lead_profile)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [content.leadName, content.segment, content.fit, content.fitReason, content.personalHook,
                content.connectionNote, content.followUp, leadProfile]
        );
        const row = await this.conn.get('SELECT * FROM outreach_drafts WHERE id = ?', [result.lastID]);
        return this.toDraft(row);
    }

    async listDrafts(limit = 200): Promise<OutreachDraft[]> {
        const rows = await this.conn.all('SELECT * FROM outreach_drafts ORDER BY id DESC LIMIT ?', [limit]);
        return rows.map((r) => this.toDraft(r));
    }

    async updateDraft(id: number, fields: { status?: DraftStatus; connectionNote?: string; followUp?: string }): Promise<OutreachDraft | null> {
        const sets: string[] = [];
        const values: any[] = [];
        if (fields.status !== undefined) { sets.push('status = ?'); values.push(fields.status); }
        if (fields.connectionNote !== undefined) { sets.push('connection_note = ?'); values.push(fields.connectionNote); }
        if (fields.followUp !== undefined) { sets.push('follow_up = ?'); values.push(fields.followUp); }
        if (sets.length > 0) {
            await this.conn.run(`UPDATE outreach_drafts SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
        }
        const row = await this.conn.get('SELECT * FROM outreach_drafts WHERE id = ?', [id]);
        return row ? this.toDraft(row) : null;
    }

    async deleteDraft(id: number): Promise<boolean> {
        const result = await this.conn.run('DELETE FROM outreach_drafts WHERE id = ?', [id]);
        return (result.changes || 0) > 0;
    }

    async saveComments(content: CommentContent, postText: string): Promise<CommentDraft> {
        const result = await this.conn.run(
            'INSERT INTO comment_drafts (author_name, fit, fit_reason, comments_json, post_text) VALUES (?, ?, ?, ?, ?)',
            [content.authorName, content.fit, content.fitReason, JSON.stringify(content.comments), postText]
        );
        const row = await this.conn.get('SELECT * FROM comment_drafts WHERE id = ?', [result.lastID]);
        return this.toComments(row);
    }

    async listComments(limit = 200): Promise<CommentDraft[]> {
        const rows = await this.conn.all('SELECT * FROM comment_drafts ORDER BY id DESC LIMIT ?', [limit]);
        return rows.map((r) => this.toComments(r));
    }

    async updateComments(id: number, fields: { status?: CommentStatus; comments?: CommentOption[] }): Promise<CommentDraft | null> {
        if (fields.status !== undefined) {
            await this.conn.run('UPDATE comment_drafts SET status = ? WHERE id = ?', [fields.status, id]);
        }
        if (fields.comments !== undefined) {
            await this.conn.run('UPDATE comment_drafts SET comments_json = ? WHERE id = ?', [JSON.stringify(fields.comments), id]);
        }
        const row = await this.conn.get('SELECT * FROM comment_drafts WHERE id = ?', [id]);
        return row ? this.toComments(row) : null;
    }

    async deleteComments(id: number): Promise<boolean> {
        const result = await this.conn.run('DELETE FROM comment_drafts WHERE id = ?', [id]);
        return (result.changes || 0) > 0;
    }

    async getSetting(key: string): Promise<string> {
        const row = await this.conn.get('SELECT value FROM settings WHERE key = ?', [key]);
        return row ? row.value : '';
    }

    async setSetting(key: string, value: string): Promise<void> {
        await this.conn.run(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            [key, value]
        );
    }

    private toComments(row: any): CommentDraft {
        return {
            id: row.id,
            authorName: row.author_name,
            fit: row.fit,
            fitReason: row.fit_reason,
            comments: JSON.parse(row.comments_json),
            postText: row.post_text,
            status: row.status,
            createdAt: row.created_at,
        };
    }

    private toSearch(row: any): SavedSearch {
        return {
            ...(JSON.parse(row.data_json) as LeadSearch),
            id: row.id,
            segment: row.segment,
            focus: row.focus,
            createdAt: row.created_at,
        };
    }

    private toDraft(row: any): OutreachDraft {
        return {
            id: row.id,
            leadName: row.lead_name,
            segment: row.segment,
            fit: row.fit,
            fitReason: row.fit_reason,
            personalHook: row.personal_hook,
            connectionNote: row.connection_note,
            followUp: row.follow_up,
            leadProfile: row.lead_profile,
            status: row.status,
            createdAt: row.created_at,
        };
    }
}
