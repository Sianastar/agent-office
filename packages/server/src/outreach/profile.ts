// Edit this file to change who Sia searches for and how Karl writes.

export type Segment = 'founder' | 'executive';

export const PROGRAM_SUMMARY = `A coaching program for accomplished leaders whose expertise has outgrown their presence.
Phase 1 "Build Confidence": stop overthinking before speaking and trust what you know.
Phase 2 "Build Presence": command attention in a room, on a stage, and on camera.`;

export const IDEAL_CLIENT = `Ideal client: high-competence, low-visibility leaders whose expertise has outgrown their stage presence.
- Who: founders and senior executives (CEOs, co-founders, C-suite) with deep, real expertise who have built something substantial: a company, a technical career, or a body of work. Credible on paper.
- Great-fit examples: a founder who spent 13 years scaling one company; a founder with deep climate-tech expertise; an enterprise-AI executive; a PhD and former chief scientist at a major tech company. Smart, accomplished people who are not natural performers.
- The gap: not knowledge but presence. They know the most in the room but do not always come across that way. They overthink before speaking, blend in instead of commanding attention, and are strong in writing and execution but not yet commanding in a room, on a stage, or on camera.
- Timing: they are at a point (fundraising, media appearances, executive interviews, keynotes) where that gap now costs them something.`;

export const DISQUALIFIERS = `Disqualify the lead if either is true:
1. They are already an established, polished public speaker or media personality (frequent keynote speaker, TV or media regular, well-known podcast personality). They have already solved this.
2. They sell adjacent services themselves: coaching, personal branding, public speaking or presence training, media training. That is competition, not a client.`;

export const SEGMENTS: Record<Segment, { label: string; description: string; moments: string }> = {
    founder: {
        label: 'Founders & CEOs',
        description: 'Startup and company founders, co-founders, and CEOs who built something substantial.',
        moments: 'fundraising pitches, investor meetings, media appearances, keynotes, leading an all-hands',
    },
    executive: {
        label: 'Senior executives',
        description: 'Senior executives (C-suite, VPs, senior technical leaders) preparing for executive interviews, promotion, or career acceleration.',
        moments: 'executive interviews, promotion conversations, board presentations, stepping into a bigger role',
    },
};

// Always added to Sia's searches so competitors and polished speakers are filtered out.
export const EXCLUDE_KEYWORDS = [
    'coach',
    'coaching',
    '"public speaking"',
    '"keynote speaker"',
    '"motivational speaker"',
    '"TEDx speaker"',
    '"personal brand"',
    '"personal branding"',
    '"media trainer"',
    '"media training"',
];
