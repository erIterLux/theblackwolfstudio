const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { buildProgressionAiContext, getLevel, CATEGORIES } = require('../config/progressionSystem');

const LIVE_STATUSES = new Set(['active', 'trialing']);
const MAX_MESSAGE_LENGTH = 1800;
const MAX_TURNS_PER_HOUR = 40;
const MAX_TURNS_PER_DAY = 120;

const CRISIS_PATTERN = /\b(suicid(?:e|al)|kill myself|hurt myself|self[- ]harm|overdose|can'?t stay safe|someone is attacking me|active attacker|immediate danger|medical emergency|can'?t breathe|chest pain)\b/i;
const MEDICAL_PATTERN = /\b(diagnose|diagnosis|medication|prescription|dosage|therapy treatment plan|treat my trauma|ptsd treatment|medical advice)\b/i;

const PROGRESSION_SYSTEM_CONTEXT = buildProgressionAiContext();

const SYSTEM_INSTRUCTION = `
You are Wolf Guide, the member education companion for The Black Wolf Studio.

Your role:
- Support adult members with general martial-arts learning, practical self-defense principles, preparation for class, recovery reflection, and gentle nervous-system regulation practices.
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

async function assertWolfGuideAccess(uid) {
    const snap = await admin.firestore().collection('memberships').doc(uid).get();
    const membership = snap.data() || {};
    if (!LIVE_STATUSES.has(membership.status) || membership.wolfGuideAccess !== true) {
        throw new HttpsError('permission-denied', 'Wolf Guide is available with an active Train or Integrate membership.');
    }
    return membership;
}

async function enforceRateLimit(uid) {
    const ref = admin.firestore().collection('wolfGuideUsage').doc(uid);
    await admin.firestore().runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const data = snap.data() || {};
        const now = Date.now();
        const hourStart = Number(data.hourStartMs || now);
        const dayStart = Number(data.dayStartMs || now);
        const currentHourCount = now - hourStart < 60 * 60 * 1000 ? Number(data.hourCount || 0) : 0;
        const currentDayCount = now - dayStart < 24 * 60 * 60 * 1000 ? Number(data.dayCount || 0) : 0;

        if (currentHourCount >= MAX_TURNS_PER_HOUR || currentDayCount >= MAX_TURNS_PER_DAY) {
            throw new HttpsError('resource-exhausted', 'Wolf Guide has reached the conversation limit for now. Please return later.');
        }

        transaction.set(ref, {
            hourStartMs: now - hourStart < 60 * 60 * 1000 ? hourStart : now,
            hourCount: currentHourCount + 1,
            dayStartMs: now - dayStart < 24 * 60 * 60 * 1000 ? dayStart : now,
            dayCount: currentDayCount + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
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


async function getMemberProgressionContext(uid) {
    const profileRef = admin.firestore().collection('progressionProfiles').doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
        return 'No progression profile has been initialized yet.';
    }

    const profile = profileSnap.data() || {};
    const currentLevelKey = profile.currentLevel || 'white';
    const currentLevel = getLevel(currentLevelKey);
    const levelRef = profileRef.collection('levels').doc(currentLevelKey);
    const [levelSnap, categoriesSnap] = await Promise.all([
        levelRef.get(),
        levelRef.collection('categories').get(),
    ]);

    const categoryLines = CATEGORIES.map((category) => {
        const categoryDoc = categoriesSnap.docs.find((docSnap) => docSnap.id === category.key);
        const categoryData = categoryDoc?.data() || {};
        return `${category.label}: ${categoryData.status || 'not_started'}${categoryData.instructorNotes ? ' — instructor feedback available' : ''}${categoryData.video?.storagePath ? ' — video uploaded' : ' — no video uploaded'}`;
    });

    return [
        `Current working level: ${currentLevel?.label || currentLevelKey}.`,
        `Level status: ${levelSnap.data()?.status || 'active'}.`,
        `Highest approved level: ${profile.earnedLevel || 'none yet'}.`,
        'Current category record:',
        ...categoryLines,
    ].join('\n');
}

async function callGemini({ apiKey, model, message, previousInteractionId, memberState, progressionContext }) {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const contextLines = [
        memberState ? `Member check-in: ${cleanText(memberState, 120)}` : '',
        progressionContext ? `Member progression context:\n${progressionContext}` : '',
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

    try {
        return await ai.interactions.create(request);
    } catch (error) {
        if (previousInteractionId) {
            logger.warn('Gemini conversation state was unavailable; retrying without prior interaction.', { error: error?.message });
            delete request.previous_interaction_id;
            return ai.interactions.create(request);
        }
        throw error;
    }
}

async function handleWolfGuideChat(request, dependencies = {}) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use Wolf Guide.');
    await assertWolfGuideAccess(uid);

    const message = cleanText(request.data?.message);
    if (!message) throw new HttpsError('invalid-argument', 'Enter a message for Wolf Guide.');
    await enforceRateLimit(uid);

    const conversationId = cleanText(request.data?.conversationId, 120);
    const memberState = cleanText(request.data?.memberState, 120);
    const { ref: conversationRef, data: conversation } = await getConversation(uid, conversationId);
    const progressionContext = await getMemberProgressionContext(uid);
    await logMessage(conversationRef, 'member', message, { memberState: memberState || null });

    const fixed = fixedSafetyResponse(message);
    if (fixed) {
        await logMessage(conversationRef, 'assistant', fixed.answer, { category: fixed.category, modelUsed: false });
        await conversationRef.set({ updatedAt: admin.firestore.FieldValue.serverTimestamp(), lastCategory: fixed.category }, { merge: true });
        return { conversationId: conversationRef.id, answer: fixed.answer, category: fixed.category };
    }

    const apiKey = dependencies.geminiApiKey?.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'Gemini API key is not configured.');

    try {
        const interaction = await callGemini({
            apiKey,
            model: dependencies.geminiModel || 'gemini-3.5-flash',
            message,
            previousInteractionId: conversation.previousInteractionId || null,
            memberState,
            progressionContext,
        });
        const answer = cleanText(interaction.output_text || '', 4500)
            || 'I could not form a useful response. Please ask your instructor or try a more specific question.';

        await logMessage(conversationRef, 'assistant', answer, { category: 'education', modelUsed: true });
        await conversationRef.set({
            previousInteractionId: interaction.id || admin.firestore.FieldValue.delete(),
            model: dependencies.geminiModel || 'gemini-3.5-flash',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastCategory: 'education',
        }, { merge: true });

        return { conversationId: conversationRef.id, answer, category: 'education' };
    } catch (error) {
        logger.error('Wolf Guide Gemini request failed.', error);
        throw new HttpsError('unavailable', 'Wolf Guide is temporarily unavailable. Please try again shortly.');
    }
}

module.exports = { handleWolfGuideChat };
