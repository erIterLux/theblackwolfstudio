import {
  CheckCircle2,
  Clock3,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SignaturePad from '../components/events/SignaturePad';
import { useAuth } from '../context/AuthContext';
import {
  getMyMembershipWaiver,
  signMembershipWaiver,
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

export default function MemberWaiverPage() {
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    participantFullName: user?.displayName || '',
    isMinor: false,
    guardianName: '',
    signerName: user?.displayName || '',
    signerRelationship: '',
    accepted: false,
    electronicSignatureConsent: false,
    signatureDataUrl: '',
  });

  useEffect(() => {
    let active = true;
    getMyMembershipWaiver()
      .then((nextResult) => {
        if (!active) return;
        setResult(nextResult);
        const waiver = nextResult?.waiver;
        const participant = waiver?.participant || {};
        setForm((current) => ({
          ...current,
          participantFullName: participant.fullName || user?.displayName || '',
          isMinor: participant.isMinor === true,
          guardianName: participant.guardianName || '',
          signerName: waiver?.signer?.name
            || participant.guardianName
            || participant.fullName
            || user?.displayName
            || '',
          signerRelationship: waiver?.signer?.relationship === 'self'
            ? ''
            : waiver?.signer?.relationship || '',
        }));
      })
      .catch((nextError) => {
        if (!active) return;
        console.error(nextError);
        setError(nextError?.message || 'Your membership waiver could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user]);

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
      const signed = await signMembershipWaiver(form);
      setResult((current) => ({
        ...current,
        waiver: {
          ...current.waiver,
          status: 'signed',
          signedAt: signed?.signedAt || new Date().toISOString(),
          participant: {
            ...current.waiver.participant,
            fullName: form.participantFullName,
            isMinor: form.isMinor,
            guardianName: form.isMinor ? form.guardianName : null,
          },
          signer: {
            name: form.signerName,
            email: user?.email || '',
            relationship: form.isMinor ? form.signerRelationship : 'self',
          },
        },
      }));
    } catch (nextError) {
      console.error(nextError);
      setError(nextError?.message || 'The membership waiver could not be signed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="page-loader">Loading membership waiver…</div>;

  if (error && !result) {
    return (
      <section className="member-page waiver-workspace-page">
        <div className="container waiver-shell waiver-shell--message">
          <ShieldAlert size={34} />
          <h1>Waiver unavailable</h1>
          <p>{error}</p>
        </div>
      </section>
    );
  }

  const waiver = result?.waiver;
  const complete = waiver?.status === 'signed';

  return (
    <section className="member-page waiver-workspace-page">
      <div className="container waiver-shell">
        <header className="waiver-page__header">
          <div className="waiver-page__icon"><ShieldCheck /></div>
          <p className="eyebrow">Membership waiver</p>
          <h1>{waiver?.terms?.title || 'Membership participation waiver'}</h1>
          <p>
            Complete this once for the current waiver version. Eligible events and private
            training can then use this verified coverage.
          </p>
        </header>

        {!result?.eligible && (
          <article className="waiver-complete-card is-warning">
            <Clock3 size={32} />
            <div>
              <h2>An active membership is required</h2>
              <p>You can review this page now and sign after membership activation.</p>
              <Link className="button button--small" to="/membership">View membership</Link>
            </div>
          </article>
        )}

        {complete && (
          <article className="waiver-complete-card">
            <CheckCircle2 size={34} />
            <div>
              <h2>Membership waiver signed</h2>
              <p>
                Signed by {waiver?.signer?.name || 'the participant'} on{' '}
                {formatDateTime(waiver?.signedAt)}. A complete copy is being emailed to{' '}
                {waiver?.signer?.email || user?.email}.
              </p>
            </div>
          </article>
        )}

        {!complete && (
          <form className="waiver-form" onSubmit={submit}>
            <article className="waiver-scope-card">
              <p className="eyebrow">Applies to</p>
              <p>{waiver?.terms?.scopeStatement}</p>
            </article>

            <article className="waiver-terms-card">
              <div className="waiver-terms-card__heading">
                <div>
                  <p className="eyebrow">Attorney-approved terms</p>
                  <h2>{waiver?.terms?.title}</h2>
                </div>
                <span>Version {waiver?.terms?.version}</span>
              </div>
              <div className="waiver-terms-copy">{waiver?.terms?.body}</div>
            </article>

            <div className="waiver-signer-card">
              <h2>Participant and signer</h2>
              <label>
                Participant full legal name
                <input
                  required
                  value={form.participantFullName}
                  onChange={(event) => update({ participantFullName: event.target.value })}
                  autoComplete="name"
                />
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.isMinor}
                  onChange={(event) => update({
                    isMinor: event.target.checked,
                    guardianName: event.target.checked ? form.guardianName : '',
                    signerRelationship: event.target.checked ? form.signerRelationship : '',
                  })}
                />
                The participant is under 18
              </label>

              {form.isMinor && (
                <label>
                  Parent or guardian full legal name
                  <input
                    required
                    value={form.guardianName}
                    onChange={(event) => update({
                      guardianName: event.target.value,
                      signerName: event.target.value,
                    })}
                  />
                </label>
              )}

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
                  <input readOnly type="email" value={user?.email || ''} />
                </label>
              </div>

              {form.isMinor && (
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
                  {form.isMinor
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
                disabled={
                  busy
                  || !result?.eligible
                  || !form.accepted
                  || !form.electronicSignatureConsent
                }
              >
                <ShieldCheck size={18} /> {busy ? 'Signing…' : 'Sign membership waiver'}
              </button>
            </div>
          </form>
        )}

        <p className="waiver-page__legal-note">
          The approved release text is preserved. The membership scope above is stored
          with the signed record and emailed copy.
        </p>
      </div>
    </section>
  );
}
