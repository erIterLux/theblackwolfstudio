import {
    ArrowLeft,
    CalendarCheck,
    Check,
    CircleDollarSign,
    Minus,
    PackagePlus,
    Plus,
    RefreshCw,
    Save,
    ShieldAlert,
    Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useStudioRole from '../hooks/useStudioRole';
import {
    adjustPrivateTrainingCredits,
    listPrivateTrainingAdmin,
    recordPrivateTrainingSession,
    savePrivateTrainingOffer,
} from '../services/privateTraining';

const EMPTY_OFFER = {
    id: '',
    name: '',
    shortDescription: '',
    longDescription: '',
    status: 'draft',
    sortOrder: 0,
    pricingModel: 'participant_tiers',
    amount: '',
    unitAmount: '',
    participantAmount1: '',
    participantAmount2: '',
    participantAmount3: '',
    memberDiscountEligible: true,
    sessionCount: 1,
    sessionDurationMinutes: 60,
    expirationDays: 180,
    maxParticipants: 3,
    includedText: '',
    focusAreasText: '',
};

function dollars(cents) {
    const value = Number(cents || 0) / 100;
    return value ? String(value.toFixed(2)).replace(/\.00$/, '') : '';
}

function cents(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

function fromLines(value) {
    return String(value || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
}

function toDraft(offer = {}) {
    const config = offer.privateTraining || {};
    const tiers = offer.participantAmountsCents || {};
    return {
        ...EMPTY_OFFER,
        ...offer,
        id: offer.id || '',
        amount: dollars(offer.amountCents),
        unitAmount: dollars(offer.unitAmountCents),
        participantAmount1: dollars(tiers[1] ?? tiers['1']),
        participantAmount2: dollars(tiers[2] ?? tiers['2']),
        participantAmount3: dollars(tiers[3] ?? tiers['3']),
        sessionCount: config.sessionCount || 1,
        sessionDurationMinutes: config.sessionDurationMinutes || 60,
        expirationDays: config.expirationDays ?? 180,
        maxParticipants: config.maxParticipants || 3,
        includedText: (config.included || []).join('\n'),
        focusAreasText: (config.focusAreas || []).join('\n'),
    };
}

function todayInput() {
    return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.valueOf())
        ? date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        : 'No expiration';
}

export default function InstructorPrivateTrainingAdmin() {
    const { isInstructor, loading: roleLoading, error: roleError, refresh: refreshRole } = useStudioRole();
    const [offers, setOffers] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [draft, setDraft] = useState(EMPTY_OFFER);
    const [sessionForms, setSessionForms] = useState({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const result = await listPrivateTrainingAdmin();
            setOffers(result?.offers || []);
            setPurchases(result?.purchases || []);
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'Private training administration could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isInstructor) queueMicrotask(load);
    }, [isInstructor, load]);

    const activePurchases = useMemo(
        () => purchases.filter((item) => item.status === 'active'),
        [purchases],
    );

    const updateDraft = (patch) => setDraft((current) => ({ ...current, ...patch }));

    const saveOffer = async (event) => {
        event.preventDefault();
        setBusy('offer');
        setMessage('');
        try {
            const result = await savePrivateTrainingOffer({
                offerId: draft.id || undefined,
                name: draft.name,
                shortDescription: draft.shortDescription,
                longDescription: draft.longDescription,
                status: draft.status,
                sortOrder: Number(draft.sortOrder || 0),
                pricingModel: draft.pricingModel,
                amountCents: cents(draft.amount),
                unitAmountCents: cents(draft.unitAmount),
                participantAmountsCents: {
                    1: cents(draft.participantAmount1),
                    2: cents(draft.participantAmount2),
                    3: cents(draft.participantAmount3),
                },
                memberDiscountEligible: draft.memberDiscountEligible,
                sessionCount: Number(draft.sessionCount || 1),
                sessionDurationMinutes: Number(draft.sessionDurationMinutes || 60),
                expirationDays: Number(draft.expirationDays || 0),
                maxParticipants: Number(draft.maxParticipants || 3),
                included: fromLines(draft.includedText),
                focusAreas: fromLines(draft.focusAreasText),
            });
            await load();
            const refreshed = await listPrivateTrainingAdmin();
            const saved = refreshed?.offers?.find((item) => item.id === result.offerId);
            setDraft(saved ? toDraft(saved) : EMPTY_OFFER);
            setMessage('Private training package saved.');
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The package could not be saved.');
        } finally {
            setBusy('');
        }
    };

    const formFor = (purchase) => sessionForms[purchase.id] || {
        participantIds: (purchase.participants || []).map((item) => item.id),
        sessionAt: todayInput(),
        notes: '',
        adjustmentNote: '',
    };

    const updateSessionForm = (purchase, patch) => {
        setSessionForms((current) => ({
            ...current,
            [purchase.id]: { ...formFor(purchase), ...patch },
        }));
    };

    const toggleParticipant = (purchase, participantId) => {
        const form = formFor(purchase);
        const selected = new Set(form.participantIds);
        if (selected.has(participantId)) selected.delete(participantId);
        else selected.add(participantId);
        updateSessionForm(purchase, { participantIds: [...selected] });
    };

    const recordSession = async (purchase) => {
        const form = formFor(purchase);
        setBusy(`session:${purchase.id}`);
        setMessage('');
        try {
            await recordPrivateTrainingSession({
                purchaseId: purchase.id,
                participantIds: form.participantIds,
                sessionAt: `${form.sessionAt}T12:00:00`,
                notes: form.notes,
            });
            updateSessionForm(purchase, { notes: '', sessionAt: todayInput() });
            await load();
            setMessage(`Session recorded for ${purchase.offerName}.`);
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The session could not be recorded.');
        } finally {
            setBusy('');
        }
    };

    const adjustCredits = async (purchase, delta) => {
        const form = formFor(purchase);
        if (!form.adjustmentNote.trim()) {
            setMessage('Add an adjustment note before changing credits.');
            return;
        }

        setBusy(`adjust:${purchase.id}`);
        setMessage('');
        try {
            await adjustPrivateTrainingCredits({
                purchaseId: purchase.id,
                delta,
                notes: form.adjustmentNote,
            });
            updateSessionForm(purchase, { adjustmentNote: '' });
            await load();
            setMessage(`Credits updated for ${purchase.offerName}.`);
        } catch (error) {
            console.error(error);
            setMessage(error?.message || 'The credit adjustment could not be saved.');
        } finally {
            setBusy('');
        }
    };

    if (roleLoading) return <div className="page-loader">Verifying instructor access…</div>;

    if (!isInstructor) {
        return (
            <section className="section section--light">
                <div className="container role-gate">
                    <ShieldAlert size={42} />
                    <h1>Instructor access required</h1>
                    <p>{roleError || 'This area is available to instructors and administrators.'}</p>
                    <button className="button" type="button" onClick={refreshRole}>Check access again</button>
                </div>
            </section>
        );
    }

    return (
        <section className="instructor-admin-page private-training-admin">
            <div className="container">
                <div className="admin-page-heading">
                    <div>
                        <Link className="text-link" to="/instructor"><ArrowLeft size={17} /> Instructor overview</Link>
                        <p className="eyebrow">Instructor tools</p>
                        <h1>Private training</h1>
                        <p>Create packages and manage session credits for groups of up to three.</p>
                    </div>
                    <div className="header-button-group">
                        <Link className="button button--dark-ghost" to="/instructor/private-training/calendar">
                            <CalendarCheck size={17} /> Booking calendar
                        </Link>
                        <Link className="button button--dark-ghost" to="/instructor/availability">
                            <CalendarCheck size={17} /> Availability
                        </Link>
                        <button className="button button--dark-ghost" type="button" onClick={load} disabled={loading}>
                            <RefreshCw size={17} /> Refresh
                        </button>
                    </div>
                </div>

                {message && <p className="form-status">{message}</p>}

                <div className="private-admin-layout">
                    <aside className="private-admin-offer-list">
                        <div className="private-admin-panel-heading">
                            <div><PackagePlus /><h2>Packages</h2></div>
                            <button type="button" className="text-link" onClick={() => setDraft(EMPTY_OFFER)}>
                                <Plus size={16} /> New
                            </button>
                        </div>
                        {offers.map((offer) => (
                            <button
                                key={offer.id}
                                type="button"
                                className={draft.id === offer.id ? 'is-active' : ''}
                                onClick={() => setDraft(toDraft(offer))}
                            >
                                <strong>{offer.name}</strong>
                                <span>{offer.status}</span>
                            </button>
                        ))}
                        {!offers.length && !loading && <p>No packages created yet.</p>}
                    </aside>

                    <form className="private-admin-offer-editor" onSubmit={saveOffer}>
                        <div className="private-admin-panel-heading">
                            <div><CircleDollarSign /><h2>{draft.id ? 'Edit package' : 'New package'}</h2></div>
                        </div>

                        <label>
                            Package name
                            <input required value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
                        </label>
                        <label>
                            Short description
                            <textarea required rows="3" value={draft.shortDescription} onChange={(event) => updateDraft({ shortDescription: event.target.value })} />
                        </label>
                        <label>
                            Full description <span className="optional-label">optional</span>
                            <textarea rows="4" value={draft.longDescription} onChange={(event) => updateDraft({ longDescription: event.target.value })} />
                        </label>

                        <div className="form-row form-row--three">
                            <label>
                                Session credits
                                <input type="number" min="1" max="100" value={draft.sessionCount} onChange={(event) => updateDraft({ sessionCount: event.target.value })} />
                            </label>
                            <label>
                                Minutes per session
                                <input type="number" min="15" max="240" step="15" value={draft.sessionDurationMinutes} onChange={(event) => updateDraft({ sessionDurationMinutes: event.target.value })} />
                            </label>
                            <label>
                                Expires after days
                                <input type="number" min="0" max="730" value={draft.expirationDays} onChange={(event) => updateDraft({ expirationDays: event.target.value })} />
                            </label>
                        </div>

                        <div className="form-row">
                            <label>
                                Maximum participants
                                <select value={draft.maxParticipants} onChange={(event) => updateDraft({ maxParticipants: Number(event.target.value) })}>
                                    <option value="1">1 participant</option>
                                    <option value="2">Up to 2 participants</option>
                                    <option value="3">Up to 3 participants</option>
                                </select>
                            </label>
                            <label>
                                Pricing model
                                <select value={draft.pricingModel} onChange={(event) => updateDraft({ pricingModel: event.target.value })}>
                                    <option value="participant_tiers">Price by group size</option>
                                    <option value="flat">One package price</option>
                                    <option value="per_participant">Price per participant</option>
                                </select>
                            </label>
                        </div>

                        {draft.pricingModel === 'participant_tiers' && (
                            <div className="form-row form-row--three">
                                <label>1 participant ($)<input required value={draft.participantAmount1} onChange={(event) => updateDraft({ participantAmount1: event.target.value })} /></label>
                                {draft.maxParticipants >= 2 && <label>2 participants ($)<input required value={draft.participantAmount2} onChange={(event) => updateDraft({ participantAmount2: event.target.value })} /></label>}
                                {draft.maxParticipants >= 3 && <label>3 participants ($)<input required value={draft.participantAmount3} onChange={(event) => updateDraft({ participantAmount3: event.target.value })} /></label>}
                            </div>
                        )}
                        {draft.pricingModel === 'flat' && (
                            <label>Package price ($)<input required value={draft.amount} onChange={(event) => updateDraft({ amount: event.target.value })} /></label>
                        )}
                        {draft.pricingModel === 'per_participant' && (
                            <label>Price per participant ($)<input required value={draft.unitAmount} onChange={(event) => updateDraft({ unitAmount: event.target.value })} /></label>
                        )}

                        <div className="form-row">
                            <label>
                                Included items <span className="optional-label">one per line</span>
                                <textarea rows="4" value={draft.includedText} onChange={(event) => updateDraft({ includedText: event.target.value })} />
                            </label>
                            <label>
                                Focus areas <span className="optional-label">one per line</span>
                                <textarea rows="4" value={draft.focusAreasText} onChange={(event) => updateDraft({ focusAreasText: event.target.value })} />
                            </label>
                        </div>

                        <div className="form-row">
                            <label>
                                Status
                                <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value })}>
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="hidden">Hidden</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </label>
                            <label>
                                Display order
                                <input type="number" min="0" value={draft.sortOrder} onChange={(event) => updateDraft({ sortOrder: event.target.value })} />
                            </label>
                        </div>

                        <label className="checkbox-row">
                            <input type="checkbox" checked={draft.memberDiscountEligible} onChange={(event) => updateDraft({ memberDiscountEligible: event.target.checked })} />
                            Eligible for automatic member pricing
                        </label>

                        <button className="button" type="submit" disabled={busy === 'offer'}>
                            <Save size={17} /> {busy === 'offer' ? 'Saving…' : 'Save package'}
                        </button>
                    </form>
                </div>

                <section className="private-admin-purchases">
                    <div className="private-admin-section-heading">
                        <div>
                            <p className="eyebrow">Session management</p>
                            <h2>Active private training packages</h2>
                        </div>
                        <span>{activePurchases.length} active</span>
                    </div>

                    {loading && <p className="page-loader">Loading packages…</p>}
                    {!loading && !activePurchases.length && <p>No active packages yet.</p>}

                    <div className="private-admin-purchase-list">
                        {activePurchases.map((purchase) => {
                            const form = formFor(purchase);
                            return (
                                <article className="private-admin-purchase-card" key={purchase.id}>
                                    <div className="private-admin-purchase-card__heading">
                                        <div>
                                            <p className="eyebrow">{purchase.purchaser?.name || purchase.purchaser?.email}</p>
                                            <h3>{purchase.offerName}</h3>
                                        </div>
                                        <div className="private-admin-credit-count">
                                            <strong>{purchase.remainingSessions}</strong>
                                            <span>of {purchase.totalSessions} remaining</span>
                                        </div>
                                    </div>

                                    <div className="private-admin-purchase-meta">
                                        <span><Users size={16} /> {purchase.participantCount} participants</span>
                                        <span><CalendarCheck size={16} /> Expires {formatDate(purchase.expiresAt)}</span>
                                    </div>

                                    <fieldset className="private-session-participants">
                                        <legend>Who attended this session?</legend>
                                        {(purchase.participants || []).map((participant) => (
                                            <label key={participant.id} className="checkbox-row">
                                                <input
                                                    type="checkbox"
                                                    checked={form.participantIds.includes(participant.id)}
                                                    onChange={() => toggleParticipant(purchase, participant.id)}
                                                />
                                                {participant.fullName}
                                            </label>
                                        ))}
                                    </fieldset>

                                    <div className="form-row">
                                        <label>
                                            Session date
                                            <input type="date" value={form.sessionAt} onChange={(event) => updateSessionForm(purchase, { sessionAt: event.target.value })} />
                                        </label>
                                        <label>
                                            Session note <span className="optional-label">optional</span>
                                            <input value={form.notes} onChange={(event) => updateSessionForm(purchase, { notes: event.target.value })} />
                                        </label>
                                    </div>

                                    <button
                                        className="button"
                                        type="button"
                                        disabled={busy === `session:${purchase.id}` || !form.participantIds.length}
                                        onClick={() => recordSession(purchase)}
                                    >
                                        <Check size={17} /> Record one session used
                                    </button>

                                    <div className="credit-adjustment-row">
                                        <label>
                                            Credit adjustment note
                                            <input value={form.adjustmentNote} onChange={(event) => updateSessionForm(purchase, { adjustmentNote: event.target.value })} placeholder="Required for audit history" />
                                        </label>
                                        <button type="button" className="button button--dark-ghost" onClick={() => adjustCredits(purchase, -1)} disabled={busy === `adjust:${purchase.id}`}>
                                            <Minus size={16} /> Remove credit
                                        </button>
                                        <button type="button" className="button button--dark-ghost" onClick={() => adjustCredits(purchase, 1)} disabled={busy === `adjust:${purchase.id}`}>
                                            <Plus size={16} /> Add credit
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            </div>
        </section>
    );
}
