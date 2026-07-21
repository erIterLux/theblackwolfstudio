import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/progression.css';
import './styles/content.css';
import './styles/private-training.css';
import './styles/events.css';
import './styles/commerce-admin.css';
import './styles/purchases.css';

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
            <Routes>
                <Route element={<AppShell />}>
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
                    <Route
                        path="member"
                        element={
                            <ProtectedRoute>
                                <MemberDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="member/progression"
                        element={
                            <ProtectedRoute>
                                <ProgressionPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="member/library"
                        element={
                            <ProtectedRoute>
                                <MemberLibraryPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="member/events"
                        element={
                            <ProtectedRoute>
                                <MemberEventsPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="member/private-training"
                        element={
                            <ProtectedRoute>
                                <MemberPrivateTrainingPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="member/purchases"
                        element={
                            <ProtectedRoute>
                                <MemberPurchasesPage />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="instructor/progression"
                        element={
                            <ProtectedRoute>
                                <InstructorProgressionAdmin />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="instructor/content"
                        element={
                            <ProtectedRoute>
                                <InstructorContentAdmin />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="instructor/events"
                        element={
                            <ProtectedRoute>
                                <InstructorEventsAdmin />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="instructor/events/:eventId/check-in"
                        element={
                            <ProtectedRoute>
                                <InstructorEventCheckIn />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="instructor/discounts"
                        element={
                            <ProtectedRoute>
                                <InstructorDiscountsAdmin />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="instructor/commerce/orders"
                        element={
                            <ProtectedRoute>
                                <InstructorOrdersAdmin />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="instructor/private-training"
                        element={
                            <ProtectedRoute>
                                <InstructorPrivateTrainingAdmin />
                            </ProtectedRoute>
                        }
                    />
                </Route>
            </Routes>
        </Suspense>
    );
}
