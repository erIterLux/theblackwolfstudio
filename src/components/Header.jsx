import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import NotificationBell from './notifications/NotificationBell';
import { PrefetchNavLink } from './PrefetchLink';

const navItems = [
    ['Programs', '/programs'],
    ['Events', '/events'],
    ['Private Training', '/private-training'],
    ['Membership', '/membership'],
    ['Contact', '/contact'],
];

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function Header() {
    const { pathname } = useLocation();
    const [openPathname, setOpenPathname] = useState('');
    const open = openPathname === pathname;
    const { user } = useAuth();
    const menuButtonRef = useRef(null);
    const navRef = useRef(null);

    useEffect(() => {
        const desktopQuery = window.matchMedia('(min-width: 981px)');
        const handleDesktop = (event) => {
            if (event.matches) setOpenPathname('');
        };
        desktopQuery.addEventListener('change', handleDesktop);
        return () => desktopQuery.removeEventListener('change', handleDesktop);
    }, []);

    useEffect(() => {
        if (!open) return undefined;

        const previousOverflow = document.body.style.overflow;
        const previousFocus = document.activeElement;
        const menuButton = menuButtonRef.current;
        const focusNavigation = window.requestAnimationFrame(() => {
            navRef.current?.querySelector(FOCUSABLE_SELECTOR)?.focus();
        });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setOpenPathname('');
                return;
            }

            if (event.key !== 'Tab' || !navRef.current) return;
            const focusable = [...navRef.current.querySelectorAll(FOCUSABLE_SELECTOR)]
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
    }, [open]);

    const closeMenu = () => setOpenPathname('');

    return (
        <header className="site-header">
            <div className="container site-header__inner">
                <Logo />
                <button
                    ref={menuButtonRef}
                    className="menu-button"
                    type="button"
                    aria-expanded={open}
                    aria-controls="primary-navigation"
                    aria-label={open ? 'Close navigation' : 'Open navigation'}
                    onClick={() => setOpenPathname((current) => (current === pathname ? '' : pathname))}
                >
                    {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
                </button>
                <nav
                    ref={navRef}
                    id="primary-navigation"
                    className={`site-nav ${open ? 'is-open' : ''}`}
                    aria-label="Primary navigation"
                >
                    {navItems.map(([label, to]) => (
                        <PrefetchNavLink key={to} to={to} onClick={closeMenu}>
                            {label}
                        </PrefetchNavLink>
                    ))}
                    {user && <NotificationBell onNavigate={closeMenu} />}
                    <PrefetchNavLink
                        className="button button--small button--ghost"
                        to={user ? '/member' : '/login'}
                        onClick={closeMenu}
                    >
                        {user ? 'Member Space' : 'Member Login'}
                    </PrefetchNavLink>
                    <PrefetchNavLink className="button button--small" to="/contact" onClick={closeMenu}>
                        Book an Intro
                    </PrefetchNavLink>
                </nav>
            </div>
            {open && (
                <button
                    className="site-nav-backdrop"
                    type="button"
                    aria-label="Close navigation"
                    onClick={closeMenu}
                />
            )}
        </header>
    );
}
