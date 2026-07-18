import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/progression.css';

const ContactPage = lazy(() => import('./pages/ContactPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const MemberDashboard = lazy(() => import('./pages/MemberDashboard'));
const MembershipPage = lazy(() => import('./pages/MembershipPage'));
const ProgramsPage = lazy(() => import('./pages/ProgramsPage'));
const ProgressionPage = lazy(() => import('./pages/ProgressionPage'));
const InstructorProgressionAdmin = lazy(() => import('./pages/InstructorProgressionAdmin'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));

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
                    <Route path="schedule" element={<SchedulePage />} />
                    <Route path="membership" element={<MembershipPage />} />
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
                        path="instructor/progression"
                        element={
                            <ProtectedRoute>
                                <InstructorProgressionAdmin />
                            </ProtectedRoute>
                        }
                    />
                </Route>
            </Routes>
        </Suspense>
    );
}
