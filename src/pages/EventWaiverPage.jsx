import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import SignaturePad from '../components/events/SignaturePad';
import { useAuth } from '../context/AuthContext';
import { getEventWaiver, signEventWaiver } from '../services/events';

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

function statusMessage(status) {
  if (status === 'signed') return 'This waiver has been signed.';
  if (status === 'covered') return 'This participant is covered by a current membership waiver.';
  if (status === 'not_required') return 'A waiver is not required for this participant.';
  if (status === 'setup_required') return 'The instructor is still preparing this event waiver.';
  return '';
}

export default function EventWaiverPage() {
  const { user } = useAuth();
  const { participantId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  const storageKey = participantId ? `black-wolf-waiver:${participantId}` : '';
  const accessToken = useMemo(() => {
    if (tokenFromUrl && storageKey) {
      sessionStorage.setItem(storageKey, tokenFromUrl);
      return tokenFromUrl;
    }
    return storageKey ? sessionStorage.getItem(storageKey) || '' : '';
  }, [storageKey, tokenFromUrl]);

  const [waiver, setWaiver] = useState(null);
  const [loading, setLoading] = useState(Boolean(participantId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    participantId ? '' : 'This waiver link is missing its participant ID.',
  );
  const [form, setForm] = useState({
    signerName: '',
    signerEmail: '',
    signerRelationship: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    accepted: false,
    electronicSignatureConsent: false,
    mediaConsent: false,
    signatureDataUrl: '',
  });

  useEffect(() => {
    if (!tokenFromUrl) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [tokenFromUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!participantId) return undefined;

    getEventWaiver(participantId, accessToken)
      .then((result) => {
        if (cancelled) return;
        const nextWaiver = result?.waiver || null;
        setWaiver(nextWaiver);
        setForm((current) => ({
          ...current,
          signerName: nextWaiver?.participant?.isMinor
            ? nextWaiver?.participant?.guardianName || ''
            : nextWaiver?.participant?.fullName || '',
          signerEmail: nextWaiver?.participant?.email || '',
          emergencyContactName: nextWaiver?.participant?.emergencyContactName || '',
          emergencyContactPhone: nextWaiver?.participant?.emergencyContactPhone || '',
          ...(nextWaiver?.participant?.isMinor && {
            signerEmail: nextWaiver?.participant?.guardianEmail
              || nextWaiver?.participant?.email
              || '',
          }),
        }));
      })
      .catch((nextError) => {
        if (cancelled) return;
        console.error(nextError);
        setError(
          nextError?.message === 'internal'
            ? 'This waiver could not be found or is not available yet.'
            : nextError?.message || 'The waiver could not be loaded.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [participantId, accessToken, user?.uid]);

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (
      !form.emergencyContactName.trim()
      || String(form.emergencyContactPhone || '').replace(/\D/g, '').length < 7
    ) {
      setError('Enter an emergency contact name and valid phone number.');
      return;
    }
    if (!form.signatureDataUrl) {
      setError('Draw the electronic signature before submitting.');
      return;
    }

    setBusy(true);
    try {
      const result = await signEventWaiver({
        participantId,
        accessToken,
        ...form,
      });
      setWaiver((current) => ({
        ...current,
        status: result?.status || 'signed',
        signedAt: result?.signedAt || new Date().toISOString(),
        participant: {
          ...current.participant,
          emergencyContactName: form.emergencyContactName,
          emergencyContactPhone: form.emergencyContactPhone,
        },
        signer: {
          name: form.signerName,
          email: form.signerEmail,
          relationship: waiver?.participant?.isMinor ? form.signerRelationship : 'self',
        },
      }));
    } catch (nextError) {
      console.error(nextError);
      setError(nextError?.message || 'The waiver could not be signed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page-loader">Loading event waiver…</div>;

  if (error && !waiver) {
    return (
      <section className="section section--light waiver-page">
        <div className="container waiver-shell waiver-shell--message">
          <ShieldAlert size={34} />
          <h1>Waiver unavailable</h1>
          <p>{error}</p>
          <Link className="button" to="/events">View events</Link>
        </div>
      </section>
    );
  }

  const emergencyContactComplete = Boolean(
    waiver?.participant?.emergencyContactName
    && String(waiver?.participant?.emergencyContactPhone || '').replace(/\D/g, '').length >= 7,
  );
  const complete = (
    waiver?.status === 'signed' || waiver?.status === 'covered'
  ) && emergencyContactComplete;
  const unavailable = waiver?.status === 'setup_required' || waiver?.status === 'not_required';

  return (
    <section className="section section--light waiver-page">
      <div className="container waiver-shell">
        <header className="waiver-page__header">
          <div className="waiver-page__icon"><ShieldCheck /></div>
          <p className="eyebrow">Event waiver</p>
          <h1>{waiver?.terms?.title || 'Event participation waiver'}</h1>
          <p>
            This waiver applies only to <strong>{waiver?.participant?.fullName}</strong> for this event.
          </p>
        </header>

        <article className="waiver-event-summary">
          <div><CalendarDays size={18} /><span><strong>{waiver?.event?.title}</strong>{formatDateTime(waiver?.event?.startsAt)}</span></div>
          <div><MapPin size={18} /><span>{waiver?.event?.location?.name || waiver?.event?.location?.address || 'Location announced separately'}</span></div>
          <div><ShieldCheck size={18} /><span>Waiver version {waiver?.terms?.version || 'not set'}</span></div>
        </article>

        {complete && (
          <article className="waiver-complete-card">
            <CheckCircle2 size={34} />
            <div>
              <h2>
                {waiver?.status === 'covered'
                  ? 'Covered by membership waiver'
                  : 'Waiver signed'}
              </h2>
              <p>
                {waiver?.status === 'covered'
                  ? 'The participant’s current membership waiver covers this eligible event.'
                  : `Signed by ${waiver?.signer?.name || 'the participant'} on ${formatDateTime(waiver?.signedAt)}. A complete copy is being emailed to ${waiver?.signer?.email || (waiver?.participant?.isMinor ? waiver?.participant?.guardianEmail : waiver?.participant?.email)}.`}
                {' '}Event check-in is still completed separately when the participant arrives.
              </p>
              <p>
                Emergency contact: {waiver?.participant?.emergencyContactName} ·{' '}
                {waiver?.participant?.emergencyContactPhone}
              </p>
            </div>
          </article>
        )}

        {unavailable && (
          <article className="waiver-complete-card is-warning">
            <Clock3 size={32} />
            <div>
              <h2>Waiver not ready</h2>
              <p>{statusMessage(waiver?.status)}</p>
            </div>
          </article>
        )}

        {!complete && !unavailable && (
          <form className="waiver-form" onSubmit={submit}>
            {!user && (
              <article className="waiver-member-coverage-card">
                <ShieldCheck size={22} />
                <div>
                  <strong>Already a member with a current waiver?</strong>
                  <p>Sign in to apply verified membership coverage before signing again.</p>
                  <Link
                    className="button button--small"
                    to="/login"
                    state={{ from: { pathname: `/events/waiver/${participantId}` } }}
                  >
                    Sign in
                  </Link>
                </div>
              </article>
            )}

            <article className="waiver-scope-card">
              <p className="eyebrow">Applies to</p>
              <p>{waiver?.terms?.scopeStatement}</p>
            </article>

            <article className="waiver-terms-card">
              <div className="waiver-terms-card__heading">
                <div>
                  <p className="eyebrow">Read before signing</p>
                  <h2>{waiver?.terms?.title}</h2>
                </div>
                <span>Version {waiver?.terms?.version}</span>
              </div>
              <div className="waiver-terms-copy">{waiver?.terms?.body}</div>
            </article>

            <div className="waiver-signer-card">
              <h2>{waiver?.participant?.isMinor ? 'Parent or guardian signature' : 'Participant signature'}</h2>
              <p>
                Participant: <strong>{waiver?.participant?.fullName}</strong>
                {waiver?.participant?.isMinor ? ' (minor)' : ''}
              </p>

              <div className="form-row">
                <label>
                  Emergency contact full name
                  <input
                    required
                    value={form.emergencyContactName}
                    onChange={(event) => update({
                      emergencyContactName: event.target.value,
                    })}
                  />
                </label>
                <label>
                  Emergency contact phone
                  <input
                    required
                    type="tel"
                    value={form.emergencyContactPhone}
                    onChange={(event) => update({
                      emergencyContactPhone: event.target.value,
                    })}
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  Signer full legal name
                  <input
                    required
                    value={form.signerName}
                    onChange={(event) => update({ signerName: event.target.value })}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Verified signer email
                  <input
                    readOnly
                    type="email"
                    value={form.signerEmail}
                    autoComplete="email"
                  />
                </label>
              </div>

              {waiver?.participant?.isMinor && (
                <label>
                  Relationship to participant
                  <input
                    required
                    placeholder="Parent, legal guardian, etc."
                    value={form.signerRelationship}
                    onChange={(event) => update({ signerRelationship: event.target.value })}
                  />
                </label>
              )}

              <label className="waiver-checkbox-row">
                <input
                  type="checkbox"
                  checked={form.accepted}
                  onChange={(event) => update({ accepted: event.target.checked })}
                />
                <span>
                  {waiver?.participant?.isMinor
                    ? waiver?.terms?.minorAcknowledgement
                    : waiver?.terms?.acknowledgement}
                </span>
              </label>

              <label className="waiver-checkbox-row">
                <input
                  type="checkbox"
                  checked={form.electronicSignatureConsent}
                  onChange={(event) => update({ electronicSignatureConsent: event.target.checked })}
                />
                <span>I agree that the electronic signature below has the same intent as my handwritten signature.</span>
              </label>

              {waiver?.mediaConsent?.enabled && (
                <label className="waiver-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.mediaConsent}
                    onChange={(event) => update({ mediaConsent: event.target.checked })}
                  />
                  <span>
                    <strong>Optional photo/video consent.</strong>{' '}
                    {waiver.mediaConsent.text}
                  </span>
                </label>
              )}

              <SignaturePad
                value={form.signatureDataUrl}
                onChange={(signatureDataUrl) => update({ signatureDataUrl })}
                disabled={busy}
              />

              {error && <p className="form-status form-status--error">{error}</p>}

              <button
                className="button button--full"
                type="submit"
                disabled={busy || !form.accepted || !form.electronicSignatureConsent}
              >
                <ShieldCheck size={18} /> {busy ? 'Signing…' : 'Sign waiver'}
              </button>
            </div>
          </form>
        )}

        <p className="waiver-page__legal-note">
          The approved release text is preserved. The event scope above is stored with
          the signed record and emailed copy.
        </p>
      </div>
    </section>
  );
}
