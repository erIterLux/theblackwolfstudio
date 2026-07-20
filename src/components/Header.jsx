import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

const navItems = [
    ['Programs', '/programs'],
    ['Schedule', '/schedule'],
    ['Private Training', '/private-training'],
    ['Membership', '/membership'],
    ['Contact', '/contact'],
];

export default function Header() {
    const [open, setOpen] = useState(false);
    const { user } = useAuth();

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
                    {open ? <X /> : <Menu />}
                </button>
                <nav id="primary-navigation" className={`site-nav ${open ? 'is-open' : ''}`}>
                    {navItems.map(([label, to]) => (
                        <NavLink key={to} to={to} onClick={closeMenu}>
                            {label}
                        </NavLink>
                    ))}
                    <NavLink className="button button--small button--ghost" to={user ? '/member' : '/login'} onClick={closeMenu}>
                        {user ? 'Member Home' : 'Member Login'}
                    </NavLink>
                    <NavLink className="button button--small" to="/contact" onClick={closeMenu}>
                        Book an Intro
                    </NavLink>
                </nav>
            </div>
        </header>
    );
}
