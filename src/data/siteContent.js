import {
  Activity,
  Brain,
  Hand,
  HeartPulse,
  Shield,
  Sparkles,
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
    price: '$89',
    cadence: '/ month',
    description: 'A steady once-a-week practice for building a strong foundation.',
    features: ['4 classes each month', 'Member resource library', 'Monthly progress check-in'],
  },
  {
    name: 'Train',
    price: '$149',
    cadence: '/ month',
    description: 'Flexible training across martial arts, self-defense, and somatic classes.',
    features: ['Unlimited group classes', 'Member resource library', 'Workshop discounts', 'Wolf Guide access when released'],
    featured: true,
  },
  {
    name: 'Integrate',
    price: '$229',
    cadence: '/ month',
    description: 'Deeper support for people who want training plus individual guidance.',
    features: ['Unlimited group classes', 'One private session each month', 'Personal practice plan', 'Priority workshop access'],
  },
];

export const wolfGuidePrompts = [
  { icon: Sparkles, label: 'Help me settle before class' },
  { icon: Brain, label: 'Explain a nervous system response' },
  { icon: Shield, label: 'Review a self-defense principle' },
];
