import { Check, LoaderCircle, Mail } from 'lucide-react';
import { useState } from 'react';
import { sendWaiverReminder } from '../../services/waivers';

export default function WaiverReminderButton({
  scope,
  waiverId,
  participantName = 'participant',
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const sendReminder = async () => {
    setBusy(true);
    setError('');
    try {
      await sendWaiverReminder({ scope, waiverId });
      setSent(true);
    } catch (nextError) {
      setError(nextError?.message || 'The waiver reminder could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="waiver-reminder-action">
      <button
        className="waiver-reminder-button"
        type="button"
        onClick={sendReminder}
        disabled={busy || sent}
        aria-label={`Send waiver reminder for ${participantName}`}
      >
        {busy && <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />}
        {!busy && sent && <Check size={15} aria-hidden="true" />}
        {!busy && !sent && <Mail size={15} aria-hidden="true" />}
        {busy ? 'Sending…' : sent ? 'Reminder sent' : 'Email reminder'}
      </button>
      {error && <small className="waiver-reminder-error" role="alert">{error}</small>}
    </div>
  );
}
