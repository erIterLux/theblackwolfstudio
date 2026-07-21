import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  RefreshCw,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import usePrivateTrainingBookings from '../hooks/usePrivateTrainingBookings';
import usePrivateTrainingPurchases from '../hooks/usePrivateTrainingPurchases';
import {
  createPrivateTrainingBooking,
  listPrivateTrainingAvailability,
  updatePrivateTrainingBooking,
} from '../services/privateTraining';

function dateKey(value, timeZone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function formatDate(value, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

function formatTime(value, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function availableCredits(purchase) {
  if (Number.isFinite(Number(purchase.availableSessions))) {
    return Number(purchase.availableSessions);
  }
  return Math.max(
    0,
    Number(purchase.remainingSessions || 0) - Number(purchase.reservedSessions || 0),
  );
}

export default function PrivateTrainingBookingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { bookings } = usePrivateTrainingBookings();
  const {
    activePurchases,
    loading: purchaseLoading,
    error: purchaseError,
  } = usePrivateTrainingPurchases();
  const bookingId = searchParams.get('bookingId') || '';
  const initialPurchaseId = searchParams.get('purchaseId') || '';
  const [purchaseId, setPurchaseId] = useState(initialPurchaseId);
  const [participantIds, setParticipantIds] = useState([]);
  const [availability, setAvailability] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [note, setNote] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const rescheduleBooking = useMemo(
    () => bookings.find((booking) => booking.id === bookingId) || null,
    [bookings, bookingId],
  );

  const bookablePurchases = useMemo(
    () => activePurchases.filter((purchase) => (
      availableCredits(purchase) > 0 || purchase.id === rescheduleBooking?.purchaseId
    )),
    [activePurchases, rescheduleBooking],
  );

  const effectivePurchaseId = rescheduleBooking?.purchaseId
    || purchaseId
    || bookablePurchases[0]?.id
    || '';

  const selectedPurchase = useMemo(
    () => bookablePurchases.find((purchase) => purchase.id === effectivePurchaseId) || null,
    [bookablePurchases, effectivePurchaseId],
  );

  const selectedParticipantIds = useMemo(() => {
    if (rescheduleBooking?.participantIds?.length) return rescheduleBooking.participantIds;
    if (participantIds.length) return participantIds;
    return (selectedPurchase?.participants || []).map((participant) => participant.id);
  }, [participantIds, rescheduleBooking, selectedPurchase]);

  useEffect(() => {
    let cancelled = false;
    if (!effectivePurchaseId) return undefined;

    const load = async () => {
      setLoadingSlots(true);
      setMessage('');
      setSelectedSlot(null);
      try {
        const result = await listPrivateTrainingAvailability({ purchaseId: effectivePurchaseId, bookingId: bookingId || undefined });
        if (!cancelled) setAvailability(result);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setAvailability(null);
          setMessage(error?.message || 'Available session times could not be loaded.');
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    };

    queueMicrotask(load);
    return () => {
      cancelled = true;
    };
  }, [effectivePurchaseId, bookingId]);

  const groupedSlots = useMemo(() => {
    const groups = new Map();
    for (const slot of availability?.slots || []) {
      const key = `${slot.instructorUid}-${dateKey(slot.startsAt, slot.timezone)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          dateKey: dateKey(slot.startsAt, slot.timezone),
          dateLabel: formatDate(slot.startsAt, slot.timezone),
          instructorUid: slot.instructorUid,
          instructorName: slot.instructorName,
          timezone: slot.timezone,
          location: slot.location,
          locationType: slot.locationType,
          slots: [],
        });
      }
      groups.get(key).slots.push(slot);
    }
    return [...groups.values()];
  }, [availability]);

  const toggleParticipant = (id) => {
    setParticipantIds(
      selectedParticipantIds.includes(id)
        ? selectedParticipantIds.filter((value) => value !== id)
        : [...selectedParticipantIds, id],
    );
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedPurchase || !selectedSlot) {
      setMessage('Choose a package and an available session time.');
      return;
    }
    if (!selectedParticipantIds.length) {
      setMessage('Choose at least one registered participant.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const result = bookingId
        ? await updatePrivateTrainingBooking({
            bookingId,
            action: 'reschedule',
            instructorUid: selectedSlot.instructorUid,
            startsAt: selectedSlot.startsAt,
            note,
          })
        : await createPrivateTrainingBooking({
            purchaseId: selectedPurchase.id,
            instructorUid: selectedSlot.instructorUid,
            startsAt: selectedSlot.startsAt,
            participantIds: selectedParticipantIds,
            locationType: selectedSlot.locationType,
            location: selectedSlot.location,
            note,
          });
      navigate('/member/private-training', {
        replace: true,
        state: {
          bookingMessage: bookingId
            ? 'Your private-training session was rescheduled.'
            : result.status === 'requested'
              ? 'Your session request was sent to the instructor.'
              : 'Your private-training session is confirmed.',
        },
      });
    } catch (error) {
      console.error(error);
      setMessage(error?.message || 'The session could not be booked.');
      try {
        const refreshed = await listPrivateTrainingAvailability({ purchaseId: effectivePurchaseId, bookingId: bookingId || undefined });
        setAvailability(refreshed);
        setSelectedSlot(null);
      } catch {
        // Keep the original booking error visible.
      }
    } finally {
      setBusy(false);
    }
  };

  if (purchaseLoading) {
    return <p className="page-loader">Loading private-training packages…</p>;
  }

  return (
    <section className="member-page booking-page">
      <div className="container booking-page__container">
        <div className="member-header member-header--refined">
          <div>
            <Link className="text-link" to="/member/private-training">
              <ArrowLeft size={17} /> Private training
            </Link>
            <p className="eyebrow">{bookingId ? 'Reschedule a session' : 'Book a session'}</p>
            <h1>{bookingId ? 'Choose a new private-training time.' : 'Choose your next private-training time.'}</h1>
            <p>
              {bookingId
                ? 'Your existing credit remains reserved while you choose a new available time.'
                : 'Select an active package, the registered participants attending, and one available instructor time.'}
            </p>
          </div>
        </div>

        {purchaseError && <p className="form-status form-status--error">{purchaseError}</p>}
        {message && <p className="form-status form-status--error">{message}</p>}

        {!bookablePurchases.length ? (
          <article className="empty-state-card">
            <h2>No bookable session credits</h2>
            <p>
              Purchase a private-training package or wait for an existing
              booking to be completed or canceled.
            </p>
            <Link className="button" to="/private-training">Explore packages</Link>
          </article>
        ) : (
          <form className="booking-flow" onSubmit={submit}>
            <section className="booking-panel">
              <div className="booking-panel__heading">
                <CalendarDays aria-hidden="true" />
                <div>
                  <p className="eyebrow">Step 1</p>
                  <h2>Choose a package</h2>
                </div>
              </div>

              <div className="booking-package-options">
                {bookablePurchases.map((purchase) => (
                  <button
                    type="button"
                    className={purchase.id === effectivePurchaseId ? 'is-active' : ''}
                    key={purchase.id}
                    onClick={() => {
                      if (bookingId) return;
                      setPurchaseId(purchase.id);
                      setParticipantIds((purchase.participants || []).map((participant) => participant.id));
                    }}
                    disabled={Boolean(bookingId)}
                  >
                    <strong>{purchase.offerName}</strong>
                    <span>{availableCredits(purchase)} available session{availableCredits(purchase) === 1 ? '' : 's'}</span>
                  </button>
                ))}
              </div>
            </section>

            {selectedPurchase && (
              <section className="booking-panel">
                <div className="booking-panel__heading">
                  <Users aria-hidden="true" />
                  <div>
                    <p className="eyebrow">Step 2</p>
                    <h2>Who is attending?</h2>
                  </div>
                </div>
                <p className="booking-help">
                  One booking uses one package session, whether one, two, or
                  three registered participants attend.
                </p>
                <div className="booking-participant-options">
                  {(selectedPurchase.participants || []).map((participant) => {
                    const selected = selectedParticipantIds.includes(participant.id);
                    return (
                      <button
                        type="button"
                        className={selected ? 'is-active' : ''}
                        key={participant.id}
                        onClick={() => !bookingId && toggleParticipant(participant.id)}
                        disabled={Boolean(bookingId)}
                        aria-pressed={selected}
                      >
                        <span className="booking-check"><Check size={16} /></span>
                        <strong>{participant.fullName}</strong>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="booking-panel">
              <div className="booking-panel__heading">
                <Clock3 aria-hidden="true" />
                <div>
                  <p className="eyebrow">Step 3</p>
                  <h2>Choose an available time</h2>
                </div>
              </div>

              {loadingSlots && (
                <p className="quote-loading"><RefreshCw className="spin" size={17} /> Loading available times…</p>
              )}

              {!loadingSlots && availability && !groupedSlots.length && (
                <div className="booking-no-slots">
                  <h3>No online times are currently available.</h3>
                  <p>Contact the studio or check again after the instructor updates availability.</p>
                  <Link className="text-link" to="/contact?interest=private-training">Contact the studio</Link>
                </div>
              )}

              <div className="booking-slot-groups">
                {groupedSlots.map((group) => (
                  <article className="booking-slot-group" key={group.key}>
                    <div>
                      <p className="eyebrow">{group.instructorName}</p>
                      <h3>{group.dateLabel}</h3>
                      {group.location && (
                        <p><MapPin size={15} /> {group.location}</p>
                      )}
                    </div>
                    <div className="booking-slot-options">
                      {group.slots.map((slot) => {
                        const selected = selectedSlot?.startsAt === slot.startsAt
                          && selectedSlot?.instructorUid === slot.instructorUid;
                        return (
                          <button
                            type="button"
                            className={selected ? 'is-active' : ''}
                            key={`${slot.instructorUid}-${slot.startsAt}`}
                            onClick={() => setSelectedSlot(slot)}
                            aria-pressed={selected}
                          >
                            {formatTime(slot.startsAt, slot.timezone)}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="booking-panel">
              <label>
                Optional note for the instructor
                <textarea
                  rows="4"
                  maxLength="1200"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Share the focus you want for this session or anything the instructor should know."
                />
              </label>
            </section>

            <div className="booking-review-bar">
              <div>
                <p className="eyebrow">Booking summary</p>
                <strong>
                  {selectedSlot
                    ? `${formatDate(selectedSlot.startsAt, selectedSlot.timezone)} at ${formatTime(selectedSlot.startsAt, selectedSlot.timezone)}`
                    : 'Choose a session time'}
                </strong>
                <span>{selectedParticipantIds.length} participant{selectedParticipantIds.length === 1 ? '' : 's'} selected</span>
              </div>
              <button className="button" type="submit" disabled={busy || !selectedSlot || !selectedParticipantIds.length}>
                {busy
                  ? bookingId ? 'Rescheduling…' : 'Booking…'
                  : bookingId
                    ? 'Save new time'
                    : selectedSlot?.requiresApproval
                      ? 'Request session'
                      : 'Confirm booking'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
