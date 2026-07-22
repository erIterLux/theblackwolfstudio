import { Outlet } from 'react-router-dom';
import Footer from './Footer';
import Header from './Header';

export default function MarketingShell() {
  return (
    <div className="app-shell app-shell--marketing">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="announcement">Founding-member intro sessions are opening soon.</div>
      <Header />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
