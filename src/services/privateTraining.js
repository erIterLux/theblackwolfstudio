import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import {
    quoteStudioCheckout,
    startStudioCheckout,
} from './studioCommerce';
import { getWorkspaceData, invalidateWorkspaceData } from './workspaceData';

function callable(name) {
    if (!functions) throw new Error('Firebase Functions is not configured.');
    return httpsCallable(functions, name);
}

export async function listPrivateTrainingOffers() {
    const response = await callable('listPrivateTrainingOffers')({});
    return response.data;
}

export async function quotePrivateTrainingCheckout({
    offerId,
    participantCount,
    discountCode = '',
}) {
    return quoteStudioCheckout({
        purchaseType: 'private_training',
        offerId,
        quantity: participantCount,
        discountCode,
    });
}

export async function startPrivateTrainingCheckout({
    offerId,
    participantCount,
    discountCode = '',
    purchaser,
    participants,
}) {
    return startStudioCheckout({
        purchaseType: 'private_training',
        offerId,
        quantity: participantCount,
        discountCode,
        purchaser,
        participants,
    });
}

export async function listMyPrivateTrainingPurchases(options = {}) {
    return getWorkspaceData('memberPrivateTrainingPurchases', {}, options);
}

export async function getPrivateTrainingPurchase(purchaseId, accessToken = '') {
    if (!accessToken) {
        return getWorkspaceData('privateTrainingPurchase', { purchaseId });
    }
    const response = await callable('getPrivateTrainingPurchase')({
        purchaseId,
        accessToken,
    });
    return response.data;
}

export async function savePrivateTrainingOffer(payload) {
    const response = await callable('savePrivateTrainingOffer')(payload);
    invalidateWorkspaceData('instructorPrivateTraining');
    return response.data;
}

export async function listPrivateTrainingAdmin(options = {}) {
    return getWorkspaceData('instructorPrivateTraining', {}, options);
}

export async function recordPrivateTrainingSession(payload) {
    const response = await callable('recordPrivateTrainingSession')(payload);
    invalidateWorkspaceData(
        'memberPrivateTrainingPurchases',
        'instructorPrivateTraining',
        'purchaseHistory',
    );
    return response.data;
}

export async function adjustPrivateTrainingCredits(payload) {
    const response = await callable('adjustPrivateTrainingCredits')(payload);
    invalidateWorkspaceData(
        'memberPrivateTrainingPurchases',
        'instructorPrivateTraining',
        'purchaseHistory',
    );
    return response.data;
}

export async function getMyInstructorAvailability(options = {}) {
    return getWorkspaceData('instructorAvailability', {}, options);
}

export async function saveMyInstructorAvailability(payload) {
    const response = await callable('saveMyInstructorAvailability')(payload);
    invalidateWorkspaceData('instructorAvailability');
    return response.data;
}

export async function saveInstructorAvailabilityOverride(payload) {
    const response = await callable('saveInstructorAvailabilityOverride')(payload);
    invalidateWorkspaceData('instructorAvailability');
    return response.data;
}

export async function deleteInstructorAvailabilityOverride(dateKey) {
    const response = await callable('deleteInstructorAvailabilityOverride')({ dateKey });
    invalidateWorkspaceData('instructorAvailability');
    return response.data;
}

export async function listPrivateTrainingAvailability(payload, options = {}) {
    return getWorkspaceData('privateTrainingAvailability', payload, options);
}

export async function createPrivateTrainingBooking(payload) {
    const response = await callable('createPrivateTrainingBooking')(payload);
    invalidateWorkspaceData(
        'memberPrivateTrainingBookings',
        'memberPrivateTrainingPurchases',
        'instructorPrivateTrainingBookings',
    );
    return response.data;
}

export async function listMyPrivateTrainingBookings(options = {}) {
    return getWorkspaceData('memberPrivateTrainingBookings', {}, options);
}

export async function listPrivateTrainingBookingsAdmin(options = {}) {
    return getWorkspaceData('instructorPrivateTrainingBookings', {}, options);
}

export async function updatePrivateTrainingBooking(payload) {
    const response = await callable('updatePrivateTrainingBooking')(payload);
    invalidateWorkspaceData(
        'memberPrivateTrainingBookings',
        'memberPrivateTrainingPurchases',
        'instructorPrivateTrainingBookings',
        'instructorPrivateTraining',
    );
    return response.data;
}
