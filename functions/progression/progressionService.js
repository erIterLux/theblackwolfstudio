const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const {
    LEVELS,
    CATEGORIES,
    getLevel,
    getCategory,
    getNextLevel,
} = require('../config/progressionSystem');

const db = admin.firestore();
const ALLOWED_REVIEW_STATUSES = new Set(['validated', 'needs_work']);
const MEMBER_EDITABLE_LEVEL_STATUSES = new Set(['active', 'draft', 'needs_work']);
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const LIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing']);
const FEEDBACK_TYPES = new Set(['text', 'audio', 'video']);
const REQUIREMENTS_VERSION = 2;
const LEGACY_LEVEL_MAP = {
    white: 'white',
    brown: 'green',
    gray: 'blue',
    black: 'black',
};
const LEGACY_SOURCE_LEVEL = {
    white: 'white',
    green: 'brown',
    blue: 'gray',
    black: 'black',
};
const CURRENT_LEVEL_STATUSES = new Set([
    'active',
    'draft',
    'submitted',
    'in_review',
    'needs_work',
    'ready_for_approval',
]);

function now() {
    return admin.firestore.FieldValue.serverTimestamp();
}

function clean(value, max = 2000) {
    return String(value || '').trim().slice(0, max);
}

function cleanArray(value, maxItems = 30, itemMax = 500) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => clean(item, itemMax)).filter(Boolean))].slice(0, maxItems);
}

function normalizeEmail(value) {
    return clean(value, 320).toLowerCase();
}

function splitEmailList(value) {
    return String(value || '')
        .split(',')
        .map(normalizeEmail)
        .filter(Boolean);
}

function serialize(value) {
    if (value == null) return value;
    if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(serialize);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
    }
    return value;
}

function requireAuth(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use progression tracking.');
    return uid;
}

async function getStudioRole(uid, token = {}) {
    const tokenRole = String(token.role || '').toLowerCase();
    if (INSTRUCTOR_ROLES.has(tokenRole) || token.admin === true) {
        return token.admin === true ? 'admin' : tokenRole;
    }

    const snap = await db.collection('users').doc(uid).get();
    const role = String(snap.data()?.role || 'member').toLowerCase();
    return INSTRUCTOR_ROLES.has(role) ? role : 'member';
}

async function assertActiveMembership(uid) {
    const membershipSnap = await db.collection('memberships').doc(uid).get();
    const membership = membershipSnap.data() || {};
    if (!LIVE_MEMBERSHIP_STATUSES.has(membership.status)) {
        throw new HttpsError('permission-denied', 'An active studio membership is required for progression tracking.');
    }
    return membership;
}

async function assertInstructor(request) {
    const uid = requireAuth(request);
    const role = await getStudioRole(uid, request.auth?.token || {});
    if (!INSTRUCTOR_ROLES.has(role)) {
        throw new HttpsError('permission-denied', 'Instructor access is required.');
    }
    return { uid, role };
}

async function canManageMember(request, memberUid) {
    const callerUid = requireAuth(request);
    if (callerUid === memberUid) return { callerUid, role: 'member', isInstructor: false };
    const role = await getStudioRole(callerUid, request.auth?.token || {});
    if (!INSTRUCTOR_ROLES.has(role)) {
        throw new HttpsError('permission-denied', 'You cannot update another member’s progression.');
    }
    return { callerUid, role, isInstructor: true };
}

function progressionRefs(memberUid, levelKey = null, categoryKey = null) {
    const profileRef = db.collection('progressionProfiles').doc(memberUid);
    const levelRef = levelKey ? profileRef.collection('levels').doc(levelKey) : null;
    const categoryRef = levelRef && categoryKey
        ? levelRef.collection('categories').doc(categoryKey)
        : null;
    return { profileRef, levelRef, categoryRef };
}

async function getMemberIdentity(uid, authToken = {}) {
    const [userRecord, userSnap] = await Promise.all([
        admin.auth().getUser(uid),
        db.collection('users').doc(uid).get(),
    ]);
    const userData = userSnap.data() || {};
    return {
        displayName: clean(userData.displayName || userRecord.displayName || authToken.name || '', 160),
        email: normalizeEmail(userData.email || userRecord.email || authToken.email || ''),
    };
}

function canonicalLegacyLevelKey(levelKey) {
    const key = clean(levelKey, 40);
    return LEGACY_LEVEL_MAP[key] || key;
}

async function synchronizeProgressionProfile(profileRef, profile) {
    if (Number(profile.requirementsVersion || 0) >= REQUIREMENTS_VERSION) return profile;

    const legacyLevelsSnapshot = await profileRef.collection('levels').get();
    const legacyLevels = new Map(legacyLevelsSnapshot.docs.map((docSnap) => [
        docSnap.id,
        docSnap,
    ]));
    const currentLevelKey = canonicalLegacyLevelKey(
        profile.currentLevel || profile.currentLevelKey || 'white',
    );
    const currentDefinition = getLevel(currentLevelKey) || LEVELS[0];
    const completedLevels = new Set(
        (Array.isArray(profile.completedLevels) ? profile.completedLevels : [])
            .map(canonicalLegacyLevelKey)
            .filter((levelKey) => LEVELS.some((level) => level.key === levelKey)),
    );
    const legacyEarnedDefinition = getLevel(canonicalLegacyLevelKey(profile.earnedLevel));

    if (legacyEarnedDefinition) {
        LEVELS
            .filter((level) => level.order <= legacyEarnedDefinition.order)
            .forEach((level) => completedLevels.add(level.key));
    }
    LEVELS
        .filter((level) => level.order < currentDefinition.order)
        .forEach((level) => completedLevels.add(level.key));
    if (profile.programComplete === true) {
        LEVELS.forEach((level) => completedLevels.add(level.key));
    }

    const sourceCategories = new Map(await Promise.all(LEVELS.map(async (level) => {
        const sourceKey = LEGACY_SOURCE_LEVEL[level.key] || level.key;
        const sourceLevel = legacyLevels.get(sourceKey);
        if (!sourceLevel) return [level.key, new Map()];
        const categorySnapshot = await sourceLevel.ref.collection('categories').get();
        return [level.key, new Map(categorySnapshot.docs.map((docSnap) => [
            docSnap.id,
            docSnap.data() || {},
        ]))];
    })));

    const orderedCompletedLevels = LEVELS
        .filter((level) => completedLevels.has(level.key))
        .map((level) => level.key);
    const earnedLevel = orderedCompletedLevels.at(-1) || null;
    const updatedAt = now();
    const batch = db.batch();

    batch.set(profileRef, {
        currentLevel: currentDefinition.key,
        earnedLevel,
        completedLevels: orderedCompletedLevels,
        programComplete: profile.programComplete === true,
        requirementsVersion: REQUIREMENTS_VERSION,
        progressionSystem: 'belt-color-wolf',
        updatedAt,
    }, { merge: true });

    for (const level of LEVELS) {
        const sourceKey = LEGACY_SOURCE_LEVEL[level.key] || level.key;
        const sourceLevelData = legacyLevels.get(sourceKey)?.data() || {};
        const isApproved = completedLevels.has(level.key);
        const isCurrent = level.key === currentDefinition.key;
        const sourceLevelStatus = clean(sourceLevelData.status, 40);
        const status = isApproved
            ? 'approved'
            : isCurrent && CURRENT_LEVEL_STATUSES.has(sourceLevelStatus)
                ? sourceLevelStatus
                : isCurrent
                    ? 'active'
                    : 'locked';
        const levelRef = profileRef.collection('levels').doc(level.key);

        batch.set(levelRef, {
            ...sourceLevelData,
            memberUid: profile.memberUid || profileRef.id,
            levelKey: level.key,
            levelLabel: level.label,
            legacyLevelKey: sourceKey !== level.key ? sourceKey : null,
            order: level.order,
            status,
            requirementsVersion: REQUIREMENTS_VERSION,
            createdAt: sourceLevelData.createdAt || profile.createdAt || updatedAt,
            updatedAt,
        }, { merge: true });

        for (const category of CATEGORIES) {
            const sourceCategoryData = sourceCategories.get(level.key)?.get(category.key) || {};
            const sourceCategoryStatus = clean(sourceCategoryData.status, 40);
            const categoryStatus = isApproved
                ? 'validated'
                : isCurrent && sourceCategoryStatus && sourceCategoryStatus !== 'locked'
                    ? sourceCategoryStatus
                    : isCurrent
                        ? 'not_started'
                        : 'locked';

            batch.set(levelRef.collection('categories').doc(category.key), {
                memberNotes: '',
                instructorNotes: '',
                video: null,
                currentEvidenceId: null,
                currentEvidence: null,
                evidenceCount: 0,
                feedbackCount: 0,
                latestFeedback: null,
                ...sourceCategoryData,
                memberUid: profile.memberUid || profileRef.id,
                levelKey: level.key,
                legacyLevelKey: sourceKey !== level.key ? sourceKey : null,
                categoryKey: category.key,
                categoryLabel: category.label,
                status: categoryStatus,
                requirementsVersion: REQUIREMENTS_VERSION,
                createdAt: sourceCategoryData.createdAt || sourceLevelData.createdAt
                    || profile.createdAt || updatedAt,
                updatedAt,
            }, { merge: true });
        }
    }

    await batch.commit();
    return (await profileRef.get()).data() || profile;
}

async function seedProgressionProfile(memberUid, authToken = {}) {
    const { profileRef } = progressionRefs(memberUid);
    const existing = await profileRef.get();
    if (existing.exists) {
        return synchronizeProgressionProfile(profileRef, existing.data() || {});
    }

    const identity = await getMemberIdentity(memberUid, authToken);
    const batch = db.batch();
    const createdAt = now();

    batch.set(profileRef, {
        memberUid,
        memberDisplayName: identity.displayName,
        memberEmail: identity.email,
        currentLevel: 'white',
        earnedLevel: null,
        completedLevels: [],
        programComplete: false,
        requirementsVersion: REQUIREMENTS_VERSION,
        progressionSystem: 'belt-color-wolf',
        createdAt,
        updatedAt: createdAt,
    });

    for (const level of LEVELS) {
        const levelRef = profileRef.collection('levels').doc(level.key);
        const unlocked = level.key === 'white';
        batch.set(levelRef, {
            memberUid,
            levelKey: level.key,
            levelLabel: level.label,
            order: level.order,
            status: unlocked ? 'active' : 'locked',
            requirementsVersion: REQUIREMENTS_VERSION,
            createdAt,
            updatedAt: createdAt,
        });

        for (const category of CATEGORIES) {
            batch.set(levelRef.collection('categories').doc(category.key), {
                memberUid,
                levelKey: level.key,
                categoryKey: category.key,
                categoryLabel: category.label,
                status: unlocked ? 'not_started' : 'locked',
                memberNotes: '',
                instructorNotes: '',
                video: null,
                currentEvidenceId: null,
                currentEvidence: null,
                evidenceCount: 0,
                feedbackCount: 0,
                latestFeedback: null,
                requirementsVersion: REQUIREMENTS_VERSION,
                createdAt,
                updatedAt: createdAt,
            });
        }
    }

    await batch.commit();
    return (await profileRef.get()).data() || {};
}

function sortByCreatedAtDescending(items) {
    return items.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

async function readCategoryDetail(categoryRef, categoryData) {
    const profileRef = categoryRef.parent.parent?.parent.parent;
    const legacyCategoryRef = categoryData.legacyLevelKey && profileRef
        ? profileRef.collection('levels')
            .doc(categoryData.legacyLevelKey)
            .collection('categories')
            .doc(categoryData.categoryKey || categoryRef.id)
        : null;
    const evidenceQueries = [
        categoryRef.collection('evidence').orderBy('createdAt', 'desc').limit(30).get(),
    ];
    const feedbackQueries = [
        categoryRef.collection('feedback').orderBy('createdAt', 'desc').limit(30).get(),
    ];
    if (legacyCategoryRef) {
        evidenceQueries.push(
            legacyCategoryRef.collection('evidence').orderBy('createdAt', 'desc').limit(30).get(),
        );
        feedbackQueries.push(
            legacyCategoryRef.collection('feedback').orderBy('createdAt', 'desc').limit(30).get(),
        );
    }
    const [evidenceSnapshots, feedbackSnapshots] = await Promise.all([
        Promise.all(evidenceQueries),
        Promise.all(feedbackQueries),
    ]);
    const evidenceRecords = new Map();
    for (const snapshot of evidenceSnapshots.toReversed()) {
        snapshot.docs.forEach((docSnap) => {
            evidenceRecords.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
    }
    const feedbackRecords = new Map();
    for (const snapshot of feedbackSnapshots.toReversed()) {
        snapshot.docs.forEach((docSnap) => {
            feedbackRecords.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
    }

    const evidence = sortByCreatedAtDescending(
        [...evidenceRecords.values()].map(serialize),
    );
    if (!evidence.length && categoryData.video?.storagePath) {
        evidence.push(serialize({
            id: 'legacy-current',
            evidenceId: 'legacy-current',
            type: 'video',
            media: categoryData.video,
            notes: categoryData.memberNotes || '',
            submissionNumber: 1,
            status: 'current',
            createdAt: categoryData.video.uploadedAt || categoryData.updatedAt || null,
            legacy: true,
        }));
    }
    const feedback = sortByCreatedAtDescending(
        [...feedbackRecords.values()].map(serialize),
    );

    return serialize({
        ...categoryData,
        currentEvidenceId: categoryData.currentEvidenceId || evidence[0]?.id || null,
        currentEvidence: categoryData.currentEvidence || evidence[0]?.media || null,
        evidence,
        feedback,
    });
}

async function readProgression(memberUid) {
    const { profileRef } = progressionRefs(memberUid);
    const [profileSnap, levelSnaps] = await Promise.all([
        profileRef.get(),
        profileRef.collection('levels').orderBy('order').get(),
    ]);

    if (!profileSnap.exists) return null;

    const levelDocuments = new Map(levelSnaps.docs.map((docSnap) => [docSnap.id, docSnap]));
    const levels = [];
    for (const levelDefinition of LEVELS) {
        const levelDoc = levelDocuments.get(levelDefinition.key);
        if (!levelDoc) continue;
        const categorySnap = await levelDoc.ref.collection('categories').get();
        const categoryEntries = await Promise.all(categorySnap.docs.map(async (docSnap) => [
            docSnap.id,
            await readCategoryDetail(docSnap.ref, { id: docSnap.id, ...docSnap.data() }),
        ]));
        levels.push(serialize({
            id: levelDoc.id,
            ...levelDoc.data(),
            categories: Object.fromEntries(categoryEntries),
        }));
    }

    return {
        profile: serialize({ id: profileSnap.id, ...profileSnap.data() }),
        levels,
    };
}

async function readProgressionSummary(memberUid, authToken = {}) {
    const profile = await seedProgressionProfile(memberUid, authToken);
    const currentLevelKey = profile.currentLevel || profile.currentLevelKey || 'white';
    const { profileRef, levelRef } = progressionRefs(memberUid, currentLevelKey);

    const [profileSnapshot, levelsSnapshot, categorySnapshot] = await Promise.all([
        profileRef.get(),
        profileRef.collection('levels').orderBy('order').get(),
        levelRef.collection('categories').get(),
    ]);

    const categories = Object.fromEntries(categorySnapshot.docs.map((item) => [
        item.id,
        serialize({ id: item.id, ...item.data() }),
    ]));

    const levelDocuments = new Map(levelsSnapshot.docs.map((item) => [item.id, item]));
    const levels = LEVELS
        .map((levelDefinition) => levelDocuments.get(levelDefinition.key))
        .filter(Boolean)
        .map((item) => serialize({
            id: item.id,
            ...item.data(),
            categories: item.id === currentLevelKey ? categories : {},
        }));

    return {
        profile: serialize({
            id: profileSnapshot.id,
            ...(profileSnapshot.data() || profile),
        }),
        levels,
    };
}

async function handleSyncMyStudioRole(request, dependencies = {}) {
    const uid = requireAuth(request);
    const email = normalizeEmail(request.auth?.token?.email || (await admin.auth().getUser(uid)).email || '');
    const currentUser = await admin.auth().getUser(uid);
    const currentClaims = currentUser.customClaims || {};
    const instructorEmails = new Set(splitEmailList(dependencies.instructorEmails));

    let role = currentClaims.admin === true ? 'admin' : 'member';
    if (instructorEmails.has(email)) role = 'instructor';
    if (currentClaims.role === 'admin') role = 'admin';

    await Promise.all([
        admin.auth().setCustomUserClaims(uid, { ...currentClaims, role }),
        db.collection('users').doc(uid).set({
            uid,
            email,
            displayName: clean(currentUser.displayName || request.auth?.token?.name || '', 160),
            role,
            updatedAt: now(),
        }, { merge: true }),
    ]);

    return { role, refreshToken: true };
}

async function handleGetMyProgression(request) {
    const uid = requireAuth(request);
    const role = await getStudioRole(uid, request.auth?.token || {});
    if (!INSTRUCTOR_ROLES.has(role)) await assertActiveMembership(uid);
    await seedProgressionProfile(uid, request.auth?.token || {});
    return readProgression(uid);
}

function sanitizeEvidenceMedia(video, memberUid, levelKey, categoryKey, evidenceId) {
    const storagePath = clean(video?.storagePath, 1000);
    const newPrefix = `progression-evidence/${memberUid}/${levelKey}/${categoryKey}/${evidenceId}/`;
    const legacyPrefix = `progression-videos/${memberUid}/${levelKey}/${categoryKey}/`;
    if (!storagePath.startsWith(newPrefix) && !storagePath.startsWith(legacyPrefix)) {
        throw new HttpsError('invalid-argument', 'The uploaded evidence path is invalid.');
    }
    return {
        storagePath,
        fileName: clean(video?.fileName, 260),
        contentType: clean(video?.contentType, 120),
        size: Math.max(0, Number(video?.size || 0)),
        source: clean(video?.source, 40) || 'upload',
        durationSeconds: Math.max(0, Number(video?.durationSeconds || 0)),
    };
}

async function handleSaveProgressionCategory(request) {
    const callerUid = requireAuth(request);
    const memberUid = clean(request.data?.memberUid || callerUid, 128);
    const requestedLevelKey = clean(request.data?.levelKey, 40);
    const categoryKey = clean(request.data?.categoryKey, 60);
    const level = getLevel(requestedLevelKey);
    const levelKey = level?.key || requestedLevelKey;
    const category = getCategory(categoryKey);

    if (!memberUid || !level || !category) {
        throw new HttpsError('invalid-argument', 'A valid member, level, and category are required.');
    }

    const access = await canManageMember(request, memberUid);
    if (!access.isInstructor) await assertActiveMembership(memberUid);
    await seedProgressionProfile(memberUid, request.auth?.token || {});
    const { profileRef, levelRef, categoryRef } = progressionRefs(memberUid, levelKey, categoryKey);
    const [profileSnap, levelSnap, categorySnap] = await Promise.all([
        profileRef.get(),
        levelRef.get(),
        categoryRef.get(),
    ]);

    const profile = profileSnap.data() || {};
    const levelData = levelSnap.data() || {};
    const categoryData = categorySnap.data() || {};

    if (!access.isInstructor && profile.currentLevel !== levelKey) {
        throw new HttpsError('failed-precondition', 'Only the current working level can be updated.');
    }
    if (!access.isInstructor && !MEMBER_EDITABLE_LEVEL_STATUSES.has(levelData.status)) {
        throw new HttpsError('failed-precondition', 'This level cannot be edited while it is locked or under review.');
    }
    if (levelData.status === 'approved') {
        throw new HttpsError('failed-precondition', 'Approved progression evidence is read-only.');
    }

    const memberNotes = clean(request.data?.memberNotes, 2500);
    const video = request.data?.video || null;
    const updates = {
        memberNotes,
        updatedAt: now(),
        updatedByUid: access.callerUid,
        updatedByRole: access.role,
    };

    const batch = db.batch();
    let evidenceId = null;

    if (video) {
        evidenceId = clean(video.evidenceId || request.data?.evidenceId, 180) || categoryRef.collection('evidence').doc().id;
        const media = sanitizeEvidenceMedia(video, memberUid, levelKey, categoryKey, evidenceId);
        const evidenceRef = categoryRef.collection('evidence').doc(evidenceId);
        const submissionNumber = Math.max(1, Number(categoryData.evidenceCount || 0) + 1);
        const createdAt = now();
        const evidenceRecord = {
            evidenceId,
            memberUid,
            levelKey,
            categoryKey,
            type: 'video',
            media,
            notes: memberNotes,
            submissionNumber,
            status: 'current',
            submittedByUid: access.callerUid,
            submittedByRole: access.role,
            createdAt,
            updatedAt: createdAt,
        };

        batch.set(evidenceRef, evidenceRecord, { merge: true });
        updates.currentEvidenceId = evidenceId;
        updates.currentEvidence = {
            id: evidenceId,
            ...media,
            submissionNumber,
            createdAt,
        };
        updates.evidenceCount = submissionNumber;
        updates.video = {
            ...media,
            uploadedByUid: access.callerUid,
            uploadedByRole: access.role,
            uploadedAt: createdAt,
        };
        updates.status = categoryData.status === 'validated' && access.isInstructor
            ? 'validated'
            : 'in_practice';
    } else if (categoryData.status === 'not_started' && memberNotes) {
        updates.status = 'in_practice';
    }

    batch.set(categoryRef, updates, { merge: true });
    if (['active', 'needs_work', 'in_review', 'submitted'].includes(levelData.status)) {
        batch.set(levelRef, { status: 'draft', updatedAt: now() }, { merge: true });
    } else {
        batch.set(levelRef, { updatedAt: now() }, { merge: true });
    }
    batch.set(profileRef, { updatedAt: now() }, { merge: true });
    await batch.commit();

    return { success: true, evidenceId, previousStoragePath: null };
}

async function handleSubmitProgressionLevel(request) {
    const callerUid = requireAuth(request);
    const memberUid = clean(request.data?.memberUid || callerUid, 128);
    const requestedLevelKey = clean(request.data?.levelKey, 40);
    const level = getLevel(requestedLevelKey);
    const levelKey = level?.key || requestedLevelKey;
    if (!level) throw new HttpsError('invalid-argument', 'A valid progression level is required.');

    const access = await canManageMember(request, memberUid);
    if (!access.isInstructor) await assertActiveMembership(memberUid);
    await seedProgressionProfile(memberUid, request.auth?.token || {});
    const { profileRef, levelRef } = progressionRefs(memberUid, levelKey);
    const [profileSnap, levelSnap, categoriesSnap] = await Promise.all([
        profileRef.get(),
        levelRef.get(),
        levelRef.collection('categories').get(),
    ]);

    if (!profileSnap.exists || !levelSnap.exists) {
        throw new HttpsError('not-found', 'Progression profile was not found.');
    }

    const profile = profileSnap.data() || {};
    const levelData = levelSnap.data() || {};
    if (!access.isInstructor && profile.currentLevel !== levelKey) {
        throw new HttpsError('failed-precondition', 'Only the current working level can be submitted.');
    }
    if (!MEMBER_EDITABLE_LEVEL_STATUSES.has(levelData.status)) {
        throw new HttpsError('failed-precondition', 'This level is not ready for submission.');
    }

    const categories = categoriesSnap.docs.map((docSnap) => ({ ref: docSnap.ref, ...docSnap.data() }));
    const missing = CATEGORIES.filter((category) => {
        const data = categories.find((item) => item.categoryKey === category.key);
        return !data?.currentEvidence?.storagePath && !data?.video?.storagePath;
    });
    if (missing.length) {
        throw new HttpsError(
            'failed-precondition',
            `Upload a current video for: ${missing.map((item) => item.label).join(', ')}.`,
        );
    }

    const reviewId = `${memberUid}_${levelKey}`;
    const reviewRef = db.collection('progressionReviews').doc(reviewId);
    const submittedAt = now();
    const batch = db.batch();

    for (const categoryData of categories) {
        if (categoryData.status !== 'validated') {
            batch.set(categoryData.ref, {
                status: 'submitted',
                submittedAt,
                updatedAt: submittedAt,
            }, { merge: true });
        }
    }

    batch.set(levelRef, {
        status: 'submitted',
        submittedAt,
        updatedAt: submittedAt,
    }, { merge: true });

    batch.set(reviewRef, {
        reviewId,
        memberUid,
        memberDisplayName: profile.memberDisplayName || '',
        memberEmail: profile.memberEmail || '',
        levelKey,
        levelLabel: level.label,
        levelOrder: level.order,
        status: 'submitted',
        submittedAt,
        updatedAt: submittedAt,
        categorySummary: Object.fromEntries(CATEGORIES.map((item) => [
            item.key,
            categories.find((categoryData) => categoryData.categoryKey === item.key)?.status === 'validated'
                ? 'validated'
                : 'submitted',
        ])),
    }, { merge: true });

    batch.set(profileRef, { updatedAt: submittedAt }, { merge: true });
    await batch.commit();
    return { success: true, reviewId };
}

async function handleListProgressionReviews(request) {
    await assertInstructor(request);
    const snapshot = await db.collection('progressionReviews')
        .where('status', 'in', ['submitted', 'in_review', 'needs_work', 'ready_for_approval'])
        .limit(100)
        .get();

    const reviews = snapshot.docs
        .map((docSnap) => {
            const review = { id: docSnap.id, ...docSnap.data() };
            const level = getLevel(review.levelKey);
            return serialize({
                ...review,
                levelKey: level?.key || review.levelKey,
                levelLabel: level?.label || review.levelLabel,
                levelOrder: level?.order ?? review.levelOrder,
            });
        })
        .sort((left, right) => String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')));
    return { reviews };
}

async function handleGetProgressionReview(request) {
    await assertInstructor(request);
    const reviewId = clean(request.data?.reviewId, 260);
    if (!reviewId) throw new HttpsError('invalid-argument', 'A review ID is required.');

    const reviewSnap = await db.collection('progressionReviews').doc(reviewId).get();
    if (!reviewSnap.exists) throw new HttpsError('not-found', 'Progression review not found.');
    const review = reviewSnap.data() || {};
    const level = getLevel(review.levelKey);
    if (!level) throw new HttpsError('failed-precondition', 'The review level is invalid.');
    await seedProgressionProfile(review.memberUid);
    const { profileRef, levelRef } = progressionRefs(review.memberUid, level.key);
    const [profileSnap, levelSnap, categoriesSnap] = await Promise.all([
        profileRef.get(),
        levelRef.get(),
        levelRef.collection('categories').get(),
    ]);

    const categoryEntries = await Promise.all(categoriesSnap.docs.map(async (docSnap) => [
        docSnap.id,
        await readCategoryDetail(docSnap.ref, { id: docSnap.id, ...docSnap.data() }),
    ]));

    return serialize({
        review: {
            id: reviewSnap.id,
            ...review,
            levelKey: level.key,
            levelLabel: level.label,
            levelOrder: level.order,
        },
        profile: { id: profileSnap.id, ...profileSnap.data() },
        level: { id: levelSnap.id, ...levelSnap.data() },
        categories: Object.fromEntries(categoryEntries),
    });
}

function sanitizeFeedbackMedia(media, memberUid, feedbackId) {
    if (!media?.storagePath) return null;
    const storagePath = clean(media.storagePath, 1000);
    const expectedPrefix = `progression-feedback/${memberUid}/${feedbackId}/`;
    if (!storagePath.startsWith(expectedPrefix)) {
        throw new HttpsError('invalid-argument', 'The feedback media path is invalid.');
    }
    return {
        storagePath,
        fileName: clean(media.fileName, 260),
        contentType: clean(media.contentType, 120),
        size: Math.max(0, Number(media.size || 0)),
        source: clean(media.source, 40) || 'upload',
        durationSeconds: Math.max(0, Number(media.durationSeconds || 0)),
    };
}

async function handleSaveProgressionFeedback(request) {
    const instructor = await assertInstructor(request);
    const reviewId = clean(request.data?.reviewId, 260);
    const categoryKey = clean(request.data?.categoryKey, 60);
    const feedbackId = clean(request.data?.feedbackId, 180);
    const feedbackType = clean(request.data?.feedbackType, 30) || 'text';
    const evidenceId = clean(request.data?.evidenceId, 180);

    if (!reviewId || !getCategory(categoryKey) || !feedbackId || !FEEDBACK_TYPES.has(feedbackType)) {
        throw new HttpsError('invalid-argument', 'A review, category, feedback ID, and feedback type are required.');
    }

    const reviewRef = db.collection('progressionReviews').doc(reviewId);
    const reviewSnap = await reviewRef.get();
    if (!reviewSnap.exists) throw new HttpsError('not-found', 'Progression review not found.');
    const review = reviewSnap.data() || {};
    const level = getLevel(review.levelKey);
    if (!level) throw new HttpsError('failed-precondition', 'The review level is invalid.');
    await seedProgressionProfile(review.memberUid);
    const { profileRef, categoryRef } = progressionRefs(
        review.memberUid,
        level.key,
        categoryKey,
    );
    const categorySnap = await categoryRef.get();
    if (!categorySnap.exists) throw new HttpsError('not-found', 'Progression category not found.');

    if (evidenceId) {
        const evidenceSnap = await categoryRef.collection('evidence').doc(evidenceId).get();
        const legacyLevelKey = categorySnap.data()?.legacyLevelKey;
        const legacyEvidenceSnap = !evidenceSnap.exists && legacyLevelKey
            ? await profileRef.collection('levels')
                .doc(legacyLevelKey)
                .collection('categories')
                .doc(categoryKey)
                .collection('evidence')
                .doc(evidenceId)
                .get()
            : null;
        const isLegacyEvidence = evidenceId === 'legacy-current' && categorySnap.data()?.video?.storagePath;
        if (
            !evidenceSnap.exists
            && !legacyEvidenceSnap?.exists
            && categorySnap.data()?.currentEvidenceId !== evidenceId
            && !isLegacyEvidence
        ) {
            throw new HttpsError('invalid-argument', 'The selected evidence record was not found.');
        }
    }

    const text = clean(request.data?.text, 5000);
    const strengths = cleanArray(request.data?.strengths, 20, 500);
    const focusAreas = cleanArray(request.data?.focusAreas, 20, 500);
    const media = sanitizeFeedbackMedia(request.data?.media, review.memberUid, feedbackId);
    if (!text && !strengths.length && !focusAreas.length && !media) {
        throw new HttpsError('invalid-argument', 'Add written, audio, or video feedback before saving.');
    }

    const createdAt = now();
    const feedback = {
        feedbackId,
        memberUid: review.memberUid,
        instructorUid: instructor.uid,
        instructorRole: instructor.role,
        levelKey: level.key,
        categoryKey,
        evidenceId: evidenceId || categorySnap.data()?.currentEvidenceId || null,
        feedbackType,
        text,
        strengths,
        focusAreas,
        media,
        visibleToMember: true,
        aiEligible: true,
        createdAt,
        updatedAt: createdAt,
    };

    const feedbackRef = categoryRef.collection('feedback').doc(feedbackId);
    const count = Math.max(1, Number(categorySnap.data()?.feedbackCount || 0) + 1);
    const batch = db.batch();
    batch.set(feedbackRef, feedback, { merge: true });
    batch.set(categoryRef, {
        feedbackCount: count,
        latestFeedback: {
            id: feedbackId,
            feedbackType,
            text,
            strengths,
            focusAreas,
            media,
            evidenceId: feedback.evidenceId,
            createdAt,
        },
        instructorNotes: text || categorySnap.data()?.instructorNotes || '',
        updatedAt: createdAt,
    }, { merge: true });
    batch.set(reviewRef, { updatedAt: createdAt }, { merge: true });
    await batch.commit();

    return { success: true, feedbackId };
}

async function recalculateReviewStatus(reviewRef, levelRef) {
    const categoriesSnap = await levelRef.collection('categories').get();
    const categorySummary = {};
    let allValidated = true;
    let hasNeedsWork = false;

    for (const docSnap of categoriesSnap.docs) {
        const status = docSnap.data()?.status || 'not_started';
        categorySummary[docSnap.id] = status;
        if (status !== 'validated') allValidated = false;
        if (status === 'needs_work') hasNeedsWork = true;
    }

    const status = allValidated ? 'ready_for_approval' : hasNeedsWork ? 'needs_work' : 'in_review';
    await Promise.all([
        reviewRef.set({ status, categorySummary, updatedAt: now() }, { merge: true }),
        levelRef.set({ status, updatedAt: now() }, { merge: true }),
    ]);
    return { status, categorySummary };
}

async function handleReviewProgressionCategory(request) {
    const instructor = await assertInstructor(request);
    const reviewId = clean(request.data?.reviewId, 260);
    const categoryKey = clean(request.data?.categoryKey, 60);
    const status = clean(request.data?.status, 40);
    const instructorNotes = clean(request.data?.instructorNotes, 3000);

    if (!reviewId || !getCategory(categoryKey) || !ALLOWED_REVIEW_STATUSES.has(status)) {
        throw new HttpsError('invalid-argument', 'A review, category, and valid decision are required.');
    }

    const reviewRef = db.collection('progressionReviews').doc(reviewId);
    const reviewSnap = await reviewRef.get();
    if (!reviewSnap.exists) throw new HttpsError('not-found', 'Progression review not found.');
    const review = reviewSnap.data() || {};
    const level = getLevel(review.levelKey);
    if (!level) throw new HttpsError('failed-precondition', 'The review level is invalid.');
    await seedProgressionProfile(review.memberUid);
    const { levelRef, categoryRef } = progressionRefs(review.memberUid, level.key, categoryKey);

    await categoryRef.set({
        status,
        instructorNotes,
        reviewedByUid: instructor.uid,
        reviewedByRole: instructor.role,
        reviewedAt: now(),
        updatedAt: now(),
    }, { merge: true });

    const result = await recalculateReviewStatus(reviewRef, levelRef);
    return { success: true, ...result };
}

async function handleApproveProgressionLevel(request) {
    const instructor = await assertInstructor(request);
    const reviewId = clean(request.data?.reviewId, 260);
    if (!reviewId) throw new HttpsError('invalid-argument', 'A review ID is required.');

    const reviewRef = db.collection('progressionReviews').doc(reviewId);
    const reviewSnap = await reviewRef.get();
    if (!reviewSnap.exists) throw new HttpsError('not-found', 'Progression review not found.');
    const review = reviewSnap.data() || {};
    const level = getLevel(review.levelKey);
    if (!level) throw new HttpsError('failed-precondition', 'The review level is invalid.');

    await seedProgressionProfile(review.memberUid);
    const { profileRef, levelRef } = progressionRefs(review.memberUid, level.key);
    const categoriesSnap = await levelRef.collection('categories').get();
    const notValidated = categoriesSnap.docs.filter((docSnap) => docSnap.data()?.status !== 'validated');
    if (notValidated.length) {
        throw new HttpsError('failed-precondition', 'Every category must be validated before the level can be approved.');
    }

    const profileSnap = await profileRef.get();
    const profile = profileSnap.data() || {};
    const nextLevel = getNextLevel(level.key);
    const completedLevels = Array.from(new Set([...(profile.completedLevels || []), level.key]));
    const approvedAt = now();
    const batch = db.batch();

    batch.set(levelRef, {
        status: 'approved',
        approvedAt,
        approvedByUid: instructor.uid,
        updatedAt: approvedAt,
    }, { merge: true });

    batch.set(reviewRef, {
        status: 'approved',
        approvedAt,
        approvedByUid: instructor.uid,
        approvedByRole: instructor.role,
        updatedAt: approvedAt,
    }, { merge: true });

    batch.set(profileRef, {
        earnedLevel: level.key,
        currentLevel: nextLevel?.key || level.key,
        completedLevels,
        programComplete: !nextLevel,
        updatedAt: approvedAt,
    }, { merge: true });

    if (nextLevel) {
        const nextLevelRef = profileRef.collection('levels').doc(nextLevel.key);
        batch.set(nextLevelRef, { status: 'active', unlockedAt: approvedAt, updatedAt: approvedAt }, { merge: true });
        const nextCategoriesSnap = await nextLevelRef.collection('categories').get();
        for (const categoryDoc of nextCategoriesSnap.docs) {
            batch.set(categoryDoc.ref, { status: 'not_started', updatedAt: approvedAt }, { merge: true });
        }
    }

    await batch.commit();
    logger.info('Progression level approved.', { reviewId, memberUid: review.memberUid, levelKey: level.key });
    return { success: true, earnedLevel: level.key, nextLevel: nextLevel?.key || null, programComplete: !nextLevel };
}

module.exports = {
    readProgressionSummary,
    handleSyncMyStudioRole,
    handleGetMyProgression,
    handleSaveProgressionCategory,
    handleSubmitProgressionLevel,
    handleListProgressionReviews,
    handleGetProgressionReview,
    handleSaveProgressionFeedback,
    handleReviewProgressionCategory,
    handleApproveProgressionLevel,
};
