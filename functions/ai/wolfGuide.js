const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { buildProgressionAiContext, getLevel, CATEGORIES } = require('../config/progressionSystem');

const LIVE_STATUSES = new Set(['active', 'trialing']);
const MAX_MESSAGE_LENGTH = 1800;
const MAX_TURNS_PER_HOUR = 40;
const MAX_TURNS_PER_DAY = 120;
const GEMINI_REQUEST_TIMEOUT_MS = 18000;
const GEMINI_FALLBACK_TIMEOUT_MS = 12000;
const GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const CURRICULUM_QUERY_LIMIT = 100;
const CURRICULUM_SOURCE_LIMIT = 3;
const CURRICULUM_TEXT_LIMIT = 2600;

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

async function getRelevantCurriculumContext(message, progressionState) {
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
        .filter((item) => item.aiEligible === true && item.visibility === 'members')
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
        || /(timeout|timed out|deadline|unavailable|overloaded|econnreset|etimedout|fetch failed)/i.test(message);
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

async function callGemini({ apiKey, model, message, previousInteractionId, memberState, progressionContext, curriculumContext }) {
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
            timeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
            attempts: 2,
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
                timeoutMs: GEMINI_REQUEST_TIMEOUT_MS,
                attempts: 1,
            });
            return { interaction, modelUsed: model, latencyMs: Date.now() - startedAt };
        }

        if (model !== GEMINI_FALLBACK_MODEL && isTransientGeminiError(firstError)) {
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
    const progressionState = await getMemberProgressionContext(uid);
    const curriculum = await getRelevantCurriculumContext(message, progressionState);
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
        const {
            interaction,
            modelUsed,
            latencyMs,
        } = await callGemini({
            apiKey,
            model: dependencies.geminiModel || 'gemini-3.5-flash',
            message,
            previousInteractionId: conversation.previousInteractionId || null,
            memberState,
            progressionContext: progressionState.text,
            curriculumContext: curriculum.context,
        });
        const answer = cleanText(interaction.output_text || '', 4500)
            || 'I could not form a useful response. Please ask your instructor or try a more specific question.';

        await logMessage(conversationRef, 'assistant', answer, {
            category: 'education',
            modelUsed,
            latencyMs,
            sourceIds: curriculum.sources.map((source) => source.id),
        });
        await conversationRef.set({
            previousInteractionId: interaction.id || admin.firestore.FieldValue.delete(),
            model: modelUsed,
            lastLatencyMs: latencyMs,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastCategory: 'education',
        }, { merge: true });

        return {
            conversationId: conversationRef.id,
            answer,
            category: 'education',
            sources: curriculum.sources,
        };
    } catch (error) {
        const status = getGeminiStatus(error);
        const errorMessage = getGeminiMessage(error);
        logger.error('Wolf Guide Gemini request failed.', {
            status,
            error: errorMessage,
            name: error?.name || 'Error',
            hasPreviousInteractionId: Boolean(conversation.previousInteractionId),
            configuredModel: dependencies.geminiModel || 'gemini-3.5-flash',
            stack: cleanText(error?.stack, 1800),
        });

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

module.exports = { handleWolfGuideChat };
