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
