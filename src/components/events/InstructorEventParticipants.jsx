import {
  CheckCircle2,
  Mail,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sendWaiverReminder } from '../../services/waivers';
import SignedWaiverDocumentActions from '../waivers/SignedWaiverDocumentActions';
import WaiverReminderButton from '../waivers/WaiverReminderButton';

function readable(value) {
  return String(value || 'pending').replaceAll('_', ' ');
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

  const participants = useMemo(() => registrations.flatMap((registration) => (
    (registration.participants || []).map((participant) => ({
      ...participant,
      purchaser: registration.purchaser || null,
      registrationId: registration.id,
      pricing: registration.pricing || null,
    }))
  )), [registrations]);

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
    </section>
  );
}
