import {
    Activity,
    Brain,
    Hand,
    HeartPulse,
    Shield,
    Target,
    Users,
} from 'lucide-react';

export const programs = [
    {
        slug: 'martial-arts',
        eyebrow: 'Discipline + movement',
        title: 'Martial Arts',
        description:
            'Build coordination, timing, conditioning, and grounded confidence through structured practice.',
        icon: Activity,
        outcomes: ['Movement fundamentals', 'Striking and footwork', 'Strength and conditioning'],
    },
    {
        slug: 'self-defense',
        eyebrow: 'Awareness + action',
        title: 'Practical Self-Defense',
        description:
            'Train realistic decision-making, boundary setting, escape skills, and responsible physical response.',
        icon: Shield,
        outcomes: ['Situational awareness', 'Verbal boundaries', 'Simple, pressure-tested skills'],
    },
    {
        slug: 'somatic-healing',
        eyebrow: 'Regulation + recovery',
        title: 'Somatic Healing',
        description:
            'Use breath, orientation, sensation, and gentle movement to support regulation and embodied choice.',
        icon: HeartPulse,
        outcomes: ['Nervous system literacy', 'Grounding practices', 'Recovery and integration'],
    },
];

export const principles = [
    {
        title: 'Awareness before intensity',
        body: 'Learn to notice your environment, your body, and your options before adding speed or pressure.',
        icon: Target,
    },
    {
        title: 'Power without panic',
        body: 'Practice skillful action while staying connected to breath, balance, and decision-making.',
        icon: Brain,
    },
    {
        title: 'Consent and choice',
        body: 'Training is adaptable. Students are encouraged to communicate, pause, and choose their level of participation.',
        icon: Hand,
    },
    {
        title: 'Community over ego',
        body: 'We train with care, humility, accountability, and respect for every person in the room.',
        icon: Users,
    },
];

export const schedule = [
    { day: 'Monday', time: '6:00 PM', className: 'Foundations', level: 'All levels' },
    { day: 'Tuesday', time: '6:30 PM', className: 'Somatic Reset', level: 'Gentle' },
    { day: 'Wednesday', time: '6:00 PM', className: 'Self-Defense Lab', level: 'All levels' },
    { day: 'Thursday', time: '6:30 PM', className: 'Striking + Movement', level: 'Level 1–2' },
    { day: 'Saturday', time: '10:00 AM', className: 'Community Training', level: 'All levels' },
    { day: 'Saturday', time: '11:30 AM', className: 'Recovery + Integration', level: 'Gentle' },
];

export const memberships = [
    {
        name: 'Begin',
        price: '$49',
        cadence: 'per year',
        description: 'Progression and foundational references for building a consistent practice.',
        features: [
            'Studio progression system',
            'Basic training library',
            '3-message Wolf Guide preview',
            '5% off eligible events, private training, and future merchandise',
        ],
    },
    {
        name: 'Train',
        price: '$199',
        cadence: 'per year',
        description: 'Progression, Basic and Advanced references, and guided support between sessions.',
        features: [
            'Studio progression system',
            'Basic and advanced training library',
            '15 Wolf Guide messages each week',
            '10% off eligible events, private training, and future merchandise',
        ],
        featured: true,
    },
    {
        name: 'Integrate',
        price: '$299',
        cadence: 'per year',
        description: 'The complete Basic and Advanced digital practice system with one included private lesson.',
        features: [
            'Studio progression system',
            'Basic and advanced training library',
            '30 Wolf Guide messages each week',
            '15% off eligible events, private training, and future merchandise',
            '1 private lesson credit for up to 3 participants',
        ],
    },
];

export const wolfGuidePrompts = [
    { icon: Activity, label: 'Recommend a full body exercise for training' },
    { icon: Brain, label: 'Explain a nervous system response' },
    { icon: Shield, label: 'Review a self-defense principle' },
];
