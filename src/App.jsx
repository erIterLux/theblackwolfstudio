import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import InstructorRoute from './components/InstructorRoute';
import InstructorShell from './components/InstructorShell';
import MarketingShell from './components/MarketingShell';
import MemberShell from './components/MemberShell';
import ProtectedRoute from './components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import './styles/progression.css';
import './styles/content.css';
import './styles/private-training.css';
import './styles/events.css';
import './styles/commerce-admin.css';
import './styles/purchases.css';
import './styles/private-booking.css';
import './styles/reports.css';
import './styles/notifications.css';

const ContactPage = lazy(() => import('./pages/ContactPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const MemberDashboard = lazy(() => import('./pages/MemberDashboard'));
const MembershipPage = lazy(() => import('./pages/MembershipPage'));
const PrivateTrainingPage = lazy(() => import('./pages/PrivateTrainingPage'));
const PrivateTrainingSuccessPage = lazy(() => import('./pages/PrivateTrainingSuccessPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventSuccessPage = lazy(() => import('./pages/EventSuccessPage'));
const EventWaiverPage = lazy(() => import('./pages/EventWaiverPage'));
const MemberEventsPage = lazy(() => import('./pages/MemberEventsPage'));
const InstructorEventsAdmin = lazy(() => import('./pages/InstructorEventsAdmin'));
const InstructorEventCheckIn = lazy(() => import('./pages/InstructorEventCheckIn'));
const InstructorDiscountsAdmin = lazy(() => import('./pages/InstructorDiscountsAdmin'));
const MemberPurchasesPage = lazy(() => import('./pages/MemberPurchasesPage'));
const OrderDetailsPage = lazy(() => import('./pages/OrderDetailsPage'));
const InstructorOrdersAdmin = lazy(() => import('./pages/InstructorOrdersAdmin'));
const MemberPrivateTrainingPage = lazy(() => import('./pages/MemberPrivateTrainingPage'));
const InstructorPrivateTrainingAdmin = lazy(() => import('./pages/InstructorPrivateTrainingAdmin'));
const PrivateTrainingBookingPage = lazy(() => import('./pages/PrivateTrainingBookingPage'));
const InstructorAvailabilityAdmin = lazy(() => import('./pages/InstructorAvailabilityAdmin'));
const InstructorPrivateTrainingCalendar = lazy(() => import('./pages/InstructorPrivateTrainingCalendar'));
const InstructorReportsPage = lazy(() => import('./pages/InstructorReportsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const InstructorAnnouncementsAdmin = lazy(() => import('./pages/InstructorAnnouncementsAdmin'));
const InstructorHome = lazy(() => import('./pages/InstructorHome'));
const ProgramsPage = lazy(() => import('./pages/ProgramsPage'));
const ProgressionPage = lazy(() => import('./pages/ProgressionPage'));
const InstructorProgressionAdmin = lazy(() => import('./pages/InstructorProgressionAdmin'));
const InstructorContentAdmin = lazy(() => import('./pages/InstructorContentAdmin'));
const MemberLibraryPage = lazy(() => import('./pages/MemberLibraryPage'));

function RouteLoader() {
    return <div className="page-loader">Loading…</div>;
}

export default function App() {
    return (
        <Suspense fallback={<RouteLoader />}>
            <ScrollToTop />
            <Routes>
                <Route element={<MarketingShell />}>
                    <Route index element={<HomePage />} />
                    <Route path="programs" element={<ProgramsPage />} />
                    <Route path="schedule" element={<EventsPage />} />
                    <Route path="events" element={<EventsPage />} />
                    <Route path="events/success" element={<EventSuccessPage />} />
                    <Route path="events/waiver/:participantId" element={<EventWaiverPage />} />
                    <Route path="membership" element={<MembershipPage />} />
                    <Route path="private-training" element={<PrivateTrainingPage />} />
                    <Route path="private-training/success" element={<PrivateTrainingSuccessPage />} />
                    <Route path="order/:orderId" element={<OrderDetailsPage />} />
                    <Route path="contact" element={<ContactPage />} />
                    <Route path="login" element={<LoginPage />} />
                </Route>

                <Route
                    element={(
                        <ProtectedRoute>
                            <MemberShell />
                        </ProtectedRoute>
                    )}
                >
                    <Route path="member" element={<MemberDashboard />} />
                    <Route path="member/progression" element={<ProgressionPage />} />
                    <Route path="member/library" element={<MemberLibraryPage />} />
                    <Route path="member/events" element={<MemberEventsPage />} />
                    <Route path="member/private-training" element={<MemberPrivateTrainingPage />} />
                    <Route path="member/private-training/book" element={<PrivateTrainingBookingPage />} />
                    <Route path="member/purchases" element={<MemberPurchasesPage />} />
                    <Route path="member/notifications" element={<NotificationsPage />} />
                </Route>

                <Route
                    element={(
                        <ProtectedRoute>
                            <InstructorRoute>
                                <InstructorShell />
                            </InstructorRoute>
                        </ProtectedRoute>
                    )}
                >
                    <Route path="instructor" element={<InstructorHome />} />
                    <Route path="instructor/progression" element={<InstructorProgressionAdmin />} />
                    <Route path="instructor/content" element={<InstructorContentAdmin />} />
                    <Route path="instructor/events" element={<InstructorEventsAdmin />} />
                    <Route path="instructor/events/:eventId/check-in" element={<InstructorEventCheckIn />} />
                    <Route path="instructor/discounts" element={<InstructorDiscountsAdmin />} />
                    <Route path="instructor/commerce/orders" element={<InstructorOrdersAdmin />} />
                    <Route path="instructor/private-training" element={<InstructorPrivateTrainingAdmin />} />
                    <Route path="instructor/availability" element={<InstructorAvailabilityAdmin />} />
                    <Route path="instructor/private-training/calendar" element={<InstructorPrivateTrainingCalendar />} />
                    <Route path="instructor/reports" element={<InstructorReportsPage />} />
                    <Route path="instructor/reports/:reportSection" element={<InstructorReportsPage />} />
                    <Route path="instructor/announcements" element={<InstructorAnnouncementsAdmin />} />
                    <Route path="instructor/notifications" element={<NotificationsPage />} />
                </Route>
            </Routes>
        </Suspense>
    );
}
