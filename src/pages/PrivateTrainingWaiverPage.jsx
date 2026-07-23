import {
  CheckCircle2,
  Clock3,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import SignaturePad from '../components/events/SignaturePad';
import { useAuth } from '../context/AuthContext';
import {
  getPrivateTrainingWaiver,
  signPrivateTrainingWaiver,
} from '../services/waivers';

function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.valueOf())) return '';
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PrivateTrainingWaiverPage() {
  const { user } = useAuth();
  const { waiverId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  const storageKey = waiverId ? `black-wolf-private-waiver:${waiverId}` : '';
  const accessToken = useMemo(() => {
    if (tokenFromUrl && storageKey) {
      sessionStorage.setItem(storageKey, tokenFromUrl);
      return tokenFromUrl;
    }
    return storageKey ? sessionStorage.getItem(storageKey) || '' : '';
  }, [storageKey, tokenFromUrl]);

  const [waiver, setWaiver] = useState(null);
  const [loading, setLoading] = useState(Boolean(waiverId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    waiverId ? '' : 'This waiver link is missing its reference.',
  );
  const [form, setForm] = useState({
    signerName: '',
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
    let active = true;
    if (!waiverId) return undefined;
    getPrivateTrainingWaiver(waiverId, accessToken)
      .then((result) => {
        if (!active) return;
        const nextWaiver = result?.waiver || null;
        setWaiver(nextWaiver);
        setForm((current) => ({
          ...current,
          signerName: nextWaiver?.participant?.isMinor
            ? nextWaiver?.participant?.guardianName || ''
            : nextWaiver?.participant?.fullName || '',
        }));
      })
      .catch((nextError) => {
        if (!active) return;
        console.error(nextError);
        setError(
          nextError?.message === 'internal'
            ? 'This waiver could not be found or is not available yet.'
            : nextError?.message || 'The waiver could not be loaded.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [waiverId, accessToken, user?.uid]);

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
      const result = await signPrivateTrainingWaiver({
        waiverId,
        accessToken,
        ...form,
      });
      setWaiver((current) => ({
        ...current,
        status: result?.status || 'signed',
        signedAt: result?.signedAt || new Date().toISOString(),
        signer: {
          name: form.signerName,
          email: current?.participant?.isMinor
            ? current?.participant?.guardianEmail
            : current?.participant?.email,
          relationship: current?.participant?.isMinor
            ? form.signerRelationship
            : 'self',
        },
      }));
    } catch (nextError) {
      console.error(nextError);
      setError(nextError?.message || 'The waiver could not be signed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page-loader">Loading private-training waiver…</div>;

  if (error && !waiver) {
    return (
      <section className="section section--light waiver-page">
        <div className="container waiver-shell waiver-shell--message">
          <ShieldAlert size={34} />
          <h1>Waiver unavailable</h1>
          <p>{error}</p>
          <Link className="button" to="/private-training">View private training</Link>
        </div>
      </section>
    );
  }

  const complete = waiver?.status === 'signed' || waiver?.status === 'covered';
  const signerEmail = waiver?.participant?.isMinor
    ? waiver?.participant?.guardianEmail || waiver?.participant?.email
    : waiver?.participant?.email;

  return (
    <section className="section section--light waiver-page">
      <div className="container waiver-shell">
        <header className="waiver-page__header">
          <div className="waiver-page__icon"><ShieldCheck /></div>
          <p className="eyebrow">Private-training waiver</p>
          <h1>{waiver?.terms?.title || 'Private-training participation waiver'}</h1>
          <p>
            This record is for <strong>{waiver?.participant?.fullName}</strong> and
            the private-training package shown below.
          </p>
        </header>

        <article className="waiver-event-summary">
          <div>
            <Users size={18} />
            <span>
              <strong>{waiver?.privateTraining?.title}</strong>
              {waiver?.privateTraining?.sessionCount || 0} session credits
            </span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <span>Waiver version {waiver?.terms?.version || 'not set'}</span>
          </div>
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
                  ? 'The participant’s current membership waiver covers this eligible private training.'
                  : `Signed by ${waiver?.signer?.name || 'the participant'} on ${formatDateTime(waiver?.signedAt)}. A complete copy is being emailed to ${waiver?.signer?.email || signerEmail}.`}
              </p>
            </div>
          </article>
        )}

        {!complete && (
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
                    state={{ from: { pathname: `/private-training/waiver/${waiverId}` } }}
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
              <h2>
                {waiver?.participant?.isMinor
                  ? 'Parent or guardian signature'
                  : 'Participant signature'}
              </h2>
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
                  Verified signer email
                  <input readOnly type="email" value={signerEmail || ''} />
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
                  onChange={(event) => update({
                    electronicSignatureConsent: event.target.checked,
                  })}
                />
                <span>
                  I agree that the electronic signature below has the same intent as my
                  handwritten signature.
                </span>
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
          The approved release text is preserved. The package scope above is stored with
          the signed record and emailed copy.
        </p>
      </div>
    </section>
  );
}
