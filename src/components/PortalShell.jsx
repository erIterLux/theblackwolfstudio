import {
    ExternalLink,
    LogOut,
    Menu,
    X,
} from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './notifications/NotificationBell';
import Logo from './Logo';
import { PrefetchLink, PrefetchNavLink } from './PrefetchLink';
import RouteLoadingState from './RouteLoadingState';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

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
                                <PrefetchNavLink
                                    className={({ isActive }) => `portal-nav__link${isActive ? ' is-active' : ''}`}
                                    end={Boolean(item.end)}
                                    key={item.to}
                                    onClick={onNavigate}
                                    to={item.to}
                                >
                                    <Icon size={18} aria-hidden="true" />
                                    <span>{item.label}</span>
                                </PrefetchNavLink>
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
    const { pathname } = useLocation();
    const [menuPathname, setMenuPathname] = useState('');
    const menuOpen = menuPathname === pathname;
    const { user, signOutUser } = useAuth();
    const menuButtonRef = useRef(null);
    const sidebarRef = useRef(null);

    useEffect(() => {
        const desktopQuery = window.matchMedia('(min-width: 981px)');
        const handleDesktop = (event) => {
            if (event.matches) setMenuPathname('');
        };
        desktopQuery.addEventListener('change', handleDesktop);
        return () => desktopQuery.removeEventListener('change', handleDesktop);
    }, []);

    useEffect(() => {
        if (!menuOpen) return undefined;

        const previousOverflow = document.body.style.overflow;
        const previousFocus = document.activeElement;
        const menuButton = menuButtonRef.current;
        const focusNavigation = window.requestAnimationFrame(() => {
            sidebarRef.current?.querySelector(FOCUSABLE_SELECTOR)?.focus();
        });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setMenuPathname('');
                return;
            }

            if (event.key !== 'Tab' || !sidebarRef.current) return;
            const focusable = [...sidebarRef.current.querySelectorAll(FOCUSABLE_SELECTOR)]
                .filter((element) => !element.hasAttribute('disabled'));
            if (!focusable.length) return;

            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusNavigation);
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
            if (previousFocus instanceof HTMLElement) previousFocus.focus();
            else menuButton?.focus();
        };
    }, [menuOpen]);

    const displayName = useMemo(() => (
        user?.displayName || user?.email || 'Studio account'
    ), [user]);

    const closeMenu = () => setMenuPathname('');

    return (
        <div className={`portal-shell portal-shell--${mode}`}>
            <a className="skip-link" href="#main-content">Skip to content</a>

            <header className="portal-topbar">
                <div className="portal-topbar__brand">
                    <button
                        ref={menuButtonRef}
                        className="portal-menu-button"
                        type="button"
                        aria-controls={`${mode}-portal-navigation`}
                        aria-expanded={menuOpen}
                        aria-label={menuOpen ? 'Close workspace navigation' : 'Open workspace navigation'}
                        onClick={() => setMenuPathname((current) => (current === pathname ? '' : pathname))}
                    >
                        {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
                    </button>
                    <Logo to={homePath} label={`${title} home`} />
                    <span className="portal-topbar__mode">{title}</span>
                </div>

                <div className="portal-topbar__actions">
                    {switchLink && (
                        <PrefetchLink className="portal-switch-link" to={switchLink.to}>
                            {switchLink.label}
                        </PrefetchLink>
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
                    ref={sidebarRef}
                    className={`portal-sidebar${menuOpen ? ' is-open' : ''}`}
                    id={`${mode}-portal-navigation`}
                    aria-label={`${title} navigation`}
                >
                    <div className="portal-sidebar__context">
                        <p className="eyebrow">{mode === 'instructor' ? 'Studio operations' : 'Your training'}</p>
                        <strong>{title}</strong>
                    </div>

                    <PortalNav groups={navigation} onNavigate={closeMenu} />

                    <div className="portal-sidebar__footer">
                        <PrefetchLink className="portal-sidebar__utility" to="/" onClick={closeMenu}>
                            <ExternalLink size={17} aria-hidden="true" />
                            Studio website
                        </PrefetchLink>
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

                <main
                    className="portal-main"
                    id="main-content"
                    tabIndex={-1}
                    inert={menuOpen ? true : undefined}
                    aria-hidden={menuOpen ? 'true' : undefined}
                >
                    <Suspense fallback={<RouteLoadingState workspace />}>
                        <Outlet />
                    </Suspense>
                </main>
            </div>
        </div>
    );
}
