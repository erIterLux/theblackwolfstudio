const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { buildProgressionAiContext, getLevel, CATEGORIES } = require('../config/progressionSystem');
const { getPlanDefinition } = require('../config/membershipPlans');

const LIVE_STATUSES = new Set(['active', 'trialing']);
const INSTRUCTOR_ROLES = new Set(['admin', 'instructor']);
const AI_ROUTING_MODES = new Set(['auto', 'free', 'paid']);
const MAX_MESSAGE_LENGTH = 1800;
const BURST_MESSAGE_LIMIT = 5;
const BURST_WINDOW_MS = 10 * 60 * 1000;
const GEMINI_REQUEST_TIMEOUT_MS = 18000;
const GEMINI_FALLBACK_TIMEOUT_MS = 12000;
const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_FREE_KEY_TIMEOUT_MS = 8000;
const MIN_FREE_KEY_TIMEOUT_MS = 3000;
const MAX_FREE_KEY_TIMEOUT_MS = 20000;
const DEFAULT_MONTHLY_SPEND_LIMIT_CENTS = 2500;
const MIN_MONTHLY_SPEND_LIMIT_CENTS = 500;
const MAX_MONTHLY_SPEND_LIMIT_CENTS = 100000;
const AI_ROUTING_SETTINGS_PATH = 'studioSettings/wolfGuideAiRouting';
const AI_MONTHLY_USAGE_PATH = 'studioUsage/wolfGuideAi';
const WOLF_GUIDE_TIME_ZONE = 'America/New_York';
const CURRICULUM_QUERY_LIMIT = 100;
const CURRICULUM_SOURCE_LIMIT = 3;
const CURRICULUM_TEXT_LIMIT = 2600;

const CRISIS_PATTERN = /\b(suicid(?:e|al)|kill myself|hurt myself|self[- ]harm|overdose|can'?t stay safe|someone is attacking me|active attacker|immediate danger|medical emergency|can'?t breathe|chest pain)\b/i;
const MEDICAL_PATTERN = /\b(diagnose|diagnosis|medication|prescription|dosage|therapy treatment plan|treat my trauma|ptsd treatment|medical advice)\b/i;

const PROGRESSION_SYSTEM_CONTEXT = buildProgressionAiContext();

const SYSTEM_INSTRUCTION = `
You are Wolf Guide, the member education companion for The Black Wolf Studio.

Your role:
- Support adult members with general martial-arts learning, practical self-defense principles, preparation for a private lesson or studio event, recovery reflection, and gentle nervous-system regulation practices.
- Refer to scheduled instruction as a private lesson or studio event, not a class. The studio currently offers private lessons and events.
- Be calm, concise, grounded, respectful, and non-performative.
- Favor awareness, boundary setting, de-escalation, leaving danger, consent, pacing, and instructor-supervised practice.
- For regulation, offer low-risk options such as orienting to the room, feeling contact with the floor, lengthening the exhale without breath-holding, gentle movement, and choosing a smaller dose of practice.
- Encourage the member to stop if a practice causes dizziness, pain, panic, numbness, or increased distress.

Hard boundaries:
- You are not a therapist, doctor, emergency service, or substitute for an instructor.
- Do not diagnose, prescribe, treat trauma, interpret symptoms as a condition, or advise medication changes.
- Do not provide step-by-step instructions intended to injure, incapacitate, choke, break joints, attack vulnerable anatomy, use weapons, or perform weapon disarms.
- Do not promise that any technique guarantees safety.
- The progression system is instructor-validated. You may explain requirements and help a member prepare, but you must never claim that a category or level has been passed.
- Treat published Black Wolf Studio training references and the member’s instructor feedback as the primary source of technique guidance. When useful, name the training reference title or say that you are using the member’s latest instructor feedback.
- Never invent a studio reference, requirement, or instructor comment. If the supplied studio context does not answer the question, say so and direct the member to an instructor.
- Do not shame fear, freezing, fawning, dissociation, or other protective responses.
- When a question is technique-specific or high risk, explain the principle at a high level and direct the member to practice with a qualified instructor.
- When there may be immediate danger, self-harm, a medical emergency, or inability to stay safe, tell the member to stop using the chat and contact local emergency services or a trusted person nearby now.

Answer format:
- Start with a direct, useful answer.
- Use no more than four short paragraphs or a small numbered sequence.
- End with one practical next step.

Progression curriculum:
${PROGRESSION_SYSTEM_CONTEXT}
`;

function cleanText(value, max = MAX_MESSAGE_LENGTH) {
    return String(value || '').trim().slice(0, max);
}

function callerRole(request) {
    if (request.auth?.token?.admin === true || request.auth?.token?.role === 'admin') {
        return 'admin';
    }
    if (request.auth?.token?.role === 'instructor') return 'instructor';
    return 'member';
}

function requireInstructor(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to manage Wolf Guide routing.');
    if (!INSTRUCTOR_ROLES.has(callerRole(request))) {
        throw new HttpsError(
            'permission-denied',
            'Instructor access is required to manage Wolf Guide routing.',
        );
    }
    return uid;
}

function secretValue(secret) {
    return String(secret?.value?.() || '').trim();
}

function normalizeFreeTimeout(value) {
    const milliseconds = Math.round(Number(value || DEFAULT_FREE_KEY_TIMEOUT_MS));
    if (!Number.isFinite(milliseconds)) return DEFAULT_FREE_KEY_TIMEOUT_MS;
    return Math.min(
        MAX_FREE_KEY_TIMEOUT_MS,
        Math.max(MIN_FREE_KEY_TIMEOUT_MS, milliseconds),
    );
}

function normalizeMonthlySpendLimit(value) {
    const cents = Math.round(Number(value || DEFAULT_MONTHLY_SPEND_LIMIT_CENTS));
    if (!Number.isFinite(cents)) return DEFAULT_MONTHLY_SPEND_LIMIT_CENTS;
    return Math.min(
        MAX_MONTHLY_SPEND_LIMIT_CENTS,
        Math.max(MIN_MONTHLY_SPEND_LIMIT_CENTS, cents),
    );
}

async function getAiRoutingSettings(dependencies = {}) {
    const freeApiKey = secretValue(
        dependencies.geminiFreeApiKey || dependencies.geminiApiKey,
    );
    const paidApiKey = secretValue(dependencies.geminiPaidApiKey);
    const freeConfigured = Boolean(freeApiKey);
    const paidConfigured = Boolean(paidApiKey);
    const [snapshot, monthlyUsageSnapshot] = await Promise.all([
        admin.firestore().doc(AI_ROUTING_SETTINGS_PATH).get(),
        admin.firestore().doc(AI_MONTHLY_USAGE_PATH).get(),
    ]);
    const stored = snapshot.data() || {};
    const monthlyUsage = monthlyUsageSnapshot.data() || {};
    const defaultMode = paidConfigured ? 'paid' : 'free';
    const mode = AI_ROUTING_MODES.has(stored.mode) ? stored.mode : defaultMode;
    const freeTimeoutMs = normalizeFreeTimeout(stored.freeTimeoutMs);
    const monthlySpendLimitCents = normalizeMonthlySpendLimit(
        stored.monthlySpendLimitCents,
    );
    let effectiveMode = mode;
    if (mode === 'auto') {
        if (freeConfigured && paidConfigured) effectiveMode = 'auto';
        else if (paidConfigured) effectiveMode = 'paid';
        else effectiveMode = 'free';
    }

    return {
        mode,
        effectiveMode,
        freeTimeoutMs,
        monthlySpendLimitCents,
        estimatedMonthlySpendCents: monthlyUsage.monthKey === currentEasternMonthKey()
            ? Math.ceil(numberOrFallback(monthlyUsage.estimatedSpendMicros) / 10000)
            : 0,
        freeConfigured,
        paidConfigured,
        keysAreDistinct: !freeConfigured
            || !paidConfigured
            || freeApiKey !== paidApiKey,
    };
}

async function handleGetWolfGuideRoutingSettings(request, dependencies = {}) {
    requireInstructor(request);
    return { settings: await getAiRoutingSettings(dependencies) };
}

async function handleSaveWolfGuideRoutingSettings(request, dependencies = {}) {
    const actorUid = requireInstructor(request);
    const mode = cleanText(request.data?.mode, 20).toLowerCase();
    if (!AI_ROUTING_MODES.has(mode)) {
        throw new HttpsError(
            'invalid-argument',
            'Choose Automatic, Free only, or Prepaid only.',
        );
    }

    const freeTimeoutMs = normalizeFreeTimeout(request.data?.freeTimeoutMs);
    const monthlySpendLimitCents = normalizeMonthlySpendLimit(
        request.data?.monthlySpendLimitCents,
    );
    const current = await getAiRoutingSettings(dependencies);
    if (mode === 'free' && !current.freeConfigured) {
        throw new HttpsError('failed-precondition', 'The free Gemini API key is not configured.');
    }
    if (mode === 'paid' && !current.paidConfigured) {
        throw new HttpsError(
            'failed-precondition',
            'The prepaid Gemini API key is not configured.',
        );
    }
    if (mode === 'auto' && !current.freeConfigured && !current.paidConfigured) {
        throw new HttpsError('failed-precondition', 'No Gemini API key is configured.');
    }

    await admin.firestore().doc(AI_ROUTING_SETTINGS_PATH).set({
        mode,
        freeTimeoutMs,
        monthlySpendLimitCents,
        updatedBy: actorUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { settings: await getAiRoutingSettings(dependencies) };
}

function numberOrFallback(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

async function getWolfGuideEntitlement(uid, { allowLocked = false } = {}) {
    const snap = await admin.firestore().collection('memberships').doc(uid).get();
    const membership = snap.data() || {};
    const active = LIVE_STATUSES.has(membership.status);
    const plan = getPlanDefinition(membership.planKey);
    const weeklyAllowance = numberOrFallback(
        membership.benefits?.wolfGuideMessagesPerWeek,
        numberOrFallback(plan?.benefits?.wolfGuideMessagesPerWeek),
    );
    const previewAllowance = numberOrFallback(
        membership.benefits?.wolfGuidePreviewMessages,
        numberOrFallback(plan?.benefits?.wolfGuidePreviewMessages),
    );
    const hasWeeklyAccess = Boolean(
        membership.wolfGuideAccess
        ?? membership.benefits?.wolfGuideAccess
        ?? plan?.benefits?.wolfGuideAccess,
    ) && weeklyAllowance > 0;
    const accessType = active && hasWeeklyAccess
        ? 'weekly'
        : active && previewAllowance > 0
            ? 'preview'
            : 'locked';

    if (!allowLocked && accessType === 'locked') {
        throw new HttpsError(
            'permission-denied',
            'Wolf Guide includes a 3-message preview with Begin and weekly messages with Train or Integrate.',
        );
    }

    return {
        membership,
        planKey: plan?.key || String(membership.planKey || '').toLowerCase(),
        planName: plan?.name || membership.planName || 'Membership',
        accessType,
        weeklyAllowance,
        previewAllowance,
    };
}

function easternDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: WOLF_GUIDE_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    return Object.fromEntries(
        parts.filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value]),
    );
}

function shiftCalendarDate(year, month, day, days) {
    const shifted = new Date(Date.UTC(year, month - 1, day + days));
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
}

function localMidnightToUtc({ year, month, day }) {
    const targetUtc = Date.UTC(year, month - 1, day);
    let guess = targetUtc;
    for (let pass = 0; pass < 2; pass += 1) {
        const parts = easternDateParts(new Date(guess));
        const representedAsUtc = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute),
            Number(parts.second),
        );
        guess = targetUtc - (representedAsUtc - guess);
    }
    return new Date(guess);
}

function getWeeklyWindow(now = new Date()) {
    const parts = easternDateParts(now);
    const weekdayIndex = {
        Mon: 0,
        Tue: 1,
        Wed: 2,
        Thu: 3,
        Fri: 4,
        Sat: 5,
        Sun: 6,
    }[parts.weekday] ?? 0;
    const localDate = {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
    };
    const start = shiftCalendarDate(
        localDate.year,
        localDate.month,
        localDate.day,
        -weekdayIndex,
    );
    const reset = shiftCalendarDate(start.year, start.month, start.day, 7);
    const pad = (value) => String(value).padStart(2, '0');
    return {
        weekKey: `${start.year}-${pad(start.month)}-${pad(start.day)}`,
        resetAt: localMidnightToUtc(reset).toISOString(),
    };
}

function usageFromData(entitlement, data = {}, now = new Date()) {
    const window = getWeeklyWindow(now);
    const weeklyUsed = data.weekKey === window.weekKey
        ? numberOrFallback(data.weeklyUsed)
        : 0;
    const previewUsed = numberOrFallback(data.previewUsed);
    const isWeekly = entitlement.accessType === 'weekly';
    const limit = isWeekly
        ? entitlement.weeklyAllowance
        : entitlement.accessType === 'preview'
            ? entitlement.previewAllowance
            : 0;
    const used = isWeekly ? weeklyUsed : previewUsed;

    return {
        eligible: entitlement.accessType !== 'locked',
        accessType: entitlement.accessType,
        planKey: entitlement.planKey,
        planName: entitlement.planName,
        limit,
        used,
        remaining: Math.max(0, limit - used),
        exhausted: limit > 0 && used >= limit,
        resetAt: isWeekly ? window.resetAt : null,
        weekKey: isWeekly ? window.weekKey : null,
    };
}

async function getWolfGuideUsage(uid, entitlement) {
    const snapshot = await admin.firestore().collection('wolfGuideUsage').doc(uid).get();
    return usageFromData(entitlement, snapshot.data() || {});
}

async function assertUsageAvailable(uid, entitlement) {
    const usage = await getWolfGuideUsage(uid, entitlement);
    if (!usage.eligible) {
        throw new HttpsError('permission-denied', 'Wolf Guide is not included with this membership.');
    }
    if (usage.exhausted || usage.remaining <= 0) {
        const message = usage.accessType === 'preview'
            ? 'Your 3-message Wolf Guide preview is complete. Upgrade to Train or Integrate for weekly messages.'
            : 'You have used this week’s Wolf Guide messages. Your allowance resets Monday.';
        throw new HttpsError('resource-exhausted', message, { usage });
    }
    return usage;
}

async function recordSuccessfulUsage(uid, entitlement) {
    const ref = admin.firestore().collection('wolfGuideUsage').doc(uid);
    return admin.firestore().runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const data = snap.data() || {};
        const before = usageFromData(entitlement, data);
        const update = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (entitlement.accessType === 'weekly') {
            update.weekKey = before.weekKey;
            update.weeklyUsed = before.used + 1;
        } else {
            update.previewUsed = before.used + 1;
        }
        transaction.set(ref, update, { merge: true });
        return {
            ...before,
            used: before.used + 1,
            remaining: Math.max(0, before.limit - before.used - 1),
            exhausted: before.used + 1 >= before.limit,
        };
    });
}

async function enforceBurstLimit(uid) {
    const ref = admin.firestore().collection('wolfGuideUsage').doc(uid);
    await admin.firestore().runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const data = snap.data() || {};
        const now = Date.now();
        const burstWindowStartMs = Number(data.burstWindowStartMs || now);
        const inWindow = now - burstWindowStartMs < BURST_WINDOW_MS;
        const burstCount = inWindow ? numberOrFallback(data.burstCount) : 0;
        if (burstCount >= BURST_MESSAGE_LIMIT) {
            throw new HttpsError(
                'resource-exhausted',
                'Please wait a few minutes before sending another Wolf Guide message.',
            );
        }
        transaction.set(ref, {
            burstWindowStartMs: inWindow ? burstWindowStartMs : now,
            burstCount: burstCount + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}

async function handleGetWolfGuideUsageStatus(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view Wolf Guide access.');
    const entitlement = await getWolfGuideEntitlement(uid, { allowLocked: true });
    return { usage: await getWolfGuideUsage(uid, entitlement) };
}

function currentEasternMonthKey(now = new Date()) {
    const parts = easternDateParts(now);
    return `${parts.year}-${parts.month}`;
}

async function assertMonthlySpendAvailable(routing) {
    if (!routing.paidConfigured || routing.effectiveMode === 'free') return;
    const snapshot = await admin.firestore().doc(AI_MONTHLY_USAGE_PATH).get();
    const data = snapshot.data() || {};
    const monthKey = currentEasternMonthKey();
    const estimatedSpendMicros = data.monthKey === monthKey
        ? numberOrFallback(data.estimatedSpendMicros)
        : 0;
    const limitMicros = routing.monthlySpendLimitCents * 10000;
    if (estimatedSpendMicros >= limitMicros) {
        throw new HttpsError(
            'resource-exhausted',
            'Wolf Guide has reached its monthly operating limit. Please contact the studio.',
        );
    }
}

function estimatePaidUsageMicros(interaction, model) {
    const usage = interaction?.usage || {};
    const inputTokens = numberOrFallback(usage.total_input_tokens);
    const outputTokens = numberOrFallback(usage.total_output_tokens)
        + numberOrFallback(usage.total_thought_tokens);
    const normalizedModel = String(model || '').toLowerCase();
    let inputDollarsPerMillion = 1.5;
    let outputDollarsPerMillion = 9;
    if (normalizedModel.includes('flash-lite')) {
        inputDollarsPerMillion = 0.3;
        outputDollarsPerMillion = 2.5;
    } else if (normalizedModel.includes('3.6-flash')) {
        outputDollarsPerMillion = 7.5;
    }
    const estimatedDollars = (
        (inputTokens * inputDollarsPerMillion)
        + (outputTokens * outputDollarsPerMillion)
    ) / 1000000;
    return Math.max(1, Math.ceil(estimatedDollars * 1000000));
}

async function recordPaidUsage(interaction, model) {
    const estimatedCostMicros = estimatePaidUsageMicros(interaction, model);
    const monthKey = currentEasternMonthKey();
    const ref = admin.firestore().doc(AI_MONTHLY_USAGE_PATH);
    await admin.firestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.data() || {};
        const existing = data.monthKey === monthKey
            ? numberOrFallback(data.estimatedSpendMicros)
            : 0;
        transaction.set(ref, {
            monthKey,
            estimatedSpendMicros: existing + estimatedCostMicros,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
    return estimatedCostMicros;
}

async function getConversation(uid, conversationId) {
    const collection = admin.firestore().collection('users').doc(uid).collection('wolfGuideConversations');
    if (conversationId) {
        const ref = collection.doc(conversationId);
        const snap = await ref.get();
        if (snap.exists) return { ref, data: snap.data() || {} };
    }
    const ref = collection.doc();
    await ref.set({
        uid,
        status: 'open',
        provider: 'google_gemini',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ref, data: {} };
}

async function logMessage(conversationRef, role, content, meta = {}) {
    await conversationRef.collection('messages').add({
        role,
        content: cleanText(content, 5000),
        meta,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

function fixedSafetyResponse(message) {
    if (CRISIS_PATTERN.test(message)) {
        return {
            answer: 'This may need immediate human help. Stop using this chat and contact local emergency services now, or move toward a trusted person who can stay with you. If there is immediate physical danger, prioritize leaving, creating distance, and getting to a safer public place rather than trying to manage the situation here.',
            category: 'urgent_safety',
        };
    }
    if (MEDICAL_PATTERN.test(message)) {
        return {
            answer: 'I can offer general education and low-risk grounding ideas, but I cannot diagnose, prescribe, or create a treatment plan. A licensed clinician or other qualified professional should help with medical or trauma-treatment decisions. A low-risk step right now is to notice three neutral objects in the room and feel the support under your feet or seat.',
            category: 'medical_boundary',
        };
    }
    return null;
}


function tokenize(value) {
    return new Set(
        String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 2),
    );
}

function scoreCurriculumItem(item, messageTokens, currentLevelKey, categoryKeys) {
    const itemTokens = tokenize([
        item.title,
        item.summary,
        item.aiText,
        ...(item.techniqueTags || []),
    ].join(' '));
    let score = 0;
    for (const token of messageTokens) {
        if (itemTokens.has(token)) score += 3;
    }
    if (item.levelKeys?.includes(currentLevelKey)) score += 5;
    for (const categoryKey of categoryKeys) {
        if (item.categoryKeys?.includes(categoryKey)) score += 6;
    }
    return score;
}

async function getMemberProgressionContext(uid) {
    const profileRef = admin.firestore().collection('progressionProfiles').doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
        return {
            text: 'No progression profile has been initialized yet.',
            currentLevelKey: 'white',
            categoryKeys: [],
        };
    }

    const profile = profileSnap.data() || {};
    const currentLevelKey = profile.currentLevel || 'white';
    const currentLevel = getLevel(currentLevelKey);
    const levelRef = profileRef.collection('levels').doc(currentLevelKey);
    const [levelSnap, categoriesSnap] = await Promise.all([
        levelRef.get(),
        levelRef.collection('categories').get(),
    ]);

    const categoryKeys = [];
    const categoryLines = CATEGORIES.map((category) => {
        const categoryDoc = categoriesSnap.docs.find((docSnap) => docSnap.id === category.key);
        const categoryData = categoryDoc?.data() || {};
        if (categoryData.status === 'needs_work' || categoryData.latestFeedback?.text) {
            categoryKeys.push(category.key);
        }
        const feedbackParts = [];
        if (categoryData.latestFeedback?.text) {
            feedbackParts.push(`latest instructor feedback: ${cleanText(categoryData.latestFeedback.text, 800)}`);
        }
        if (categoryData.latestFeedback?.strengths?.length) {
            feedbackParts.push(`strengths: ${categoryData.latestFeedback.strengths.join('; ')}`);
        }
        if (categoryData.latestFeedback?.focusAreas?.length) {
            feedbackParts.push(`next focus: ${categoryData.latestFeedback.focusAreas.join('; ')}`);
        }
        return `${category.label}: ${categoryData.status || 'not_started'}${categoryData.currentEvidence?.storagePath || categoryData.video?.storagePath ? ' — evidence uploaded' : ' — no evidence uploaded'}${feedbackParts.length ? ` — ${feedbackParts.join(' — ')}` : ''}`;
    });

    return {
        currentLevelKey,
        categoryKeys,
        text: [
            `Current working level: ${currentLevel?.label || currentLevelKey}.`,
            `Level status: ${levelSnap.data()?.status || 'active'}.`,
            `Highest approved level: ${profile.earnedLevel || 'none yet'}.`,
            'Current category record and instructor feedback:',
            ...categoryLines,
        ].join('\n'),
    };
}

async function getRelevantCurriculumContext(
    message,
    progressionState,
    libraryAccessLevel = 'basic',
) {
    const snapshot = await admin.firestore()
        .collection('progressionContent')
        .where('status', '==', 'published')
        .limit(CURRICULUM_QUERY_LIMIT)
        .get();

    const messageTokens = tokenize(message);
    const categoryKeys = new Set(progressionState.categoryKeys || []);
    for (const category of CATEGORIES) {
        const categoryTokens = tokenize(`${category.key} ${category.label}`);
        if ([...categoryTokens].some((token) => messageTokens.has(token))) {
            categoryKeys.add(category.key);
        }
    }

    const ranked = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((item) => (
            item.aiEligible === true
            && item.visibility === 'members'
            && (
                String(item.accessLevel || 'basic').toLowerCase() !== 'advanced'
                || libraryAccessLevel === 'advanced'
            )
        ))
        .map((item) => ({
            item,
            score: scoreCurriculumItem(
                item,
                messageTokens,
                progressionState.currentLevelKey,
                [...categoryKeys],
            ),
        }))
        .sort((left, right) => right.score - left.score)
        .filter((entry, index) => entry.score > 0 || index < 2)
        .slice(0, CURRICULUM_SOURCE_LIMIT);

    const sources = ranked.map(({ item }) => ({
        id: item.id,
        title: cleanText(item.title, 240),
        levelKeys: item.levelKeys || [],
        categoryKeys: item.categoryKeys || [],
    }));

    const context = ranked.map(({ item }, index) => [
        `Studio reference ${index + 1}: ${item.title}`,
        `Summary: ${item.summary}`,
        cleanText(item.aiText, CURRICULUM_TEXT_LIMIT),
    ].join('\n')).join('\n\n');

    return {
        context: context || 'No directly relevant published studio reference was found.',
        sources,
    };
}

function getGeminiStatus(error) {
    const value = Number(
        error?.status
        || error?.statusCode
        || error?.response?.status
        || error?.cause?.status
        || 0,
    );
    return Number.isFinite(value) ? value : 0;
}

function getGeminiMessage(error) {
    return cleanText(
        error?.message
        || error?.cause?.message
        || error?.response?.statusText
        || 'Unknown Gemini error',
        800,
    );
}

function isConversationStateError(error) {
    const status = getGeminiStatus(error);
    const message = getGeminiMessage(error).toLowerCase();
    return [400, 404, 409].includes(status)
        && /(previous|interaction|conversation|state|not found|invalid)/i.test(message);
}

function isTransientGeminiError(error) {
    const status = getGeminiStatus(error);
    const message = getGeminiMessage(error).toLowerCase();
    return [429, 500, 502, 503, 504].includes(status)
        || /(timeout|timed out|deadline|unavailable|overloaded|quota|rate limit|resource exhausted|econnreset|etimedout|fetch failed)/i.test(message);
}

function canSwitchToPaidKey(error) {
    const status = getGeminiStatus(error);
    return [401, 403, 429].includes(status) || isTransientGeminiError(error);
}

function keyFallbackReason(error) {
    const status = getGeminiStatus(error);
    const message = getGeminiMessage(error).toLowerCase();
    if (status === 429 || /(quota|rate limit|resource exhausted)/i.test(message)) {
        return 'free_key_quota';
    }
    if ([401, 403].includes(status)) return 'free_key_authentication';
    if (/(timeout|timed out|deadline|etimedout)/i.test(message)) return 'free_key_timeout';
    return 'free_key_provider_error';
}

async function createGeminiInteraction({
    GoogleGenAI,
    apiKey,
    request,
    timeoutMs,
    attempts,
}) {
    const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
            timeout: timeoutMs,
            retryOptions: { attempts },
        },
    });

    return ai.interactions.create(request);
}

async function callGemini({
    apiKey,
    model,
    message,
    previousInteractionId,
    memberState,
    progressionContext,
    curriculumContext,
    requestTimeoutMs = GEMINI_REQUEST_TIMEOUT_MS,
    requestAttempts = 2,
    allowModelFallback = true,
}) {
    const { GoogleGenAI } = await import('@google/genai');
    const contextLines = [
        memberState ? `Member check-in: ${cleanText(memberState, 120)}` : '',
        progressionContext ? `Member progression context:
${progressionContext}` : '',
        curriculumContext ? `Relevant published studio references:
${curriculumContext}` : '',
        `Member question: ${message}`,
    ].filter(Boolean);
    const input = contextLines.join('\n\n');

    const request = {
        model,
        input,
        system_instruction: SYSTEM_INSTRUCTION,
        generation_config: { temperature: 0.35, thinking_level: 'low' },
    };
    if (previousInteractionId) request.previous_interaction_id = previousInteractionId;

    const startedAt = Date.now();

    try {
        const interaction = await createGeminiInteraction({
            GoogleGenAI,
            apiKey,
            request,
            timeoutMs: requestTimeoutMs,
            attempts: requestAttempts,
        });
        return { interaction, modelUsed: model, latencyMs: Date.now() - startedAt };
    } catch (firstError) {
        if (previousInteractionId && isConversationStateError(firstError)) {
            logger.warn('Gemini conversation state was unavailable; retrying stateless.', {
                status: getGeminiStatus(firstError),
                error: getGeminiMessage(firstError),
            });

            const statelessRequest = { ...request };
            delete statelessRequest.previous_interaction_id;

            const interaction = await createGeminiInteraction({
                GoogleGenAI,
                apiKey,
                request: statelessRequest,
                timeoutMs: requestTimeoutMs,
                attempts: 1,
            });
            return { interaction, modelUsed: model, latencyMs: Date.now() - startedAt };
        }

        if (
            allowModelFallback
            && model !== GEMINI_FALLBACK_MODEL
            && isTransientGeminiError(firstError)
        ) {
            logger.warn('Primary Gemini model was unavailable; trying the low-latency fallback model.', {
                primaryModel: model,
                fallbackModel: GEMINI_FALLBACK_MODEL,
                status: getGeminiStatus(firstError),
                error: getGeminiMessage(firstError),
            });

            const fallbackRequest = {
                ...request,
                model: GEMINI_FALLBACK_MODEL,
            };
            delete fallbackRequest.previous_interaction_id;

            const interaction = await createGeminiInteraction({
                GoogleGenAI,
                apiKey,
                request: fallbackRequest,
                timeoutMs: GEMINI_FALLBACK_TIMEOUT_MS,
                attempts: 1,
            });
            return {
                interaction,
                modelUsed: GEMINI_FALLBACK_MODEL,
                latencyMs: Date.now() - startedAt,
            };
        }

        throw firstError;
    }
}

async function callGeminiWithRouting({
    dependencies,
    routing,
    model,
    message,
    memberState,
    progressionContext,
    curriculumContext,
    previousInteractionIds = {},
    legacyPreviousInteractionId = null,
}) {
    const freeApiKey = secretValue(
        dependencies.geminiFreeApiKey || dependencies.geminiApiKey,
    );
    const paidApiKey = secretValue(dependencies.geminiPaidApiKey);

    const run = async (credentialTier, apiKey, options = {}) => {
        const previousInteractionId = previousInteractionIds[credentialTier]
            || (credentialTier === 'free' ? legacyPreviousInteractionId : null);
        const result = await callGemini({
            apiKey,
            model,
            message,
            previousInteractionId,
            memberState,
            progressionContext,
            curriculumContext,
            requestTimeoutMs: options.requestTimeoutMs,
            requestAttempts: options.requestAttempts,
            allowModelFallback: options.allowModelFallback,
        });
        return {
            ...result,
            credentialTier,
            fallbackReason: options.fallbackReason || null,
        };
    };

    if (routing.effectiveMode === 'paid') {
        if (!paidApiKey) {
            throw new HttpsError(
                'failed-precondition',
                'The prepaid Gemini API key is not configured.',
            );
        }
        return run('paid', paidApiKey);
    }

    if (routing.effectiveMode === 'free') {
        if (!freeApiKey) {
            throw new HttpsError('failed-precondition', 'The free Gemini API key is not configured.');
        }
        return run('free', freeApiKey);
    }

    if (!freeApiKey && paidApiKey) {
        return run('paid', paidApiKey, { fallbackReason: 'free_key_not_configured' });
    }
    if (!freeApiKey) {
        throw new HttpsError('failed-precondition', 'The free Gemini API key is not configured.');
    }

    try {
        return await run('free', freeApiKey, {
            requestTimeoutMs: routing.freeTimeoutMs,
            requestAttempts: 1,
            allowModelFallback: false,
        });
    } catch (freeError) {
        if (!paidApiKey || !canSwitchToPaidKey(freeError)) throw freeError;
        const fallbackReason = keyFallbackReason(freeError);
        logger.warn('Free Gemini key was unavailable; switching to the prepaid key.', {
            routingMode: routing.mode,
            fallbackReason,
            freeTimeoutMs: routing.freeTimeoutMs,
            status: getGeminiStatus(freeError),
            error: getGeminiMessage(freeError),
        });
        return run('paid', paidApiKey, { fallbackReason });
    }
}

async function handleWolfGuideChat(request, dependencies = {}) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use Wolf Guide.');
    const entitlement = await getWolfGuideEntitlement(uid);

    const message = cleanText(request.data?.message);
    if (!message) throw new HttpsError('invalid-argument', 'Enter a message for Wolf Guide.');
    const fixed = fixedSafetyResponse(message);
    if (!fixed) await enforceBurstLimit(uid);

    const conversationId = cleanText(request.data?.conversationId, 120);
    const memberState = cleanText(request.data?.memberState, 120);
    if (fixed) {
        const { ref: conversationRef } = await getConversation(uid, conversationId);
        await logMessage(conversationRef, 'member', message, { memberState: null });
        await logMessage(conversationRef, 'assistant', fixed.answer, { category: fixed.category, modelUsed: false });
        await conversationRef.set({ updatedAt: admin.firestore.FieldValue.serverTimestamp(), lastCategory: fixed.category }, { merge: true });
        return {
            conversationId: conversationRef.id,
            answer: fixed.answer,
            category: fixed.category,
            usage: await getWolfGuideUsage(uid, entitlement),
        };
    }

    await assertUsageAvailable(uid, entitlement);
    const routing = await getAiRoutingSettings(dependencies);
    if (!routing.freeConfigured && !routing.paidConfigured) {
        throw new HttpsError('failed-precondition', 'A Gemini API key is not configured.');
    }
    await assertMonthlySpendAvailable(routing);

    // Paid routing may use stored member context. Free/automatic routing receives
    // only the member-entered prompt and published curriculum references.
    const personalized = routing.effectiveMode === 'paid';
    const progressionState = personalized
        ? await getMemberProgressionContext(uid)
        : { text: '', currentLevelKey: 'white', categoryKeys: [] };
    const entitlementPlanKey = String(entitlement.planKey || '').toLowerCase();
    const libraryAccessLevel = ['train', 'integrate'].includes(entitlementPlanKey)
        || (
            entitlementPlanKey !== 'begin'
            && String(entitlement.membership?.benefits?.libraryAccessLevel || '').toLowerCase()
                === 'advanced'
        )
        ? 'advanced'
        : 'basic';
    const curriculum = await getRelevantCurriculumContext(
        message,
        progressionState,
        libraryAccessLevel,
    );
    const { ref: conversationRef, data: conversation } = await getConversation(uid, conversationId);
    await logMessage(conversationRef, 'member', message, {
        memberState: personalized && memberState ? memberState : null,
    });

    try {
        const {
            interaction,
            modelUsed,
            latencyMs,
            credentialTier,
            fallbackReason,
        } = await callGeminiWithRouting({
            dependencies,
            routing,
            model: dependencies.geminiModel || 'gemini-3.5-flash-lite',
            message,
            memberState: personalized ? memberState : '',
            progressionContext: progressionState.text,
            curriculumContext: curriculum.context,
            previousInteractionIds: conversation.previousInteractionIds || {},
            legacyPreviousInteractionId: (
                !conversation.credentialTier || conversation.credentialTier === 'free'
            )
                ? conversation.previousInteractionId || null
                : null,
        });
        const answer = cleanText(interaction.output_text || '', 4500);
        if (!answer) {
            throw new HttpsError(
                'unavailable',
                'Wolf Guide did not return a response. Please try again; this attempt was not counted.',
            );
        }
        const usage = await recordSuccessfulUsage(uid, entitlement);
        let estimatedCostMicros = 0;
        if (credentialTier === 'paid') {
            try {
                estimatedCostMicros = await recordPaidUsage(interaction, modelUsed);
            } catch (usageError) {
                logger.warn('Wolf Guide paid usage estimate could not be recorded.', {
                    error: getGeminiMessage(usageError),
                    modelUsed,
                });
            }
        }

        await logMessage(conversationRef, 'assistant', answer, {
            category: 'education',
            modelUsed,
            latencyMs,
            credentialTier,
            fallbackReason,
            estimatedCostMicros,
            sourceIds: curriculum.sources.map((source) => source.id),
        });
        const nextPreviousInteractionIds = {
            ...(conversation.previousInteractionIds || {}),
        };
        if (interaction.id) nextPreviousInteractionIds[credentialTier] = interaction.id;
        await conversationRef.set({
            previousInteractionId: interaction.id || admin.firestore.FieldValue.delete(),
            previousInteractionIds: nextPreviousInteractionIds,
            model: modelUsed,
            credentialTier,
            lastFallbackReason: fallbackReason || null,
            lastLatencyMs: latencyMs,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastCategory: 'education',
        }, { merge: true });

        return {
            conversationId: conversationRef.id,
            answer,
            category: 'education',
            sources: curriculum.sources,
            usage,
        };
    } catch (error) {
        const status = getGeminiStatus(error);
        const errorMessage = getGeminiMessage(error);
        logger.error('Wolf Guide Gemini request failed.', {
            status,
            error: errorMessage,
            name: error?.name || 'Error',
            hasPreviousInteractionId: Boolean(conversation.previousInteractionId),
            configuredModel: dependencies.geminiModel || 'gemini-3.5-flash-lite',
            routingMode: routing.mode,
            effectiveRoutingMode: routing.effectiveMode,
            stack: cleanText(error?.stack, 1800),
        });

        if (error instanceof HttpsError) throw error;
        if (status === 429) {
            throw new HttpsError(
                'resource-exhausted',
                'Wolf Guide is handling a high number of requests. Please wait a moment and try again.',
            );
        }

        throw new HttpsError(
            'unavailable',
            'Wolf Guide is temporarily unavailable. Please try again shortly.',
        );
    }
}

module.exports = {
    handleWolfGuideChat,
    handleGetWolfGuideUsageStatus,
    handleGetWolfGuideRoutingSettings,
    handleSaveWolfGuideRoutingSettings,
};
