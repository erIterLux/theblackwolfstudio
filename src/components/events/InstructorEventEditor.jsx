import {
  CalendarClock,
  CircleDollarSign,
  FileSignature,
  MapPin,
  Save,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

export default function InstructorEventEditor({
  draft,
  busy,
  waiverOpen,
  setWaiverOpen,
  updateDraft,
  updateStart,
  applyStandardWaiver,
  onSubmit,
  onPublish,
}) {
  return (
    <form className="events-admin-editor events-admin-settings" onSubmit={onSubmit}>
      <div className="events-admin-form-section">
        <div className="events-admin-subheading">
          <Settings aria-hidden="true" />
          <div><p className="eyebrow">Step 1</p><h3>Event basics</h3></div>
        </div>
        <label>
          Event title
          <input required value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
        </label>
        <label>
          Short description
          <textarea required rows="3" value={draft.shortDescription} onChange={(event) => updateDraft({ shortDescription: event.target.value })} />
        </label>
        <label>
          Full description <span className="optional-label">optional</span>
          <textarea rows="5" value={draft.longDescription} onChange={(event) => updateDraft({ longDescription: event.target.value })} />
        </label>
      </div>

      <div className="events-admin-form-section">
        <div className="events-admin-subheading">
          <CalendarClock aria-hidden="true" />
          <div><p className="eyebrow">Step 2</p><h3>Schedule and registration</h3></div>
        </div>
        <div className="form-row">
          <label>
            Starts
            <input required type="datetime-local" value={draft.startsAt} onChange={(event) => updateStart(event.target.value)} />
          </label>
          <label>
            Ends
            <input required type="datetime-local" min={draft.startsAt} value={draft.endsAt} onChange={(event) => updateDraft({ endsAt: event.target.value })} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Registration opens
            <input
              required
              type="datetime-local"
              max={draft.registrationClosesAt || draft.startsAt}
              value={draft.registrationOpensAt}
              onChange={(event) => updateDraft({ registrationOpensAt: event.target.value })}
            />
          </label>
          <label>
            Registration closes
            <input
              required
              type="datetime-local"
              min={draft.registrationOpensAt}
              max={draft.startsAt}
              value={draft.registrationClosesAt}
              onChange={(event) => updateDraft({ registrationClosesAt: event.target.value })}
            />
          </label>
        </div>
        <label>
          Time zone
          <input value={draft.timezone} onChange={(event) => updateDraft({ timezone: event.target.value })} />
        </label>
      </div>

      <div className="events-admin-form-section">
        <div className="events-admin-subheading">
          <CircleDollarSign aria-hidden="true" />
          <div><p className="eyebrow">Step 3</p><h3>Capacity and pricing</h3></div>
        </div>
        <div className="form-row form-row--three">
          <label>
            Capacity
            <input type="number" min="1" max="2000" value={draft.capacity} onChange={(event) => updateDraft({ capacity: event.target.value })} />
          </label>
          <label>
            Max per purchase
            <input type="number" min="1" max="12" value={draft.maxParticipantsPerOrder} onChange={(event) => updateDraft({ maxParticipantsPerOrder: event.target.value })} />
          </label>
          <label>
            Price per person ($) <span className="optional-label">0 for free</span>
            <input
              required
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={draft.price}
              onChange={(event) => updateDraft({ price: event.target.value })}
            />
          </label>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={draft.memberDiscountEligible} onChange={(event) => updateDraft({ memberDiscountEligible: event.target.checked })} />
          Eligible for automatic member pricing
        </label>
      </div>

      <div className="events-admin-form-section">
        <div className="events-admin-subheading">
          <MapPin aria-hidden="true" />
          <div><p className="eyebrow">Step 4</p><h3>Location</h3></div>
        </div>
        <div className="form-row">
          <label>
            Format
            <select value={draft.locationType} onChange={(event) => updateDraft({ locationType: event.target.value })}>
              <option value="in_person">In person</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <label>
            Location name
            <input value={draft.locationName} onChange={(event) => updateDraft({ locationName: event.target.value })} />
          </label>
        </div>
        <label>
          Address <span className="optional-label">optional</span>
          <input value={draft.locationAddress} onChange={(event) => updateDraft({ locationAddress: event.target.value })} />
        </label>
        {(draft.locationType === 'online' || draft.locationType === 'hybrid') && (
          <label>
            Online link <span className="optional-label">kept in the event record</span>
            <input type="url" value={draft.onlineUrl} onChange={(event) => updateDraft({ onlineUrl: event.target.value })} />
          </label>
        )}
      </div>

      <div className="events-admin-form-section">
        <div className="events-admin-subheading">
          <Users aria-hidden="true" />
          <div><p className="eyebrow">Step 5</p><h3>Participant information</h3></div>
        </div>
        <div className="form-row">
          <label>
            Age requirement <span className="optional-label">optional</span>
            <input value={draft.ageRequirement} onChange={(event) => updateDraft({ ageRequirement: event.target.value })} placeholder="Example: Ages 16+" />
          </label>
          <label>
            Accessibility contact <span className="optional-label">optional</span>
            <input value={draft.accessibilityContact} onChange={(event) => updateDraft({ accessibilityContact: event.target.value })} placeholder="Email or phone for accommodations" />
          </label>
        </div>
        <label>
          Prerequisites or preparation <span className="optional-label">optional</span>
          <textarea rows="3" value={draft.prerequisites} onChange={(event) => updateDraft({ prerequisites: event.target.value })} />
        </label>
        <label>
          Cancellation and refund policy <span className="optional-label">recommended</span>
          <textarea rows="3" value={draft.cancellationPolicy} onChange={(event) => updateDraft({ cancellationPolicy: event.target.value })} />
        </label>
        <label>
          Participant notice <span className="optional-label">optional</span>
          <textarea
            rows="3"
            value={draft.participantNotice}
            onChange={(event) => updateDraft({ participantNotice: event.target.value })}
            placeholder="What to bring, physical intensity, or other important details"
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.mediaConsentEnabled}
            onChange={(event) => updateDraft({ mediaConsentEnabled: event.target.checked })}
          />
          Offer a separate optional photo/video consent
        </label>
        {draft.mediaConsentEnabled && (
          <label>
            Photo/video consent text
            <textarea rows="3" value={draft.mediaConsentText} onChange={(event) => updateDraft({ mediaConsentText: event.target.value })} />
          </label>
        )}
      </div>

      <details
        className="events-admin-advanced"
        open={waiverOpen}
        onToggle={(event) => setWaiverOpen(event.currentTarget.open)}
      >
        <summary>
          <FileSignature size={19} aria-hidden="true" />
          <span>
            <strong>Waiver and consent settings</strong>
            <small>Standard studio waiver · member coverage allowed unless overridden</small>
          </span>
        </summary>
        <div className="events-admin-advanced__content">
          <div className="event-waiver-admin-note">
            <strong>Each participant must have verified waiver coverage.</strong>
            <span>
              The approved New Jersey release is stored with an event-specific scope.
              Current membership waivers cover eligible events unless overridden.
            </span>
            <button className="button button--dark-ghost" type="button" onClick={applyStandardWaiver}>
              <ShieldCheck size={17} aria-hidden="true" /> Restore standard waiver
            </button>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.alwaysRequireEventWaiver}
              onChange={(event) => updateDraft({ alwaysRequireEventWaiver: event.target.checked })}
            />
            Always require this event-specific waiver, even for members
          </label>
          <div className="form-row">
            <label>
              Waiver version
              <input value={draft.waiverVersion} onChange={(event) => updateDraft({ waiverVersion: event.target.value })} placeholder="1 or 2026-01" />
            </label>
            <label>
              Waiver title
              <input value={draft.waiverTitle} onChange={(event) => updateDraft({ waiverTitle: event.target.value })} />
            </label>
          </div>
          <label>
            The Black Wolf Studio waiver text
            <textarea rows="12" value={draft.waiverBody} onChange={(event) => updateDraft({ waiverBody: event.target.value })} />
          </label>
          <label>
            Adult participant acknowledgement
            <textarea rows="2" value={draft.waiverAcknowledgement} onChange={(event) => updateDraft({ waiverAcknowledgement: event.target.value })} />
          </label>
          <label>
            Parent or guardian acknowledgement
            <textarea rows="2" value={draft.waiverMinorAcknowledgement} onChange={(event) => updateDraft({ waiverMinorAcknowledgement: event.target.value })} />
          </label>
        </div>
      </details>

      <div className="events-admin-form-section">
        <div className="events-admin-subheading">
          <Save aria-hidden="true" />
          <div><p className="eyebrow">Step 6</p><h3>Review and publishing</h3></div>
        </div>
        <label>
          Event lifecycle status
          <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value })}>
            <option value="draft">Draft</option>
            {draft.status === 'published' && <option value="published">Published</option>}
            <option value="hidden">Hidden</option>
            <option value="canceled">Canceled</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <p className="events-admin-publish-note">
          Publishing makes the event available according to its registration window.
          Review dates, pricing, capacity, and waiver settings first.
        </p>
      </div>

      <div className="events-admin-save-bar">
        <span>{draft.id ? 'Editing existing event' : 'Creating a new event'}</span>
        <div>
          <button className="button button--dark-ghost" type="submit" disabled={busy}>
            <Save size={17} aria-hidden="true" />
            {busy ? 'Saving…' : draft.status === 'draft' ? 'Save draft' : 'Save changes'}
          </button>
          {draft.status !== 'published' && (
            <button className="button" type="button" disabled={busy} onClick={onPublish}>
              <ShieldCheck size={17} aria-hidden="true" />
              {busy ? 'Publishing…' : 'Review complete · Publish'}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
