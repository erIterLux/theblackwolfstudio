import { Outlet } from 'react-router-dom';
import Footer from './Footer';
import Header from './Header';

export default function AppShell() {
    return (
        <div className="app-shell">
            <div className="announcement">
                Founding-member intro sessions are opening soon.
            </div>

            <Header />

            <main>
                <Outlet />
            </main>

            <Footer />
        </div>
    );
}