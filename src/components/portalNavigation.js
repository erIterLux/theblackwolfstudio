import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Home,
  Megaphone,
  ReceiptText,
  ShieldCheck,
  Target,
  TicketPercent,
  Users,
  CreditCard,
  UserCog,
} from 'lucide-react';

export const memberNavigation = [
  {
    label: 'Member',
    items: [
      { label: 'Home', to: '/member', icon: Home, end: true },
      { label: 'Progression', to: '/member/progression', icon: Target },
      { label: 'Events', to: '/member/events', icon: CalendarDays },
      { label: 'Private training', to: '/member/private-training', icon: CalendarClock },
      { label: 'Training library', to: '/member/library', icon: BookOpen },
      { label: 'Purchases', to: '/member/purchases', icon: ReceiptText },
      { label: 'Notifications', to: '/member/notifications', icon: Bell },
    ],
  },
];

export const instructorNavigation = [
  {
    label: 'Workspace',
    items: [
      { label: 'Overview', to: '/instructor', icon: Home, end: true },
      { label: 'Booking calendar', to: '/instructor/private-training/calendar', icon: CalendarClock },
      { label: 'Availability', to: '/instructor/availability', icon: CalendarDays },
    ],
  },
  {
    label: 'Training',
    items: [
      { label: 'Events', to: '/instructor/events', icon: Users },
      { label: 'Progression reviews', to: '/instructor/progression', icon: ShieldCheck },
      { label: 'Curriculum', to: '/instructor/content', icon: BookOpen },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { label: 'Orders', to: '/instructor/commerce/orders', icon: ReceiptText },
      { label: 'Discounts', to: '/instructor/discounts', icon: TicketPercent },
      { label: 'Packages and credits', to: '/instructor/private-training', icon: CreditCard, end: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Studio reports', to: '/instructor/reports', icon: BarChart3 },
      { label: 'Announcements', to: '/instructor/announcements', icon: Megaphone },
      { label: 'Notifications', to: '/instructor/notifications', icon: Bell },
    ],
  },
];

export const instructorQuickActions = [
  {
    label: 'Open booking calendar',
    description: 'Confirm requests, manage changes, and record attendance.',
    to: '/instructor/private-training/calendar',
    icon: CalendarClock,
  },
  {
    label: 'Manage events',
    description: 'Create dates, review participants, waivers, and check-in.',
    to: '/instructor/events',
    icon: Users,
  },
  {
    label: 'Review progression',
    description: 'Assess evidence, leave feedback, and approve advancement.',
    to: '/instructor/progression',
    icon: UserCog,
  },
  {
    label: 'Open studio reports',
    description: 'Review revenue, attendance, credits, and system health.',
    to: '/instructor/reports',
    icon: BarChart3,
  },
];
