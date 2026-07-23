import {
  ArrowLeft,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  UserCheck,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import {
  getEventCheckIn,
  setEventParticipantCheckIn,
} from '../services/events';

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

function formatCheckInTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function readable(value) {
  return String(value || '').replaceAll('_', ' ');
}

function waiverComplete(participant, waiverRequired) {
  return (
    !waiverRequired
    || participant.waiverStatus === 'signed'
    || participant.waiverStatus === 'not_required'
  );
}

function participantMatches(participant, query) {
  if (!query) return true;
  const haystack = [
    participant.fullName,
    participant.email,
    participant.phone,
    participant.guardianName,
    participant.purchaser?.name,
    participant.purchaser?.email,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function InstructorEventCheckIn() {
  const { eventId = '' } = useParams();
  const {
    isInstructor,
    loading: roleLoading,
    error: roleError,
    refresh: refreshRole,
  } = useStudioRole();

  const [eventRecord, setEventRecord] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyParticipantId, setBusyParticipantId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    if (!isInstructor || !eventId) return;
    setLoading(true);
    setError('');
    try {
      const result = await getEventCheckIn(eventId);
      setEventRecord(result.event || null);
      setParticipants(result.participants || []);
    } catch (nextError) {
      console.error(nextError);
      setError(nextError?.message || 'Event check-in could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [eventId, isInstructor]);

  useEffect(() => {
    if (isInstructor && eventId) queueMicrotask(load);
  }, [eventId, isInstructor, load]);

  const waiverRequired = eventRecord?.waiverRequired !== false;

  const summary = useMemo(() => {
    const checkedInCount = participants.filter(
      (participant) => participant.checkInStatus === 'checked_in',
    ).length;
    const waiverCompleteCount = participants.filter(
      (participant) => waiverComplete(participant, waiverRequired),
    ).length;
    return {
      registeredCount: participants.length,
      waiverCompleteCount,
      checkedInCount,
      waitingCount: Math.max(0, participants.length - checkedInCount),
      blockedCount: participants.filter(
        (participant) => (
          participant.checkInStatus !== 'checked_in'
          && !waiverComplete(participant, waiverRequired)
        ),
      ).length,
    };
  }, [participants, waiverRequired]);

  const visibleParticipants = useMemo(() => (
    participants.filter((participant) => {
      if (!participantMatches(participant, query.trim())) return false;
      const isCheckedIn = participant.checkInStatus === 'checked_in';
      const isWaiverComplete = waiverComplete(participant, waiverRequired);

      if (filter === 'ready') return !isCheckedIn && isWaiverComplete;
      if (filter === 'blocked') return !isCheckedIn && !isWaiverComplete;
      if (filter === 'checked_in') return isCheckedIn;
      return true;
    })
  ), [filter, participants, query, waiverRequired]);

  const changeCheckIn = async (participant, action) => {
    if (action === 'undo') {
      const confirmed = window.confirm(
        `Undo check-in for ${participant.fullName}?`,
      );
      if (!confirmed) return;
    }

    setBusyParticipantId(participant.id);
    setError('');
    setMessage('');

    try {
      const result = await setEventParticipantCheckIn(
        participant.id,
        action,
      );
      setParticipants((current) => current.map((item) => (
        item.id === participant.id
          ? {
              ...item,
              checkInStatus: result.checkInStatus,
              checkInAt: result.checkInAt || null,
            }
          : item
      )));
      setMessage(
        action === 'undo'
          ? `${participant.fullName} is no longer checked in.`
          : `${participant.fullName} checked in successfully.`,
      );
    } catch (nextError) {
      console.error(nextError);
      setError(nextError?.message || 'Check-in could not be updated.');
    } finally {
      setBusyParticipantId('');
    }
  };

  if (roleLoading) {
    return <div className="page-loader">Verifying instructor access…</div>;
  }

  if (!isInstructor) {
    return (
      <section className="section section--light">
        <div className="container role-gate">
          <ShieldAlert size={32} />
          <h1>Instructor access required</h1>
          <p>
            {roleError
              || 'This area is available to instructors and administrators.'}
          </p>
          <button className="button" type="button" onClick={refreshRole}>
            Check access again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="instructor-admin-page event-check-in-page">
      <div className="container">
        <div className="admin-page-heading event-check-in-heading">
          <div>
            <Link className="text-link" to="/instructor/events">
              <ArrowLeft size={17} /> Events and registration
            </Link>
            <p className="eyebrow">Event operations</p>
            <h1>{eventRecord?.title || 'Participant check-in'}</h1>
            <p>
              Registration, waiver completion, and arrival check-in remain
              separate for every participant.
            </p>
          </div>
          <button
            className="button button--dark-ghost"
            type="button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={17} /> Refresh
          </button>
        </div>

        {eventRecord && (
          <div className="event-check-in-event-meta">
            <span>
              <CalendarCheck2 size={17} />
              {formatDateTime(eventRecord.startsAt)}
            </span>
            <span>
              <Users size={17} />
              {summary.registeredCount} registered
            </span>
            <span>
              <ShieldCheck size={17} />
              {waiverRequired
                ? 'Waiver required for each participant'
                : 'Waiver not required'}
            </span>
          </div>
        )}

        {message && (
          <p className="form-status">{message}</p>
        )}
        {error && (
          <p className="form-status form-status--error">{error}</p>
        )}

        <div className="event-check-in-summary">
          <article>
            <Users size={20} />
            <strong>{summary.registeredCount}</strong>
            <span>Registered</span>
          </article>
          <article>
            <ShieldCheck size={20} />
            <strong>{summary.waiverCompleteCount}</strong>
            <span>Waivers complete</span>
          </article>
          <article>
            <UserCheck size={20} />
            <strong>{summary.checkedInCount}</strong>
            <span>Checked in</span>
          </article>
          <article>
            <Clock3 size={20} />
            <strong>{summary.waitingCount}</strong>
            <span>Still expected</span>
          </article>
        </div>

        <div className="event-check-in-controls">
          <label className="event-check-in-search">
            <Search size={18} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email, phone, or guardian"
            />
          </label>

          <div
            className="event-check-in-filters"
            role="group"
            aria-label="Check-in filters"
          >
            {[
              ['all', `All (${participants.length})`],
              [
                'ready',
                `Ready (${Math.max(
                  0,
                  summary.registeredCount
                    - summary.checkedInCount
                    - summary.blockedCount,
                )})`,
              ],
              ['blocked', `Waiver needed (${summary.blockedCount})`],
              ['checked_in', `Checked in (${summary.checkedInCount})`],
            ].map(([value, label]) => (
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

        {loading && (
          <p className="page-loader">Loading participant check-in…</p>
        )}

        {!loading && !participants.length && (
          <article className="empty-state-card">
            <Users size={30} />
            <h2>No confirmed participants yet.</h2>
            <p>Participants will appear here after registration is complete.</p>
          </article>
        )}

        {!loading && participants.length > 0 && !visibleParticipants.length && (
          <article className="empty-state-card">
            <Search size={28} />
            <h2>No participants match this view.</h2>
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Clear search and filters
            </button>
          </article>
        )}

        <div className="event-check-in-list">
          {visibleParticipants.map((participant) => {
            const isCheckedIn = participant.checkInStatus === 'checked_in';
            const isWaiverComplete = waiverComplete(
              participant,
              waiverRequired,
            );
            const isBusy = busyParticipantId === participant.id;

            return (
              <article
                className={`event-check-in-person${
                  isCheckedIn ? ' is-checked-in' : ''
                }${!isWaiverComplete ? ' is-blocked' : ''}`}
                key={participant.id}
              >
                <div className="event-check-in-person__identity">
                  <div className="event-check-in-person__initials" aria-hidden="true">
                    {String(participant.fullName || '?')
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div>
                    <h2>{participant.fullName}</h2>
                    <p>{participant.email}</p>
                    {participant.phone && <p>{participant.phone}</p>}
                    {participant.isMinor && (
                      <p>
                        Minor · Guardian: {participant.guardianName || 'Not listed'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="event-check-in-person__statuses">
                  <span className={`event-check-in-status${
                    isWaiverComplete ? ' is-complete' : ' is-warning'
                  }`}>
                    <ShieldCheck size={16} />
                    {isWaiverComplete
                      ? 'Waiver complete'
                      : `Waiver ${readable(participant.waiverStatus || 'pending')}`}
                  </span>
                  <span className={`event-check-in-status${
                    isCheckedIn ? ' is-complete' : ''
                  }`}>
                    <UserCheck size={16} />
                    {isCheckedIn
                      ? `Checked in${
                          participant.checkInAt
                            ? ` at ${formatCheckInTime(participant.checkInAt)}`
                            : ''
                        }`
                      : 'Not checked in'}
                  </span>
                </div>

                <div className="event-check-in-person__actions">
                  {!isWaiverComplete && (
                    <Link
                      className="button button--small button--dark-ghost"
                      to={`/events/waiver/${encodeURIComponent(participant.id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open waiver
                    </Link>
                  )}

                  {isCheckedIn ? (
                    <button
                      className="button button--small button--dark-ghost"
                      type="button"
                      disabled={isBusy}
                      onClick={() => changeCheckIn(participant, 'undo')}
                    >
                      <Undo2 size={16} />
                      {isBusy ? 'Updating…' : 'Undo check-in'}
                    </button>
                  ) : (
                    <button
                      className="button button--small"
                      type="button"
                      disabled={isBusy || !isWaiverComplete}
                      onClick={() => changeCheckIn(participant, 'check_in')}
                    >
                      {isWaiverComplete
                        ? <CheckCircle2 size={16} />
                        : <ShieldAlert size={16} />}
                      {isBusy
                        ? 'Checking in…'
                        : isWaiverComplete
                          ? 'Check in'
                          : 'Waiver required'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
