import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import InstructorRoute from './components/InstructorRoute';
import InstructorShell from './components/InstructorShell';
import MarketingShell from './components/MarketingShell';
import MemberShell from './components/MemberShell';
import ProtectedRoute from './components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import NetworkStatusBanner from './components/system/NetworkStatusBanner';
import PerformanceMonitor from './components/system/PerformanceMonitor';
import RouteAnnouncer from './components/system/RouteAnnouncer';
import { routeLoaders } from './routes/routeRegistry';

const ContactPage = lazy(routeLoaders.contact);
const HomePage = lazy(routeLoaders.home);
const LoginPage = lazy(routeLoaders.login);
const MemberDashboard = lazy(routeLoaders.memberDashboard);
const MembershipPage = lazy(routeLoaders.membership);
const PrivateTrainingPage = lazy(routeLoaders.privateTraining);
const PrivateTrainingSuccessPage = lazy(routeLoaders.privateTrainingSuccess);
const EventsPage = lazy(routeLoaders.events);
const EventSuccessPage = lazy(routeLoaders.eventSuccess);
const EventWaiverPage = lazy(routeLoaders.eventWaiver);
const PrivateTrainingWaiverPage = lazy(routeLoaders.privateTrainingWaiver);
const MemberWaiverPage = lazy(routeLoaders.memberWaiver);
const MemberEventsPage = lazy(routeLoaders.memberEvents);
const InstructorEventsAdmin = lazy(routeLoaders.instructorEvents);
const InstructorEventCheckIn = lazy(routeLoaders.instructorEventCheckIn);
const InstructorDiscountsAdmin = lazy(routeLoaders.instructorDiscounts);
const MemberPurchasesPage = lazy(routeLoaders.memberPurchases);
const OrderDetailsPage = lazy(routeLoaders.orderDetails);
const InstructorOrdersAdmin = lazy(routeLoaders.instructorOrders);
const MemberPrivateTrainingPage = lazy(routeLoaders.memberPrivateTraining);
const InstructorPrivateTrainingAdmin = lazy(routeLoaders.instructorPrivateTraining);
const PrivateTrainingBookingPage = lazy(routeLoaders.privateTrainingBooking);
const InstructorAvailabilityAdmin = lazy(routeLoaders.instructorAvailability);
const InstructorPrivateTrainingCalendar = lazy(routeLoaders.instructorPrivateTrainingCalendar);
const InstructorReportsPage = lazy(routeLoaders.instructorReports);
const NotificationsPage = lazy(routeLoaders.notifications);
const InstructorAnnouncementsAdmin = lazy(routeLoaders.instructorAnnouncements);
const InstructorHome = lazy(routeLoaders.instructorHome);
const ProgramsPage = lazy(routeLoaders.programs);
const ProgressionPage = lazy(routeLoaders.progression);
const InstructorProgressionAdmin = lazy(routeLoaders.instructorProgression);
const InstructorContentAdmin = lazy(routeLoaders.instructorContent);
const MemberLibraryPage = lazy(routeLoaders.memberLibrary);
const NotFoundPage = lazy(routeLoaders.notFound);

export default function App() {
    return (
        <>
            <RouteAnnouncer />
            <NetworkStatusBanner />
            <PerformanceMonitor />
            <ScrollToTop />
            <Routes>
                <Route element={<MarketingShell />}>
                    <Route index element={<HomePage />} />
                    <Route path="programs" element={<ProgramsPage />} />
                    <Route path="schedule" element={<EventsPage />} />
                    <Route path="events" element={<EventsPage />} />
                    <Route path="events/success" element={<EventSuccessPage />} />
                    <Route path="events/waiver/:participantId" element={<EventWaiverPage />} />
                    <Route path="private-training/waiver/:waiverId" element={<PrivateTrainingWaiverPage />} />
                    <Route path="membership" element={<MembershipPage />} />
                    <Route path="private-training" element={<PrivateTrainingPage />} />
                    <Route path="private-training/success" element={<PrivateTrainingSuccessPage />} />
                    <Route path="order/:orderId" element={<OrderDetailsPage />} />
                    <Route path="contact" element={<ContactPage />} />
                    <Route path="login" element={<LoginPage />} />
                    <Route
                        path="*"
                        element={<NotFoundPage homePath="/" homeLabel="Return to the studio website" />}
                    />
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
                    <Route path="member/waiver" element={<MemberWaiverPage />} />
                    <Route path="member/private-training" element={<MemberPrivateTrainingPage />} />
                    <Route path="member/private-training/book" element={<PrivateTrainingBookingPage />} />
                    <Route path="member/purchases" element={<MemberPurchasesPage />} />
                    <Route path="member/notifications" element={<NotificationsPage />} />
                    <Route
                        path="member/*"
                        element={(
                            <NotFoundPage
                                workspace
                                homePath="/member"
                                homeLabel="Return to member home"
                            />
                        )}
                    />
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
                    <Route
                        path="instructor/*"
                        element={(
                            <NotFoundPage
                                workspace
                                homePath="/instructor"
                                homeLabel="Return to instructor overview"
                            />
                        )}
                    />
                </Route>
            </Routes>
        </>
    );
}
