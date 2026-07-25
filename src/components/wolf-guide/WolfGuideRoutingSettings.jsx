import {
  Gauge,
  KeyRound,
  LoaderCircle,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getWolfGuideRoutingSettings,
  saveWolfGuideRoutingSettings,
} from '../../services/wolfGuide';

const MODE_LABELS = {
  auto: 'Automatic',
  free: 'Free only',
  paid: 'Prepaid only',
};

function toDraft(settings) {
  return {
    mode: settings?.mode || 'free',
    freeTimeoutSeconds: Math.round(Number(settings?.freeTimeoutMs || 8000) / 1000),
  };
}

export default function WolfGuideRoutingSettings() {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(() => toDraft(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getWolfGuideRoutingSettings()
      .then((result) => {
        if (cancelled) return;
        const nextSettings = result?.settings || null;
        setSettings(nextSettings);
        setDraft(toDraft(nextSettings));
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError?.message || 'Wolf Guide routing settings could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const result = await saveWolfGuideRoutingSettings({
        mode: draft.mode,
        freeTimeoutMs: Number(draft.freeTimeoutSeconds) * 1000,
      });
      const nextSettings = result?.settings || null;
      setSettings(nextSettings);
      setDraft(toDraft(nextSettings));
      setMessage('Wolf Guide routing updated.');
    } catch (nextError) {
      setError(nextError?.message || 'Wolf Guide routing could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <article className="wolf-guide-routing-card wolf-guide-routing-card--loading" aria-busy="true">
        <LoaderCircle className="is-spinning" size={22} aria-hidden="true" />
        <span>Loading Wolf Guide routing…</span>
      </article>
    );
  }

  return (
    <form className="wolf-guide-routing-card" onSubmit={save}>
      <header className="wolf-guide-routing-card__heading">
        <div>
          <p className="eyebrow">AI operations</p>
          <h3>Wolf Guide routing</h3>
          <p>
            Start with the free Gemini key, then use the prepaid key when the free
            request exceeds your deadline or encounters a quota or provider error.
          </p>
        </div>
        <Gauge size={26} aria-hidden="true" />
      </header>

      <div className="wolf-guide-key-status" aria-label="Gemini key configuration">
        <span className={settings?.freeConfigured ? 'is-ready' : 'is-missing'}>
          <KeyRound size={16} aria-hidden="true" />
          Free key {settings?.freeConfigured ? 'configured' : 'not configured'}
        </span>
        <span className={settings?.paidConfigured ? 'is-ready' : 'is-missing'}>
          <KeyRound size={16} aria-hidden="true" />
          Prepaid key {settings?.paidConfigured ? 'configured' : 'not configured'}
        </span>
      </div>

      <div className="wolf-guide-routing-fields">
        <label>
          Routing mode
          <select
            value={draft.mode}
            onChange={(event) => setDraft((current) => ({
              ...current,
              mode: event.target.value,
            }))}
          >
            <option value="auto">Automatic (recommended)</option>
            <option value="free" disabled={!settings?.freeConfigured}>Free only</option>
            <option value="paid" disabled={!settings?.paidConfigured}>Prepaid only</option>
          </select>
        </label>

        <label>
          Free-key deadline
          <span className="wolf-guide-timeout-input">
            <input
              type="number"
              min="3"
              max="20"
              step="1"
              required
              value={draft.freeTimeoutSeconds}
              disabled={draft.mode !== 'auto' || !settings?.freeConfigured}
              onChange={(event) => setDraft((current) => ({
                ...current,
                freeTimeoutSeconds: event.target.value,
              }))}
            />
            <span>seconds</span>
          </span>
        </label>
      </div>

      <div className="wolf-guide-routing-summary">
        <ShieldCheck size={18} aria-hidden="true" />
        <p>
          <strong>Currently: {MODE_LABELS[settings?.effectiveMode] || 'Not configured'}.</strong>{' '}
          Automatic routing is sequential: the same request is never sent to both keys
          at the same time.
        </p>
      </div>

      {draft.mode === 'auto' && !settings?.paidConfigured && (
        <p className="form-status">
          Automatic mode will behave as Free only until the prepaid Firebase secret is configured.
        </p>
      )}
      {draft.mode === 'auto' && !settings?.freeConfigured && settings?.paidConfigured && (
        <p className="form-status">
          Automatic mode currently starts with the prepaid key because the free key is not configured.
        </p>
      )}
      {settings?.freeConfigured
        && settings?.paidConfigured
        && settings?.keysAreDistinct === false && (
          <p className="form-status">
            Both secret slots contain the same API key. Use keys from different Gemini
            projects for this fallback to change quota or billing behavior.
          </p>
      )}
      {message && <p className="form-status form-status--success">{message}</p>}
      {error && <p className="form-status form-status--error" role="alert">{error}</p>}

      <div className="wolf-guide-routing-card__footer">
        <p>API keys remain encrypted Firebase secrets and are never sent to the browser.</p>
        <button className="button button--small" type="submit" disabled={saving}>
          {saving
            ? <LoaderCircle className="is-spinning" size={16} aria-hidden="true" />
            : <Save size={16} aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save routing'}
        </button>
      </div>
    </form>
  );
}
