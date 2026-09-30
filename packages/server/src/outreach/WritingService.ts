import { InferenceAdapter } from '@agent-office/core';
import { IDEAL_CLIENT, PROGRAM_SUMMARY, STYLE_GUIDE } from './profile';
import { OutreachStore, StoredItem } from './OutreachStore';
import { completeJson, str } from './llm';
import { TEAM } from '../team';

export interface WriterSettings {
    myName: string;
    calendly: string;
    voice: string;
}

export type CommunityType = 'announcement' | 'inbox' | 'reminder' | 'welcome' | 'other';
export const COMMUNITY_TYPES: CommunityType[] = ['announcement', 'inbox', 'reminder', 'welcome', 'other'];
export type TimeZone = 'PT' | 'CT' | 'ET';

export interface CommunityRequest {
    type: CommunityType;
    brief: string;
    date?: string;
    time?: string;
    zone?: TimeZone;
    link?: string;
}

const URL_PATTERN = /https?:\/\/\S+/g;
const ZONE_OFFSET_FROM_ET: Record<TimeZone, number> = { PT: -3, CT: -1, ET: 0 };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const COMMUNITY_GUIDES: Record<CommunityType, string> = {
    announcement: 'An event or news announcement. Follow the example format: an emoji headline, a one-line hook question, the session title, date and time lines, one or two sentences on who is leading it and why it matters, a "You\'ll learn how to:" list of 3 to 5 ✨ bullets (only outcomes supported by the details), a friendly call to action, the link, and a warm closing.',
    inbox: 'A personal direct message to one community member inside the community app. 2 to 5 sentences, warm and helpful, few or no emojis.',
    reminder: 'A short, upbeat reminder about something coming up, with the key details and the link. 2 to 5 short lines, a couple of emojis at most.',
    welcome: 'A warm welcome post for new members. 3 to 6 sentences. Make them feel at home and invite them to introduce themselves.',
    other: 'Follow the user\'s brief for the format.',
};

const ANNOUNCEMENT_EXAMPLE = `🚀 LIVE SALES CALL TRAINING 🚀

Want to close more confidently without feeling pushy or salesy?

Join us for:

🎯 [Session title]

📅 [Date]
⏰ [Time]

We're excited to have [guest name and title] joining us for a practical and interactive training on [topic].

You'll learn how to:

✨ [Outcome]
✨ [Outcome]
✨ [Outcome]

Come ready to take notes, participate, and put what you learn into practice! 📝

🔗 Join us LIVE here:
{LINK}

Can't wait to see you there! 🙌`;

export class WritingService {
    constructor(
        private adapter: InferenceAdapter,
        private model: string,
        private store: OutreachStore
    ) { }

    async draftDmReply(thread: string, notes: string, settings: WriterSettings): Promise<StoredItem> {
        const me = settings.myName || 'the user';
        const prompt = `You are Raze. You help the user reply to LinkedIn direct messages from prospects. The user is ${me}, a coach who runs this program:
${PROGRAM_SUMMARY}

${IDEAL_CLIENT}

${STYLE_GUIDE}

${voiceBlock(settings.voice)}

THE CONVERSATION (copied from LinkedIn; messages from ${me} are the user's, the other person is the prospect):
"""
${thread}
"""
${notes ? `\nWHAT THE USER WANTS FROM THIS REPLY: ${notes}\n` : ''}
Write two options for the user's next message, replying to the prospect's latest message:
1. "probe": keep the conversation going. Briefly acknowledge what they said, then ask ONE open question to understand their situation better (their goals, what feels hard right now, what is coming up for them, or what they have tried). 2 to 4 sentences. Do not mention the program.
2. "invite": acknowledge what they shared, connect it to what the user helps with, say the program could be a good fit, and invite them to a quick chat to go into more detail and see if it fits. 3 to 5 sentences. Do not write any link; the app adds the calendar link after your message.

Tone example, for a prospect who said communication across many industries matters in their role:
"That makes sense, Sam! Communication across different industries and backgrounds is a big part of what I specialize in.

Based on what you shared, I think my new program could be a good fit for what you're looking to develop. How about we have a quick chat, go into more detail, and explore how I could best support you?"

Rules:
- Use their first name. Only reference what they actually said.
- At most one emoji, and only if they used emojis.
- No sign-off.

Return ONLY this JSON:
{"theirName":"","whereTheyAre":"one sentence on what they said and what they seem to want","probe":"","invite":""}`;

        const data = await completeJson(this.adapter, this.model, prompt, 0.7);
        const probe = stripUrls(str(data?.probe));
        const inviteBody = stripUrls(str(data?.invite));
        if (!probe && !inviteBody) throw new Error('Raze could not draft a reply this time. Try again.');

        const link = settings.calendly || '[add your Calendly link in ⚙️ Settings]';
        const invite = `${inviteBody}\n\nHere's my calendar so you can pick a time that works for you: ${link}`;
        const theirName = str(data?.theirName) || 'Unknown';
        return this.store.saveItem('dm_reply', theirName, {
            theirName,
            whereTheyAre: str(data?.whereTheyAre),
            thread,
            options: [
                { style: 'probe', text: probe },
                { style: 'invite', text: invite },
            ],
        });
    }

    async draftCommentReply(commenter: string, comment: string, post: string, settings: WriterSettings): Promise<StoredItem> {
        const prompt = `You are Clove. You help the user reply to comments people leave on the user's own LinkedIn posts. The user is a coach who runs this program:
${PROGRAM_SUMMARY}

${STYLE_GUIDE}

${voiceBlock(settings.voice)}
${post ? `\nTHE USER'S POST:\n"""\n${post}\n"""\n` : ''}
THE COMMENT${commenter ? `, from ${commenter}` : ''}:
"""
${comment}
"""

Write 2 reply options in the user's voice:
1. "agree": warmly acknowledge their point and build on it with one specific thought of your own. 1 to 2 sentences.
2. "continue": acknowledge their point and add a light, natural question or observation that keeps the conversation going. 1 to 2 sentences.

Example:
Comment: "People don't buy the best service; they buy the one they understand the fastest. Stop stacking credentials and start sharpening the message."
Reply: "I agree! You can have all the credentials in the world, but if people have to figure out what you actually do, you've already made it harder than it needs to be."

Rules:
- LinkedIn friendly and conversational. Respond to what they actually said, without repeating their words back.
- No pitch, no links, no hashtags. At most one emoji, only if it feels natural.
- You may use their first name, but you don't have to.

Return ONLY this JSON:
{"replies":[{"style":"agree","text":""},{"style":"continue","text":""}]}`;

        const data = await completeJson(this.adapter, this.model, prompt, 0.8);
        const options = (Array.isArray(data?.replies) ? data.replies : [])
            .map((r: any) => ({ style: str(r?.style) || 'reply', text: stripUrls(str(r?.text)) }))
            .filter((r: { text: string }) => r.text)
            .slice(0, 3);
        if (options.length === 0) throw new Error('Clove could not draft a reply this time. Try again.');
        return this.store.saveItem('comment_reply', commenter || 'Someone', { commenter, comment, post, options });
    }

    async draftCommunity(req: CommunityRequest): Promise<StoredItem> {
        const when = formatWhen(req.date, req.time, req.zone);
        const link = (req.link || '').trim();
        const prompt = `You are Jett, the community manager for the user's online community. Members are people in or around this program:
${PROGRAM_SUMMARY}

${STYLE_GUIDE}
Community posts can be lively and use emojis as section markers. Direct messages are personal and use few or no emojis.

TYPE: ${req.type}
${COMMUNITY_GUIDES[req.type]}

DETAILS FROM THE USER:
"""
${req.brief}
"""

${when ? `DATE AND TIME (copy exactly, do not change):\n📅 ${when.date}\n⏰ ${when.time}` : 'No date or time was given. Do not invent one.'}
${link ? 'Where the link belongs, write the token {LINK} on its own line. Do not write any URL yourself.' : 'No link was given. Do not include any link or link line.'}

Example announcement format (placeholders in brackets):
${ANNOUNCEMENT_EXAMPLE}

Only use names, titles, and facts from the user's details. If something is missing, such as a guest's name, leave it out instead of inventing it.

Return ONLY this JSON:
{"title":"a short label for this draft","text":"the full draft"}`;

        const data = await completeJson(this.adapter, this.model, prompt, 0.7);
        let text = stripUrls(str(data?.text));
        if (!text) throw new Error('Jett could not draft that this time. Try again.');
        if (link) {
            text = text.includes('{LINK}') ? text.split('{LINK}').join(link) : `${text}\n\n🔗 ${link}`;
        } else {
            text = text.split('{LINK}').join('').replace(/\n{3,}/g, '\n\n').trim();
        }
        const title = str(data?.title) || `${req.type[0].toUpperCase()}${req.type.slice(1)}`;
        return this.store.saveItem('community', title, { type: req.type, brief: req.brief, text });
    }

    async doAgentTask(agentId: string, task: string, settings: WriterSettings): Promise<StoredItem> {
        const member = TEAM[agentId];
        const prompt = `You are ${member.name}, the ${member.role} on the user's team. ${member.job}
The user is a coach who runs this program:
${PROGRAM_SUMMARY}

${IDEAL_CLIENT}

${STYLE_GUIDE}

${voiceBlock(settings.voice)}

THE USER ASSIGNED YOU THIS TASK IN A TEAM MEETING:
"""
${task}
"""

Do the task and deliver a written result the user can use right away. If you need information you don't have (names, dates, links, numbers), put a clear placeholder in square brackets like [date] instead of inventing it.

Return ONLY this JSON:
{"summary":"one short, friendly sentence for the team chat about what you did","result":"the deliverable"}`;

        const data = await completeJson(this.adapter, this.model, prompt, 0.7);
        const result = str(data?.result);
        if (!result) throw new Error(`${member.name} could not finish that task. Try rephrasing it.`);
        return this.store.saveItem('agent_task', task.slice(0, 80), {
            agentId,
            agentName: member.name,
            task,
            summary: str(data?.summary),
            result,
        });
    }
}

function voiceBlock(voice: string): string {
    return voice.trim()
        ? `THE USER'S VOICE (real things they wrote; match their tone, length, and vocabulary):\n"""\n${voice.trim().slice(0, 4000)}\n"""`
        : '';
}

// Removes URLs the model made up, along with a lead-in ("Book here:") that pointed at them.
function stripUrls(text: string): string {
    return text
        .replace(/(^|\n)[^\n]*:[ \t]*\n[ \t]*https?:\/\/\S+[ \t]*(?=\n|$)/g, '$1')
        .replace(/[ \t]*[^\n.!?]*:[ \t]*https?:\/\/\S+/g, '')
        .replace(URL_PATTERN, '')
        .replace(/([^ \n]) {2,}/g, '$1 ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function format12h(hours24: number, minutes: number): string {
    const h = ((hours24 % 24) + 24) % 24;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

// Converts a US time into all three US time zones in code, so the model never does time math.
export function formatWhen(date?: string, time?: string, zone?: TimeZone): { date: string; time: string } | null {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(time || '');
    if (!dateMatch && !timeMatch) return null;

    let dateText = '';
    if (dateMatch) {
        const [y, m, d] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
        const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        dateText = `${WEEKDAYS[weekday]}, ${MONTHS[m - 1]} ${d}`;
    }

    let timeText = '';
    if (timeMatch) {
        const source = zone && zone in ZONE_OFFSET_FROM_ET ? zone : 'ET';
        const etHours = Number(timeMatch[1]) - ZONE_OFFSET_FROM_ET[source];
        const minutes = Number(timeMatch[2]);
        timeText = (['PT', 'CT', 'ET'] as TimeZone[])
            .map((z) => `${format12h(etHours + ZONE_OFFSET_FROM_ET[z], minutes)} ${z}`)
            .join(' | ');
    }

    return { date: dateText || '[date]', time: timeText || '[time]' };
}
