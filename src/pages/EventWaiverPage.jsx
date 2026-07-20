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
  if (status === 'not_required') return 'A waiver is not required for this participant.';
  if (status === 'setup_required') return 'The instructor is still preparing this event waiver.';
  return '';
}

export default function EventWaiverPage() {
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
    accepted: false,
    electronicSignatureConsent: false,
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
        }));
      })
      .catch((nextError) => {
        if (cancelled) return;
        console.error(nextError);
        setError(nextError?.message || 'The waiver could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [participantId, accessToken]);

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');

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
          <ShieldAlert size={44} />
          <h1>Waiver unavailable</h1>
          <p>{error}</p>
          <Link className="button" to="/events">View events</Link>
        </div>
      </section>
    );
  }

  const complete = waiver?.status === 'signed';
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
            <CheckCircle2 size={44} />
            <div>
              <h2>Waiver signed</h2>
              <p>
                Signed by {waiver?.signer?.name || 'the participant'} on {formatDateTime(waiver?.signedAt)}.
                Event check-in is still completed separately when the participant arrives.
              </p>
            </div>
          </article>
        )}

        {unavailable && (
          <article className="waiver-complete-card is-warning">
            <Clock3 size={40} />
            <div>
              <h2>Waiver not ready</h2>
              <p>{statusMessage(waiver?.status)}</p>
            </div>
          </article>
        )}

        {!complete && !unavailable && (
          <form className="waiver-form" onSubmit={submit}>
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
                  Signer full legal name
                  <input
                    required
                    value={form.signerName}
                    onChange={(event) => update({ signerName: event.target.value })}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Signer email
                  <input
                    required
                    type="email"
                    value={form.signerEmail}
                    onChange={(event) => update({ signerEmail: event.target.value })}
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
          The waiver language is supplied by The Black Wolf Studio. Questions about the terms should be directed to the studio before signing.
        </p>
      </div>
    </section>
  );
}
