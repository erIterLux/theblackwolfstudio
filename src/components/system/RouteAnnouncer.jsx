import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const EXACT_TITLES = new Map([
  ['/', 'Home'],
  ['/programs', 'Programs'],
  ['/schedule', 'Schedule'],
  ['/events', 'Events'],
  ['/events/success', 'Event registration complete'],
  ['/membership', 'Membership'],
  ['/private-training', 'Private training'],
  ['/private-training/success', 'Private training purchase complete'],
  ['/contact', 'Contact'],
  ['/login', 'Member login'],
  ['/member', 'Member home'],
  ['/member/progression', 'Progression'],
  ['/member/library', 'Training library'],
  ['/member/events', 'My events'],
  ['/member/private-training', 'My private training'],
  ['/member/private-training/book', 'Book private training'],
  ['/member/purchases', 'Purchases'],
  ['/member/notifications', 'Notifications'],
  ['/instructor', 'Instructor overview'],
  ['/instructor/progression', 'Progression reviews'],
  ['/instructor/content', 'Curriculum'],
  ['/instructor/events', 'Event management'],
  ['/instructor/discounts', 'Discounts'],
  ['/instructor/commerce/orders', 'Orders'],
  ['/instructor/private-training', 'Private training administration'],
  ['/instructor/availability', 'Instructor availability'],
  ['/instructor/private-training/calendar', 'Private training calendar'],
  ['/instructor/reports', 'Studio reports'],
  ['/instructor/announcements', 'Studio announcements'],
  ['/instructor/notifications', 'Instructor notifications'],
]);

function resolveTitle(pathname) {
  if (EXACT_TITLES.has(pathname)) return EXACT_TITLES.get(pathname);
  if (pathname.startsWith('/events/waiver/')) return 'Event waiver';
  if (pathname.startsWith('/order/')) return 'Purchase details';
  if (pathname.startsWith('/instructor/events/') && pathname.endsWith('/check-in')) {
    return 'Event check-in';
  }
  if (pathname.startsWith('/instructor/reports/')) return 'Studio reports';
  return 'Page not found';
}

export default function RouteAnnouncer() {
  const { pathname } = useLocation();
  const title = useMemo(() => resolveTitle(pathname), [pathname]);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    document.title = title === 'Home'
      ? 'The Black Wolf Studio'
      : `${title} | The Black Wolf Studio`;

    const timer = window.setTimeout(() => setAnnouncement(`${title} loaded`), 80);

    if (typeof performance !== 'undefined') {
      performance.mark(`route:${pathname}:ready`);
    }

    return () => window.clearTimeout(timer);
  }, [pathname, title]);

  return (
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </span>
  );
}
