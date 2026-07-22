import {
    ExternalLink,
    LogOut,
    Menu,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './notifications/NotificationBell';
import Logo from './Logo';

function PortalNav({ groups, onNavigate }) {
    return (
        <nav className="portal-nav" aria-label="Workspace navigation">
            {groups.map((group) => (
                <div className="portal-nav__group" key={group.label}>
                    <p className="portal-nav__label">{group.label}</p>
                    <div className="portal-nav__links">
                        {group.items.map((item) => {
                            const Icon = item.icon;
                            return (
                                <NavLink
                                    className={({ isActive }) => `portal-nav__link${isActive ? ' is-active' : ''}`}
                                    end={Boolean(item.end)}
                                    key={item.to}
                                    onClick={onNavigate}
                                    to={item.to}
                                >
                                    <Icon size={18} aria-hidden="true" />
                                    <span>{item.label}</span>
                                </NavLink>
                            );
                        })}
                    </div>
                </div>
            ))}
        </nav>
    );
}

export default function PortalShell({
    mode,
    title,
    homePath,
    navigation,
    notificationsPath,
    switchLink,
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const { pathname } = useLocation();
    const { user, signOutUser } = useAuth();

    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!menuOpen) return undefined;

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [menuOpen]);

    const displayName = useMemo(() => (
        user?.displayName || user?.email || 'Studio account'
    ), [user]);

    const closeMenu = () => setMenuOpen(false);

    return (
        <div className={`portal-shell portal-shell--${mode}`}>
            <a className="skip-link" href="#main-content">Skip to content</a>

            <header className="portal-topbar">
                <div className="portal-topbar__brand">
                    <button
                        className="portal-menu-button"
                        type="button"
                        aria-controls={`${mode}-portal-navigation`}
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((current) => !current)}
                    >
                        <span className="sr-only">Toggle workspace navigation</span>
                        {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
                    </button>
                    <Logo to={homePath} label={`${title} home`} />
                    <span className="portal-topbar__mode">{title}</span>
                </div>

                <div className="portal-topbar__actions">
                    {switchLink && (
                        <Link className="portal-switch-link" to={switchLink.to}>
                            {switchLink.label}
                        </Link>
                    )}
                    <NotificationBell to={notificationsPath} />
                    <div className="portal-user" title={displayName}>
                        <span className="portal-user__avatar" aria-hidden="true">
                            {displayName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="portal-user__name">{displayName}</span>
                    </div>
                </div>
            </header>

            <div className="portal-layout">
                <aside
                    className={`portal-sidebar${menuOpen ? ' is-open' : ''}`}
                    id={`${mode}-portal-navigation`}
                >
                    <div className="portal-sidebar__context">
                        <p className="eyebrow">{mode === 'instructor' ? 'Studio operations' : 'Your training'}</p>
                        <strong>{title}</strong>
                    </div>

                    <PortalNav groups={navigation} onNavigate={closeMenu} />

                    <div className="portal-sidebar__footer">
                        <Link className="portal-sidebar__utility" to="/" onClick={closeMenu}>
                            <ExternalLink size={17} aria-hidden="true" />
                            Studio website
                        </Link>
                        <button
                            className="portal-sidebar__utility"
                            type="button"
                            onClick={() => signOutUser()}
                        >
                            <LogOut size={17} aria-hidden="true" />
                            Sign out
                        </button>
                    </div>
                </aside>

                {menuOpen && (
                    <button
                        className="portal-sidebar-backdrop"
                        type="button"
                        aria-label="Close workspace navigation"
                        onClick={closeMenu}
                    />
                )}

                <main className="portal-main" id="main-content" tabIndex={-1}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
