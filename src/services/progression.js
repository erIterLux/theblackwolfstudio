import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
    if (!functions) throw new Error('Firebase Functions is not configured.');
    return httpsCallable(functions, name);
}

export async function syncMyStudioRole() {
    const response = await callable('syncMyStudioRole')({});
    return response.data;
}

export async function getMyProgression() {
    const response = await callable('getMyProgression')({});
    return response.data;
}

export async function saveProgressionCategory(payload) {
    const response = await callable('saveProgressionCategory')(payload);
    return response.data;
}

export async function submitProgressionLevel(payload) {
    const response = await callable('submitProgressionLevel')(payload);
    return response.data;
}

export async function listProgressionReviews() {
    const response = await callable('listProgressionReviews')({});
    return response.data;
}

export async function getProgressionReview(reviewId) {
    const response = await callable('getProgressionReview')({ reviewId });
    return response.data;
}

export async function saveProgressionFeedback(payload) {
    const response = await callable('saveProgressionFeedback')(payload);
    return response.data;
}

export async function reviewProgressionCategory(payload) {
    const response = await callable('reviewProgressionCategory')(payload);
    return response.data;
}

export async function approveProgressionLevel(reviewId) {
    const response = await callable('approveProgressionLevel')({ reviewId });
    return response.data;
}
