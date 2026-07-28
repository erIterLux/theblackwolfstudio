import {
  CheckCircle2,
  Eye,
  HeartPulse,
  Mail,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sendWaiverReminder } from '../../services/waivers';
import SignedWaiverDocumentActions from '../waivers/SignedWaiverDocumentActions';
import WaiverReminderButton from '../waivers/WaiverReminderButton';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function readable(value) {
  return String(value || 'pending').replaceAll('_', ' ');
}

function formatMoney(cents, currency = 'usd') {
  if (!Number.isFinite(Number(cents))) return 'Not listed';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
  }).format(Number(cents) / 100);
}

function formatDate(value) {
  if (!value) return 'Not listed';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Not listed';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function emergencyContactComplete(participant) {
  return Boolean(
    participant.emergencyContactName
    && String(participant.emergencyContactPhone || '').replace(/\D/g, '').length >= 7,
  );
}

function waiverComplete(participant) {
  return ['signed', 'covered', 'not_required'].includes(participant.waiverStatus);
}

function DetailItem({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children || 'Not listed'}</dd>
    </div>
  );
}

function RegistrantDetailsModal({ participant, onClose }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const hasEmergencyContact = emergencyContactComplete(participant);
  const purchaser = participant.purchaser || {};
  const pricing = participant.pricing || {};

  return (
    <div
      className="registrant-details-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="registrant-details-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="registrant-details-modal__header">
          <div>
            <p className="eyebrow">Registrant details</p>
            <h2 id={titleId}>{participant.fullName || 'Unnamed participant'}</h2>
            <p>Registration {participant.registrationId}</p>
          </div>
          <button
            ref={closeButtonRef}
            className="registrant-details-modal__close"
            type="button"
            onClick={onClose}
            aria-label="Close registrant details"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>

        <div className="registrant-details-modal__body">
          <section className={`registrant-emergency-card${hasEmergencyContact ? '' : ' is-missing'}`}>
            <div className="registrant-details-section__heading">
              <span><HeartPulse size={22} aria-hidden="true" /></span>
              <div>
                <p className="eyebrow">Emergency contact</p>
                <h3>{hasEmergencyContact ? 'Contact information' : 'Information missing'}</h3>
              </div>
            </div>
            <dl className="registrant-details-grid">
              <DetailItem label="Full name">{participant.emergencyContactName}</DetailItem>
              <DetailItem label="Phone">
                {participant.emergencyContactPhone ? (
                  <a href={`tel:${participant.emergencyContactPhone}`}>
                    <Phone size={15} aria-hidden="true" />
                    {participant.emergencyContactPhone}
                  </a>
                ) : null}
              </DetailItem>
            </dl>
          </section>

          <section className="registrant-details-section">
            <div className="registrant-details-section__heading">
              <span><UserRound size={22} aria-hidden="true" /></span>
              <div>
                <p className="eyebrow">Participant</p>
                <h3>Personal information</h3>
              </div>
            </div>
            <dl className="registrant-details-grid">
              <DetailItem label="Full legal name">{participant.fullName}</DetailItem>
              <DetailItem label="Email">
                {participant.email ? <a href={`mailto:${participant.email}`}>{participant.email}</a> : null}
              </DetailItem>
              <DetailItem label="Phone">
                {participant.phone ? <a href={`tel:${participant.phone}`}>{participant.phone}</a> : null}
              </DetailItem>
              <DetailItem label="Age status">{participant.isMinor ? 'Minor' : 'Adult'}</DetailItem>
              <DetailItem label="Media consent">{participant.mediaConsent ? 'Granted' : 'Not granted'}</DetailItem>
              <DetailItem label="Purchaser">{participant.isPurchaser ? 'Participant is purchaser' : 'Different purchaser'}</DetailItem>
            </dl>
          </section>

          {participant.isMinor && (
            <section className="registrant-details-section">
              <div className="registrant-details-section__heading">
                <span><ShieldCheck size={22} aria-hidden="true" /></span>
                <div>
                  <p className="eyebrow">Minor participant</p>
                  <h3>Parent or guardian</h3>
                </div>
              </div>
              <dl className="registrant-details-grid">
                <DetailItem label="Full name">{participant.guardianName}</DetailItem>
                <DetailItem label="Email">
                  {participant.guardianEmail ? (
                    <a href={`mailto:${participant.guardianEmail}`}>{participant.guardianEmail}</a>
                  ) : null}
                </DetailItem>
              </dl>
            </section>
          )}

          <section className="registrant-details-section">
            <div className="registrant-details-section__heading">
              <span><UserCheck size={22} aria-hidden="true" /></span>
              <div>
                <p className="eyebrow">Registration</p>
                <h3>Purchaser and status</h3>
              </div>
            </div>
            <dl className="registrant-details-grid">
              <DetailItem label="Purchaser name">{purchaser.name}</DetailItem>
              <DetailItem label="Purchaser email">
                {purchaser.email ? <a href={`mailto:${purchaser.email}`}>{purchaser.email}</a> : null}
              </DetailItem>
              <DetailItem label="Purchaser phone">
                {purchaser.phone ? <a href={`tel:${purchaser.phone}`}>{purchaser.phone}</a> : null}
              </DetailItem>
              <DetailItem label="Registered">{formatDate(participant.registeredAt)}</DetailItem>
              <DetailItem label="Registration status">{readable(participant.registrationStatus)}</DetailItem>
              <DetailItem label="Payment status">{readable(participant.paymentStatus)}</DetailItem>
              <DetailItem label="Amount paid">
                {formatMoney(pricing.totalCents, pricing.currency || participant.currency)}
              </DetailItem>
              <DetailItem label="Waiver status">{readable(participant.waiverStatus)}</DetailItem>
              <DetailItem label="Check-in status">{readable(participant.checkInStatus)}</DetailItem>
            </dl>
          </section>
        </div>

        <footer className="registrant-details-modal__footer">
          <button className="button button--small" type="button" onClick={onClose}>
            Close details
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function InstructorEventParticipants({
  registrations = [],
  loading = false,
  mode = 'registrations',
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(mode === 'waivers' ? 'pending' : 'all');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkError, setBulkError] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const detailsTriggerRef = useRef(null);

  const participants = useMemo(() => registrations.flatMap((registration) => (
    (registration.participants || []).map((participant) => ({
      ...participant,
      purchaser: registration.purchaser || null,
      registrationId: registration.id,
      pricing: registration.pricing || null,
      currency: registration.currency || registration.pricing?.currency || 'usd',
      registeredAt: registration.paidAt || registration.createdAt || null,
      registrationStatus: registration.registrationStatus,
      paymentStatus: registration.paymentStatus,
    }))
  )), [registrations]);

  const closeDetails = () => {
    setSelectedParticipant(null);
    window.requestAnimationFrame(() => detailsTriggerRef.current?.focus());
  };

  const pendingParticipants = useMemo(
    () => participants.filter((participant) => participant.waiverStatus === 'pending'),
    [participants],
  );

  const visibleParticipants = useMemo(() => participants.filter((participant) => {
    const haystack = [
      participant.fullName,
      participant.email,
      participant.guardianName,
      participant.guardianEmail,
      participant.purchaser?.name,
      participant.purchaser?.email,
    ].filter(Boolean).join(' ').toLowerCase();
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;

    const hasWaiver = waiverComplete(participant);
    const hasEmergencyContact = emergencyContactComplete(participant);
    const checkedIn = participant.checkInStatus === 'checked_in';

    if (filter === 'pending') return participant.waiverStatus === 'pending';
    if (filter === 'complete') return hasWaiver;
    if (filter === 'attention') return !hasWaiver || !hasEmergencyContact;
    if (filter === 'ready') return hasWaiver && hasEmergencyContact && !checkedIn;
    if (filter === 'checked_in') return checkedIn;
    return true;
  }), [filter, participants, query]);

  const filters = mode === 'waivers'
    ? [
        ['pending', `Needs signature (${pendingParticipants.length})`],
        ['complete', `Complete (${participants.length - pendingParticipants.length})`],
        ['all', `All (${participants.length})`],
      ]
    : [
        ['all', `All (${participants.length})`],
        ['attention', 'Needs attention'],
        ['ready', 'Ready'],
        ['checked_in', 'Checked in'],
      ];

  const sendAllReminders = async () => {
    if (!pendingParticipants.length) return;
    if (!window.confirm(
      `Email ${pendingParticipants.length} waiver reminder${pendingParticipants.length === 1 ? '' : 's'} now?`,
    )) return;

    setBulkBusy(true);
    setBulkMessage('');
    setBulkError('');
    let sentCount = 0;
    const failures = [];
    for (const participant of pendingParticipants) {
      try {
        await sendWaiverReminder({
          scope: 'event',
          waiverId: participant.waiverId || participant.id,
        });
        sentCount += 1;
      } catch (error) {
        failures.push(error?.message || `${participant.fullName}: reminder failed`);
      }
    }
    if (sentCount) {
      setBulkMessage(`${sentCount} waiver reminder${sentCount === 1 ? '' : 's'} sent.`);
    }
    if (failures.length) {
      setBulkError(
        failures.length === 1
          ? failures[0]
          : `${failures.length} reminders could not be sent. Try those participants individually.`,
      );
    }
    setBulkBusy(false);
  };

  if (loading) {
    return <p className="event-operations-loading">Loading selected-event participants…</p>;
  }

  return (
    <section className="event-operations-panel">
      <div className="event-operations-toolbar">
        <label className="event-check-in-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search participant, guardian, or purchaser"
          />
        </label>

        <div className="event-check-in-filters" role="group" aria-label="Participant filters">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'is-active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'waivers' && pendingParticipants.length > 0 && (
        <div className="event-bulk-action">
          <div>
            <p className="eyebrow">Waiver follow-up</p>
            <strong>
              {pendingParticipants.length} participant
              {pendingParticipants.length === 1 ? '' : 's'} still need a signature
            </strong>
          </div>
          <button
            className="button button--small"
            type="button"
            disabled={bulkBusy}
            onClick={sendAllReminders}
          >
            <Mail size={16} aria-hidden="true" />
            {bulkBusy ? 'Sending reminders…' : 'Email all reminders'}
          </button>
        </div>
      )}

      {bulkMessage && <p className="form-status">{bulkMessage}</p>}
      {bulkError && <p className="form-status form-status--error">{bulkError}</p>}

      {!participants.length && (
        <article className="empty-state-card">
          <UserCheck size={30} aria-hidden="true" />
          <h2>No confirmed participants yet.</h2>
          <p>Participants will appear here after registration is complete.</p>
        </article>
      )}

      {participants.length > 0 && !visibleParticipants.length && (
        <article className="empty-state-card">
          <Search size={28} aria-hidden="true" />
          <h2>No participants match this view.</h2>
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setQuery('');
              setFilter(mode === 'waivers' ? 'pending' : 'all');
            }}
          >
            Clear search and filters
          </button>
        </article>
      )}

      <div className="event-participant-operations-list">
        {visibleParticipants.map((participant) => {
          const hasWaiver = waiverComplete(participant);
          const hasEmergencyContact = emergencyContactComplete(participant);
          const checkedIn = participant.checkInStatus === 'checked_in';
          return (
            <article
              className={`event-participant-operation${
                !hasWaiver || !hasEmergencyContact ? ' is-attention' : ''
              }`}
              key={participant.id}
            >
              <div className="event-participant-operation__identity">
                <strong>{participant.fullName}</strong>
                <span>{participant.email || 'Email not listed'}</span>
                {participant.isMinor && (
                  <span>Minor · Guardian: {participant.guardianName || 'Not listed'}</span>
                )}
                <small>
                  Purchased by {participant.purchaser?.name
                    || participant.purchaser?.email
                    || 'registration purchaser'}
                </small>
              </div>

              <div className="event-participant-operation__statuses">
                <span className={`event-check-in-status ${hasWaiver ? 'is-complete' : 'is-warning'}`}>
                  {hasWaiver
                    ? <CheckCircle2 size={16} aria-hidden="true" />
                    : <ShieldAlert size={16} aria-hidden="true" />}
                  Waiver {hasWaiver ? 'complete' : readable(participant.waiverStatus)}
                </span>
                <span className={`event-check-in-status ${
                  hasEmergencyContact ? 'is-complete' : 'is-warning'
                }`}>
                  <ShieldCheck size={16} aria-hidden="true" />
                  {hasEmergencyContact ? 'Emergency contact ready' : 'Emergency contact missing'}
                </span>
                <span className={`event-check-in-status ${checkedIn ? 'is-complete' : ''}`}>
                  <UserCheck size={16} aria-hidden="true" />
                  {checkedIn ? 'Checked in' : 'Not checked in'}
                </span>
              </div>

              <div className="event-participant-operation__actions">
                <button
                  className="button button--small"
                  type="button"
                  onClick={(event) => {
                    detailsTriggerRef.current = event.currentTarget;
                    setSelectedParticipant(participant);
                  }}
                >
                  <Eye size={16} aria-hidden="true" />
                  View details
                </button>
                {['signed', 'covered'].includes(participant.waiverStatus) && (
                  <SignedWaiverDocumentActions
                    scope="event"
                    waiverId={participant.waiverId || participant.id}
                    participantName={participant.fullName}
                    coverageSource={participant.coverageSource}
                  />
                )}
                {participant.waiverStatus === 'pending' && (
                  <>
                    <WaiverReminderButton
                      scope="event"
                      waiverId={participant.waiverId || participant.id}
                      participantName={participant.fullName}
                    />
                    <Link
                      className="button button--small button--dark-ghost"
                      to={`/events/waiver/${encodeURIComponent(participant.id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open waiver
                    </Link>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {selectedParticipant && (
        <RegistrantDetailsModal participant={selectedParticipant} onClose={closeDetails} />
      )}
    </section>
  );
}
