import { AtSign, Mail, MapPin } from 'lucide-react';
import { PrefetchLink } from './PrefetchLink';
import Logo from './Logo';

export default function Footer() {
    return (
        <footer className="site-footer">
            <div className="container site-footer__grid">
                <div>
                    <Logo />
                    <p className="site-footer__statement">
                        Martial arts, practical self-defense, and somatic healing for steadier, stronger living.
                    </p>
                </div>
                <div>
                    <p className="footer-heading">Explore</p>
                    <div className="footer-links">
                        <PrefetchLink to="/programs">Programs</PrefetchLink>
                        <PrefetchLink to="/events">Events</PrefetchLink>
                        <PrefetchLink to="/private-training">Private training</PrefetchLink>
                        <PrefetchLink to="/membership">Membership</PrefetchLink>
                        <PrefetchLink to="/login">Member login</PrefetchLink>
                    </div>
                </div>
                <div>
                    <p className="footer-heading">Connect</p>
                    <div className="footer-links">
                        <a href="mailto:contact@theblackwolf.studio"><Mail size={17} /> contact@theblackwolf.studio</a>
                        <span><MapPin size={17} /> mobile</span>
                        <span><AtSign size={17} /> theblackwolf.studio</span>
                    </div>
                </div>
            </div>
            <div className="container site-footer__bottom">
                <span>© {new Date().getFullYear()} The Black Wolf Studio.</span>
                <span>Train with awareness. Act with choice.</span>
            </div>
        </footer>
    );
}
