import { InferenceAdapter } from '@agent-office/core';
import { DISQUALIFIERS, EXCLUDE_KEYWORDS, IDEAL_CLIENT, PROGRAM_SUMMARY, SEGMENTS, Segment } from './profile';
import { DraftContent, Fit, LeadSearch, OutreachDraft, OutreachStore, SavedSearch } from './OutreachStore';

// Filter values as they appear in LinkedIn Sales Navigator's lead filters.
const SENIORITY = ['Owner / Partner', 'CXO', 'Vice President', 'Director', 'Experienced Manager', 'Strategic', 'Senior'];
const HEADCOUNT = ['Self-employed', '1-10', '11-50', '51-200', '201-500', '501-1,000', '1,001-5,000', '5,001-10,000', '10,001+'];
const YEARS_OF_EXPERIENCE = ['3 to 5 years', '6 to 10 years', 'More than 10 years'];
const SPOTLIGHTS = ['Posted on LinkedIn in past 30 days', 'Changed jobs in past 90 days', 'Mentioned in the news in past 30 days'];

const CONNECTION_NOTE_LIMIT = 300;

export class OutreachService {
    constructor(
        private adapter: InferenceAdapter,
        private model: string,
        private store: OutreachStore
    ) { }

    async generateSearches(segment: Segment, focus: string): Promise<SavedSearch[]> {
        const seg = SEGMENTS[segment];
        const prompt = `You are Sia, a B2B lead researcher who builds LinkedIn Sales Navigator lead searches.

WHAT WE SELL:
${PROGRAM_SUMMARY}

${IDEAL_CLIENT}

${DISQUALIFIERS}

SEGMENT: ${seg.label}. ${seg.description}
Moments where their presence gap costs them: ${seg.moments}.
${focus ? `EXTRA FOCUS FROM THE USER: ${focus}\n` : ''}
Create 4 different Sales Navigator lead searches for this segment. Each search should target a different pocket of great-fit people (for example different industries, company stages, or technical backgrounds). Favor people with deep expertise (technical founders, scientists, long-tenured operators, domain experts) over people who are already highly visible.

Where a list of allowed values is given, use only those exact values:
- seniority: ${SENIORITY.join(' | ')}
- companyHeadcount: ${HEADCOUNT.join(' | ')}
- yearsOfExperience: ${YEARS_OF_EXPERIENCE.join(' | ')}
- spotlights: ${SPOTLIGHTS.join(' | ')}

Return ONLY this JSON:
{"searches":[{"name":"short name","why":"one sentence on why these people fit","keywords":"Boolean keyword string using AND, OR, double quotes and parentheses. Do not use NOT; exclusions are added automatically","titles":["current job titles to include"],"seniority":[],"companyHeadcount":[],"industries":["LinkedIn industry names"],"geography":["regions or countries"],"yearsOfExperience":[],"spotlights":[]}]}`;

        const data = await this.completeJson(prompt, 0.6);
        const raw: any[] = Array.isArray(data?.searches) ? data.searches : [];
        const searches = raw.map((s) => this.cleanSearch(s)).filter((s) => s.name && (s.keywords || s.titles.length > 0));
        if (searches.length === 0) {
            throw new Error('Sia could not produce usable searches this time. Try again.');
        }

        const saved: SavedSearch[] = [];
        for (const search of searches) {
            saved.push(await this.store.saveSearch(segment, focus, search));
        }
        return saved;
    }

    async draftOutreach(leadProfile: string, segment: Segment | 'auto'): Promise<OutreachDraft> {
        const segmentLines = (Object.keys(SEGMENTS) as Segment[])
            .map((key) => `- "${key}": ${SEGMENTS[key].description} Their high-stakes moments: ${SEGMENTS[key].moments}.`)
            .join('\n');
        const segmentInstruction = segment === 'auto'
            ? 'Decide which segment the lead belongs to.'
            : `The user says this lead is in the "${segment}" segment.`;

        const prompt = `You are Karl, an outreach writer. You write LinkedIn messages in the first person on behalf of the user, a coach who runs this program:
${PROGRAM_SUMMARY}

${IDEAL_CLIENT}

${DISQUALIFIERS}

SEGMENTS:
${segmentLines}
${segmentInstruction}

LEAD PROFILE (copied by the user from LinkedIn):
"""
${leadProfile}
"""

Steps:
1. Judge fit: "good" (clearly matches the ideal client), "maybe" (partly matches, or not enough information), or "disqualified" (matches a disqualifier). Explain in one sentence.
2. If the lead is not disqualified, write:
   - connectionNote: a LinkedIn connection request note of at most 280 characters. Warm, specific, peer to peer. Reference one concrete detail from their profile. No pitch, no links, and no mention of coaching or the program.
   - followUp: a message to send after they accept, 60 to 120 words. Acknowledge their specific expertise, name the kind of moment they are likely facing in their segment, say briefly that you help accomplished leaders turn deep expertise into confident presence, and end with one low-pressure question. Never imply they are bad at speaking; frame it as expertise that deserves a bigger stage.

Rules:
- Use only facts from the lead profile. Never invent achievements, numbers, or details.
- Use their first name if it is known. Never use placeholders like [Name].
- No emojis, no sign-off, no hashtags.
- Avoid cliches such as "I came across your profile" or "I hope this finds you well".
- If the lead is disqualified, set connectionNote and followUp to "".

Return ONLY this JSON:
{"leadName":"","segment":"founder or executive","fit":"good or maybe or disqualified","fitReason":"","personalHook":"the profile detail you referenced","connectionNote":"","followUp":""}`;

        const data = await this.completeJson(prompt, 0.7);
        const content = this.cleanDraft(data, segment);

        if (content.connectionNote.length > CONNECTION_NOTE_LIMIT) {
            content.connectionNote = await this.shortenNote(content.connectionNote);
        }

        return this.store.saveDraft(content, leadProfile);
    }

    private async shortenNote(note: string): Promise<string> {
        const prompt = `Shorten this LinkedIn connection note to at most 280 characters. Keep the specific detail and the warm tone. Do not add anything new.

NOTE:
"""
${note}
"""

Return ONLY this JSON: {"connectionNote":""}`;
        try {
            const data = await this.completeJson(prompt, 0.3);
            const shorter = this.str(data?.connectionNote);
            if (shorter && shorter.length < note.length) return shorter;
        } catch {
            // Keep the original; the UI flags notes over the limit.
        }
        return note;
    }

    private async completeJson(prompt: string, temperature: number): Promise<any> {
        let content: string;
        try {
            const res = await this.adapter.complete({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                temperature,
                format: 'json',
            });
            content = res.content;
        } catch (e: any) {
            throw new Error(this.friendlyError(e));
        }

        try {
            return JSON.parse(content);
        } catch {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                try { return JSON.parse(match[0]); } catch { /* fall through */ }
            }
        }
        throw new Error('The model returned something that was not valid JSON. Try again.');
    }

    private friendlyError(e: any): string {
        const message = String(e?.message || e);
        if (/not found/i.test(message)) {
            return `The model "${this.model}" is not downloaded. Run: ollama pull ${this.model}`;
        }
        if (/fetch failed|ECONNREFUSED/i.test(message)) {
            return 'Could not reach Ollama. Make sure the Ollama app is running.';
        }
        return message;
    }

    private cleanSearch(s: any): LeadSearch {
        const keywords = this.str(s?.keywords).replace(/\s+NOT\s+.*$/i, '').trim();
        const exclusions = EXCLUDE_KEYWORDS.join(' OR ');
        return {
            name: this.str(s?.name),
            why: this.str(s?.why),
            keywords,
            keywordsWithExclusions: keywords ? `(${keywords}) NOT (${exclusions})` : `NOT (${exclusions})`,
            titles: this.list(s?.titles),
            seniority: this.allowed(s?.seniority, SENIORITY),
            companyHeadcount: this.allowed(s?.companyHeadcount, HEADCOUNT),
            industries: this.list(s?.industries),
            geography: this.list(s?.geography),
            yearsOfExperience: this.allowed(s?.yearsOfExperience, YEARS_OF_EXPERIENCE),
            spotlights: this.allowed(s?.spotlights, SPOTLIGHTS),
        };
    }

    private cleanDraft(d: any, requested: Segment | 'auto'): DraftContent {
        const fit: Fit = ['good', 'maybe', 'disqualified'].includes(d?.fit) ? d.fit : 'maybe';
        const modelSegment: Segment = d?.segment === 'executive' ? 'executive' : 'founder';
        const disqualified = fit === 'disqualified';
        return {
            leadName: this.str(d?.leadName) || 'Unknown lead',
            segment: requested === 'auto' ? modelSegment : requested,
            fit,
            fitReason: this.str(d?.fitReason),
            personalHook: this.str(d?.personalHook),
            connectionNote: disqualified ? '' : this.str(d?.connectionNote),
            followUp: disqualified ? '' : this.str(d?.followUp),
        };
    }

    private str(value: any): string {
        return typeof value === 'string' ? value.trim() : '';
    }

    private list(value: any): string[] {
        if (!Array.isArray(value)) return [];
        return value.map((v) => this.str(v)).filter(Boolean).slice(0, 12);
    }

    private allowed(value: any, options: string[]): string[] {
        const lower = new Map(options.map((o) => [o.toLowerCase(), o]));
        return this.list(value)
            .map((v) => lower.get(v.toLowerCase()))
            .filter((v): v is string => Boolean(v));
    }
}
