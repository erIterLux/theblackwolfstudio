import {
    ArrowLeft,
    CalendarCheck2,
    Copy,
    MapPin,
    ShieldCheck,
    UserCheck,
    Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import useEventRegistrations from '../hooks/useEventRegistrations';

function formatDateTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.valueOf())) return '';
    return date.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function readableStatus(value) {
    return String(value || '').replaceAll('_', ' ');
}

function waiverPath(participant) {
    const token = participant?.waiverAccessToken || '';
    return `/events/waiver/${encodeURIComponent(participant.id)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export default function MemberEventsPage() {
    const { registrations, upcoming, loading, error, refresh } = useEventRegistrations();
    const [copiedId, setCopiedId] = useState('');

    const copyWaiverLink = async (participant) => {
        const url = new URL(waiverPath(participant), window.location.origin).toString();
        await navigator.clipboard.writeText(url);
        setCopiedId(participant.id);
        window.setTimeout(() => setCopiedId(''), 1800);
    };

    const allParticipants = registrations.flatMap((registration) => registration.participants || []);
    const pendingWaivers = allParticipants.filter((participant) => participant.waiverStatus === 'pending').length;

    return (
        <section className="member-page member-events-page">
            <div className="container">
                <div className="member-header member-header--refined">
                    <div>
                        <Link className="text-link" to="/member"><ArrowLeft size={17} /> Member home</Link>
                        <p className="eyebrow">Events</p>
                        <h1>Your registrations</h1>
                        <p>Registration, waiver completion, and event check-in are tracked separately for each participant.</p>
                    </div>
                    <Link className="button button--ghost-light" to="/events">Browse events</Link>
                </div>

                <div className="event-member-summary">
                    <div><strong>{upcoming.length}</strong><span>upcoming registrations</span></div>
                    <div><strong>{allParticipants.length}</strong><span>people registered</span></div>
                    <div><strong>{pendingWaivers}</strong><span>waivers still needed</span></div>
                </div>

                {loading && <p className="page-loader">Loading event registrations…</p>}
                {error && (
                    <div className="form-status form-status--error">
                        <p>{error}</p>
                        <button type="button" className="text-link" onClick={refresh}>Try again</button>
                    </div>
                )}

                {!loading && !error && !registrations.length && (
                    <article className="empty-state-card">
                        <CalendarCheck2 size={38} />
                        <h2>No event registrations yet.</h2>
                        <p>Membership is not required to register for an event.</p>
                        <Link className="button" to="/events">View upcoming events</Link>
                    </article>
                )}

                <div className="member-event-list">
                    {registrations.map((registration) => (
                        <article className="member-event-card" key={registration.id}>
                            <div className="member-event-card__heading">
                                <div>
                                    <p className="eyebrow">{registration.registrationStatus === 'confirmed' ? 'Registered' : readableStatus(registration.registrationStatus)}</p>
                                    <h2>{registration.eventSnapshot?.title}</h2>
                                </div>
                                <span className="event-person-status is-confirmed">Confirmed</span>
                            </div>

                            <div className="member-event-card__meta">
                                <span><CalendarCheck2 size={17} /> {formatDateTime(registration.eventSnapshot?.startsAt)}</span>
                                <span><MapPin size={17} /> {registration.eventSnapshot?.location?.name || registration.eventSnapshot?.location?.address || 'Location announced soon'}</span>
                                <span><Users size={17} /> {registration.participantCount} participant{registration.participantCount === 1 ? '' : 's'}</span>
                            </div>

                            <div className="member-event-participants">
                                {(registration.participants || []).map((participant) => {
                                    const canOpen = participant.waiverStatus === 'pending' && participant.waiverAccessToken;
                                    return (
                                        <div key={participant.id}>
                                            <div><strong>{participant.fullName}</strong><span>{participant.email}</span></div>
                                            <div className="member-event-participant-actions">
                                                <span><ShieldCheck size={15} /> Waiver: {readableStatus(participant.waiverStatus)}</span>
                                                <span><UserCheck size={15} /> Check-in: {readableStatus(participant.checkInStatus)}</span>
                                                {canOpen && (
                                                    <>
                                                        <Link className="button button--small" to={waiverPath(participant)}>Open waiver</Link>
                                                        <button className="text-link" type="button" onClick={() => copyWaiverLink(participant)}>
                                                            <Copy size={15} /> {copiedId === participant.id ? 'Copied' : 'Copy link'}
                                                        </button>
                                                    </>
                                                )}
                                                {participant.waiverStatus === 'setup_required' && (
                                                    <small>Waiver setup is still pending with the instructor.</small>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
