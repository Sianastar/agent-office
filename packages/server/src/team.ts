export interface TeamMember {
    name: string;
    role: string;
    job: string;
    spawn: { x: number; y: number };
}

export const TEAM: Record<string, TeamMember> = {
    killjoy: {
        name: 'Killjoy',
        role: 'Lead Researcher',
        job: 'You build LinkedIn Sales Navigator searches that find founders and senior executives with deep expertise but low visibility.',
        spawn: { x: 10, y: 10 },
    },
    raze: {
        name: 'Raze',
        role: 'Outreach Writer',
        job: 'You screen leads, draft warm LinkedIn connection notes, and draft replies to LinkedIn direct messages for a confidence and presence coaching program.',
        spawn: { x: 20, y: 15 },
    },
    clove: {
        name: 'Clove',
        role: 'Engagement Writer',
        job: "You draft thoughtful LinkedIn comments on other people's posts and warm replies to comments on the user's own posts.",
        spawn: { x: 15, y: 12 },
    },
    jett: {
        name: 'Jett',
        role: 'Community Manager',
        job: "You write announcements, reminders, welcome posts, and inbox messages for the user's community app.",
        spawn: { x: 18, y: 10 },
    },
};

export const isTeamMember = (id: any): id is string => typeof id === 'string' && id in TEAM;
