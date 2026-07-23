const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const {
  LEVELS,
  CATEGORIES,
  getLevel,
} = require('../config/progressionSystem');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const LIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing']);
const ALLOWED_STATUSES = new Set(['draft', 'published', 'archived']);
const ALLOWED_VISIBILITY = new Set(['members', 'instructors']);
const ALLOWED_BLOCK_TYPES = new Set(['text', 'image', 'audio', 'video']);
const LEVEL_KEYS = new Set(LEVELS.map((level) => level.key));
const CATEGORY_KEYS = new Set(CATEGORIES.map((category) => category.key));

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function clean(value, max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function cleanArray(value, maxItems = 40, itemMax = 500) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => clean(item, itemMax)).filter(Boolean))].slice(0, maxItems);
}

function canonicalLevelKey(value) {
  return getLevel(clean(value, 40))?.key || '';
}

function normalizeRequirementRef(reference) {
  const [rawLevelKey, categoryKey, rawIndex] = clean(reference, 120).split(':');
  const levelKey = canonicalLevelKey(rawLevelKey);
  return levelKey && categoryKey && rawIndex
    ? `${levelKey}:${categoryKey}:${rawIndex}`
    : '';
}

function normalizeContentLevels(item = {}) {
  return {
    ...item,
    levelKeys: [...new Set(
      (Array.isArray(item.levelKeys) ? item.levelKeys : [])
        .map(canonicalLevelKey)
        .filter(Boolean),
    )],
    requirementRefs: [...new Set(
      (Array.isArray(item.requirementRefs) ? item.requirementRefs : [])
        .map(normalizeRequirementRef)
        .filter(Boolean),
    )],
  };
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
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to access training references.');
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

async function assertInstructor(request) {
  const uid = requireAuth(request);
  const role = await getStudioRole(uid, request.auth?.token || {});
  if (!INSTRUCTOR_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'Instructor access is required.');
  }
  return { uid, role };
}

async function assertMemberAccess(uid) {
  const membershipSnap = await db.collection('memberships').doc(uid).get();
  const membership = membershipSnap.data() || {};
  if (!LIVE_MEMBERSHIP_STATUSES.has(membership.status)) {
    throw new HttpsError('permission-denied', 'An active membership is required for the training library.');
  }
}

function sanitizeAsset(asset, contentId, blockId) {
  if (!asset?.storagePath) return null;
  const storagePath = clean(asset.storagePath, 1000);
  const expectedPrefix = `progression-content/${contentId}/${blockId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new HttpsError('invalid-argument', 'A content media path is invalid.');
  }
  return {
    storagePath,
    fileName: clean(asset.fileName, 260),
    contentType: clean(asset.contentType, 120),
    size: Math.max(0, Number(asset.size || 0)),
    source: clean(asset.source, 40) || 'upload',
    durationSeconds: Math.max(0, Number(asset.durationSeconds || 0)),
  };
}

function sanitizeBlocks(blocks, contentId) {
  if (!Array.isArray(blocks)) return [];
  return blocks.slice(0, 40).map((block, index) => {
    const id = clean(block?.id, 160) || `block-${index + 1}`;
    const type = clean(block?.type, 20);
    if (!ALLOWED_BLOCK_TYPES.has(type)) {
      throw new HttpsError('invalid-argument', 'A content block type is invalid.');
    }
    const next = {
      id,
      type,
      heading: clean(block?.heading, 300),
      body: clean(block?.body, 12000),
      caption: clean(block?.caption, 4000),
      asset: null,
    };
    if (type !== 'text') next.asset = sanitizeAsset(block?.asset, contentId, id);
    return next;
  });
}

function validateRequirementRefs(refs, levelKeys, categoryKeys) {
  return cleanArray(refs, 120, 120)
    .map(normalizeRequirementRef)
    .filter((reference) => {
      const [levelKey, categoryKey, rawIndex] = reference.split(':');
      const level = LEVELS.find((item) => item.key === levelKey);
      const index = Number(rawIndex) - 1;
      return levelKeys.includes(levelKey)
        && categoryKeys.includes(categoryKey)
        && Boolean(level?.categories?.[categoryKey]?.items?.[index]);
    });
}


function describeRequirementRef(reference) {
  const [levelKey, categoryKey, rawIndex] = String(reference || '').split(':');
  const level = getLevel(levelKey);
  const category = CATEGORIES.find((item) => item.key === categoryKey);
  const text = level?.categories?.[categoryKey]?.items?.[Number(rawIndex) - 1];
  if (!level || !category || !text) return '';
  return `${level.label} — ${category.label}: ${text}`;
}

function buildAiText(content) {
  const blockText = (content.blocks || []).flatMap((block) => [
    block.heading,
    block.body,
    block.caption,
  ]).filter(Boolean);

  return [
    content.title,
    content.summary,
    `Levels: ${content.levelKeys.join(', ')}`,
    `Categories: ${content.categoryKeys.join(', ')}`,
    content.techniqueTags.length ? `Technique tags: ${content.techniqueTags.join(', ')}` : '',
    content.learningObjectives.length ? `Learning objectives: ${content.learningObjectives.join('; ')}` : '',
    content.keyPoints.length ? `Key points: ${content.keyPoints.join('; ')}` : '',
    content.commonMistakes.length ? `Common mistakes: ${content.commonMistakes.join('; ')}` : '',
    content.safetyNotes.length ? `Safety notes: ${content.safetyNotes.join('; ')}` : '',
    content.requirementRefs.length
      ? `Connected requirements: ${content.requirementRefs.map(describeRequirementRef).filter(Boolean).join('; ')}`
      : '',
    ...blockText,
  ].filter(Boolean).join('\n').slice(0, 30000);
}

function sanitizeContentPayload(data = {}) {
  const contentId = clean(data.contentId, 180);
  if (!contentId) throw new HttpsError('invalid-argument', 'A content ID is required.');

  const levelKeys = [...new Set(
    cleanArray(data.levelKeys, LEVELS.length + 2, 40)
      .map(canonicalLevelKey)
      .filter((key) => LEVEL_KEYS.has(key)),
  )];
  const categoryKeys = cleanArray(data.categoryKeys, CATEGORIES.length, 60).filter((key) => CATEGORY_KEYS.has(key));
  const primaryCategory = clean(data.primaryCategory, 60);
  const title = clean(data.title, 240);
  const summary = clean(data.summary, 1200);

  if (!title || !summary || !levelKeys.length || !categoryKeys.length) {
    throw new HttpsError('invalid-argument', 'Title, summary, levels, and categories are required.');
  }
  if (!categoryKeys.includes(primaryCategory)) {
    throw new HttpsError('invalid-argument', 'The primary category must be one of the selected categories.');
  }

  const content = {
    contentId,
    title,
    summary,
    primaryCategory,
    categoryKeys,
    levelKeys,
    requirementRefs: validateRequirementRefs(data.requirementRefs, levelKeys, categoryKeys),
    techniqueTags: cleanArray(data.techniqueTags, 40, 80).map((item) => item.toLowerCase()),
    learningObjectives: cleanArray(data.learningObjectives, 30, 500),
    keyPoints: cleanArray(data.keyPoints, 40, 500),
    commonMistakes: cleanArray(data.commonMistakes, 40, 500),
    safetyNotes: cleanArray(data.safetyNotes, 40, 500),
    blocks: sanitizeBlocks(data.blocks, contentId),
    visibility: ALLOWED_VISIBILITY.has(data.visibility) ? data.visibility : 'members',
    aiEligible: data.aiEligible !== false,
  };
  content.aiText = buildAiText(content);
  return content;
}

async function handleListProgressionContent(request) {
  const uid = requireAuth(request);
  const role = await getStudioRole(uid, request.auth?.token || {});
  const isInstructor = INSTRUCTOR_ROLES.has(role);
  if (!isInstructor) await assertMemberAccess(uid);

  const includeDrafts = isInstructor && request.data?.includeDrafts === true;
  const levelKey = clean(request.data?.levelKey, 40);
  const categoryKey = clean(request.data?.categoryKey, 60);
  const query = clean(request.data?.query, 180).toLowerCase();

  const snapshot = await db.collection('progressionContent').limit(250).get();
  const items = snapshot.docs
    .map((docSnap) => normalizeContentLevels({ id: docSnap.id, ...docSnap.data() }))
    .filter((item) => {
      if (!includeDrafts && item.status !== 'published') return false;
      if (!isInstructor && item.visibility !== 'members') return false;
      if (levelKey && !item.levelKeys?.includes(levelKey)) return false;
      if (categoryKey && !item.categoryKeys?.includes(categoryKey)) return false;
      if (query) {
        const haystack = [item.title, item.summary, ...(item.techniqueTags || [])].join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((left, right) => String(right.updatedAt?.toDate?.() || right.updatedAt || '')
      .localeCompare(String(left.updatedAt?.toDate?.() || left.updatedAt || '')))
    .map(serialize);

  return { items, role };
}

async function handleGetProgressionContent(request) {
  const uid = requireAuth(request);
  const role = await getStudioRole(uid, request.auth?.token || {});
  const isInstructor = INSTRUCTOR_ROLES.has(role);
  if (!isInstructor) await assertMemberAccess(uid);

  const contentId = clean(request.data?.contentId, 180);
  if (!contentId) throw new HttpsError('invalid-argument', 'A content ID is required.');
  const snap = await db.collection('progressionContent').doc(contentId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Training reference not found.');
  const item = normalizeContentLevels({ id: snap.id, ...snap.data() });
  if (!isInstructor && (item.status !== 'published' || item.visibility !== 'members')) {
    throw new HttpsError('permission-denied', 'This training reference is not available.');
  }
  return { item: serialize(item) };
}

async function handleSaveProgressionContent(request) {
  const instructor = await assertInstructor(request);
  const content = sanitizeContentPayload(request.data || {});
  const ref = db.collection('progressionContent').doc(content.contentId);
  const existingSnap = await ref.get();
  const existing = existingSnap.data() || {};
  const version = Math.max(1, Number(existing.version || 0) + 1);
  const timestamp = now();

  await ref.set({
    ...content,
    status: ALLOWED_STATUSES.has(existing.status) ? existing.status : 'draft',
    version,
    createdAt: existing.createdAt || timestamp,
    createdByUid: existing.createdByUid || instructor.uid,
    updatedAt: timestamp,
    updatedByUid: instructor.uid,
    updatedByRole: instructor.role,
  }, { merge: true });

  return { success: true, contentId: content.contentId, version };
}

async function handleSetProgressionContentStatus(request) {
  const instructor = await assertInstructor(request);
  const contentId = clean(request.data?.contentId, 180);
  const status = clean(request.data?.status, 30);
  if (!contentId || !ALLOWED_STATUSES.has(status)) {
    throw new HttpsError('invalid-argument', 'A valid content item and status are required.');
  }

  const ref = db.collection('progressionContent').doc(contentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Training reference not found.');
  const current = snap.data() || {};

  if (status === 'published') {
    if (!current.title || !current.summary || !current.blocks?.length) {
      throw new HttpsError('failed-precondition', 'Add a title, summary, and at least one content section before publishing.');
    }
    if (current.visibility !== 'members') {
      throw new HttpsError('failed-precondition', 'Only member-visible content can be published to the member library.');
    }
  }

  await ref.set({
    status,
    publishedAt: status === 'published' ? now() : current.publishedAt || null,
    archivedAt: status === 'archived' ? now() : admin.firestore.FieldValue.delete(),
    updatedAt: now(),
    updatedByUid: instructor.uid,
    updatedByRole: instructor.role,
  }, { merge: true });

  return { success: true, contentId, status };
}

module.exports = {
  handleListProgressionContent,
  handleGetProgressionContent,
  handleSaveProgressionContent,
  handleSetProgressionContentStatus,
};
