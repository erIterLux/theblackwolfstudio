import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import NotificationBell from './notifications/NotificationBell';

const navItems = [
    ['Programs', '/programs'],
    ['Events', '/events'],
    ['Private Training', '/private-training'],
    ['Membership', '/membership'],
    ['Contact', '/contact'],
];

export default function Header() {
    const [open, setOpen] = useState(false);
    const { pathname } = useLocation();
    const { user } = useAuth();

    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!open) return undefined;

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    const closeMenu = () => setOpen(false);

    return (
        <header className="site-header">
            <div className="container site-header__inner">
                <Logo />
                <button
                    className="menu-button"
                    type="button"
                    aria-expanded={open}
                    aria-controls="primary-navigation"
                    onClick={() => setOpen((value) => !value)}
                >
                    <span className="sr-only">Toggle navigation</span>
                    {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
                </button>
                <nav id="primary-navigation" className={`site-nav ${open ? 'is-open' : ''}`}>
                    {navItems.map(([label, to]) => (
                        <NavLink key={to} to={to} onClick={closeMenu}>
                            {label}
                        </NavLink>
                    ))}
                    {user && <NotificationBell onNavigate={closeMenu} />}
                    <NavLink
                        className="button button--small button--ghost"
                        to={user ? '/member' : '/login'}
                        onClick={closeMenu}
                    >
                        {user ? 'Member Space' : 'Member Login'}
                    </NavLink>
                    <NavLink className="button button--small" to="/contact" onClick={closeMenu}>
                        Book an Intro
                    </NavLink>
                </nav>
            </div>
        </header>
    );
}
