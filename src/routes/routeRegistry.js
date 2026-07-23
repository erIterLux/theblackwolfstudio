const routeDefinitions = {
  contact: () => import('../pages/ContactPage'),
  home: () => import('../pages/HomePage'),
  login: () => import('../pages/LoginPage'),
  memberDashboard: () => import('../pages/MemberDashboard'),
  membership: () => import('../pages/MembershipPage'),
  privateTraining: () => import('../pages/PrivateTrainingPage'),
  privateTrainingSuccess: () => import('../pages/PrivateTrainingSuccessPage'),
  events: () => import('../pages/EventsPage'),
  eventSuccess: () => import('../pages/EventSuccessPage'),
  eventWaiver: () => import('../pages/EventWaiverPage'),
  memberEvents: () => import('../pages/MemberEventsPage'),
  instructorEvents: () => import('../pages/InstructorEventsAdmin'),
  instructorEventCheckIn: () => import('../pages/InstructorEventCheckIn'),
  instructorDiscounts: () => import('../pages/InstructorDiscountsAdmin'),
  memberPurchases: () => import('../pages/MemberPurchasesPage'),
  orderDetails: () => import('../pages/OrderDetailsPage'),
  instructorOrders: () => import('../pages/InstructorOrdersAdmin'),
  memberPrivateTraining: () => import('../pages/MemberPrivateTrainingPage'),
  instructorPrivateTraining: () => import('../pages/InstructorPrivateTrainingAdmin'),
  privateTrainingBooking: () => import('../pages/PrivateTrainingBookingPage'),
  instructorAvailability: () => import('../pages/InstructorAvailabilityAdmin'),
  instructorPrivateTrainingCalendar: () => import('../pages/InstructorPrivateTrainingCalendar'),
  instructorReports: () => import('../pages/InstructorReportsPage'),
  notifications: () => import('../pages/NotificationsPage'),
  instructorAnnouncements: () => import('../pages/InstructorAnnouncementsAdmin'),
  instructorHome: () => import('../pages/InstructorHome'),
  programs: () => import('../pages/ProgramsPage'),
  progression: () => import('../pages/ProgressionPage'),
  instructorProgression: () => import('../pages/InstructorProgressionAdmin'),
  instructorContent: () => import('../pages/InstructorContentAdmin'),
  memberLibrary: () => import('../pages/MemberLibraryPage'),
  notFound: () => import('../pages/NotFoundPage'),
};

const routePromises = new Map();

function loadDefinition(key) {
  const loadRoute = routeDefinitions[key];
  if (!loadRoute) {
    return Promise.reject(new Error(`Unknown route module: ${key}`));
  }

  if (!routePromises.has(key)) {
    const routePromise = loadRoute().catch((error) => {
      routePromises.delete(key);
      throw error;
    });
    routePromises.set(key, routePromise);
  }

  return routePromises.get(key);
}

export const routeLoaders = Object.fromEntries(
  Object.keys(routeDefinitions).map((key) => [key, () => loadDefinition(key)]),
);

const routeMatchers = [
  [/^\/$/, 'home'],
  [/^\/programs\/?$/, 'programs'],
  [/^\/(schedule|events)\/?$/, 'events'],
  [/^\/events\/success\/?$/, 'eventSuccess'],
  [/^\/events\/waiver\/[^/]+\/?$/, 'eventWaiver'],
  [/^\/membership\/?$/, 'membership'],
  [/^\/private-training\/?$/, 'privateTraining'],
  [/^\/private-training\/success\/?$/, 'privateTrainingSuccess'],
  [/^\/order\/[^/]+\/?$/, 'orderDetails'],
  [/^\/contact\/?$/, 'contact'],
  [/^\/login\/?$/, 'login'],
  [/^\/member\/?$/, 'memberDashboard'],
  [/^\/member\/progression\/?$/, 'progression'],
  [/^\/member\/library\/?$/, 'memberLibrary'],
  [/^\/member\/events\/?$/, 'memberEvents'],
  [/^\/member\/private-training\/?$/, 'memberPrivateTraining'],
  [/^\/member\/private-training\/book\/?$/, 'privateTrainingBooking'],
  [/^\/member\/purchases\/?$/, 'memberPurchases'],
  [/^\/member\/notifications\/?$/, 'notifications'],
  [/^\/instructor\/?$/, 'instructorHome'],
  [/^\/instructor\/progression\/?$/, 'instructorProgression'],
  [/^\/instructor\/content\/?$/, 'instructorContent'],
  [/^\/instructor\/events\/?$/, 'instructorEvents'],
  [/^\/instructor\/events\/[^/]+\/check-in\/?$/, 'instructorEventCheckIn'],
  [/^\/instructor\/discounts\/?$/, 'instructorDiscounts'],
  [/^\/instructor\/commerce\/orders\/?$/, 'instructorOrders'],
  [/^\/instructor\/private-training\/?$/, 'instructorPrivateTraining'],
  [/^\/instructor\/availability\/?$/, 'instructorAvailability'],
  [/^\/instructor\/private-training\/calendar\/?$/, 'instructorPrivateTrainingCalendar'],
  [/^\/instructor\/reports(?:\/[^/]+)?\/?$/, 'instructorReports'],
  [/^\/instructor\/announcements\/?$/, 'instructorAnnouncements'],
  [/^\/instructor\/notifications\/?$/, 'notifications'],
];

function normalizePath(to) {
  if (typeof to === 'string') return to.split(/[?#]/, 1)[0] || '/';
  if (to && typeof to === 'object' && typeof to.pathname === 'string') {
    return to.pathname;
  }
  return '';
}

export function routeKeyForPath(to) {
  const pathname = normalizePath(to);
  return routeMatchers.find(([pattern]) => pattern.test(pathname))?.[1] || null;
}

function connectionAllowsPrefetch() {
  if (typeof navigator === 'undefined') return true;
  const connection = navigator.connection
    || navigator.mozConnection
    || navigator.webkitConnection;

  if (!connection) return true;
  if (connection.saveData) return false;
  return !['slow-2g', '2g'].includes(connection.effectiveType);
}

export function prefetchRoute(to) {
  if (!connectionAllowsPrefetch()) return Promise.resolve(null);
  const key = routeKeyForPath(to);
  if (!key) return Promise.resolve(null);
  return loadDefinition(key).catch(() => null);
}

export function scheduleRoutePrefetch(to) {
  if (typeof window === 'undefined') return;
  const run = () => prefetchRoute(to);

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 800 });
    return;
  }

  window.setTimeout(run, 80);
}
