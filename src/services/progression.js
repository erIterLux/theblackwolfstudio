import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import { getWorkspaceData, invalidateWorkspaceData } from './workspaceData';

function callable(name) {
    if (!functions) throw new Error('Firebase Functions is not configured.');
    return httpsCallable(functions, name);
}

export async function syncMyStudioRole() {
    const response = await callable('syncMyStudioRole')({});
    return response.data;
}

export async function getMyProgression(options = {}) {
    return getWorkspaceData('memberProgression', {}, options);
}

export async function saveProgressionCategory(payload) {
    const response = await callable('saveProgressionCategory')(payload);
    invalidateWorkspaceData('memberProgression', 'progressionReviews');
    return response.data;
}

export async function submitProgressionLevel(payload) {
    const response = await callable('submitProgressionLevel')(payload);
    invalidateWorkspaceData('memberProgression', 'progressionReviews');
    return response.data;
}

export async function listProgressionReviews(options = {}) {
    return getWorkspaceData('progressionReviews', {}, options);
}

export async function getProgressionReview(reviewId, options = {}) {
    return getWorkspaceData('progressionReview', { reviewId }, options);
}

export async function saveProgressionFeedback(payload) {
    const response = await callable('saveProgressionFeedback')(payload);
    invalidateWorkspaceData('memberProgression', 'progressionReviews');
    return response.data;
}

export async function reviewProgressionCategory(payload) {
    const response = await callable('reviewProgressionCategory')(payload);
    invalidateWorkspaceData('memberProgression', 'progressionReviews');
    return response.data;
}

export async function approveProgressionLevel(reviewId) {
    const response = await callable('approveProgressionLevel')({ reviewId });
    invalidateWorkspaceData('memberProgression', 'progressionReviews');
    return response.data;
}
