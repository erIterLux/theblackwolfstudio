import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import {
    quoteStudioCheckout,
    startStudioCheckout,
} from './studioCommerce';

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

export async function listMyPrivateTrainingPurchases() {
    const response = await callable('listMyPrivateTrainingPurchases')({});
    return response.data;
}

export async function getPrivateTrainingPurchase(purchaseId, accessToken = '') {
    const response = await callable('getPrivateTrainingPurchase')({
        purchaseId,
        accessToken,
    });
    return response.data;
}

export async function savePrivateTrainingOffer(payload) {
    const response = await callable('savePrivateTrainingOffer')(payload);
    return response.data;
}

export async function listPrivateTrainingAdmin() {
    const response = await callable('listPrivateTrainingAdmin')({});
    return response.data;
}

export async function recordPrivateTrainingSession(payload) {
    const response = await callable('recordPrivateTrainingSession')(payload);
    return response.data;
}

export async function adjustPrivateTrainingCredits(payload) {
    const response = await callable('adjustPrivateTrainingCredits')(payload);
    return response.data;
}

export async function getMyInstructorAvailability() {
    const response = await callable('getMyInstructorAvailability')({});
    return response.data;
}

export async function saveMyInstructorAvailability(payload) {
    const response = await callable('saveMyInstructorAvailability')(payload);
    return response.data;
}

export async function saveInstructorAvailabilityOverride(payload) {
    const response = await callable('saveInstructorAvailabilityOverride')(payload);
    return response.data;
}

export async function deleteInstructorAvailabilityOverride(dateKey) {
    const response = await callable('deleteInstructorAvailabilityOverride')({ dateKey });
    return response.data;
}

export async function listPrivateTrainingAvailability(payload) {
    const response = await callable('listPrivateTrainingAvailability')(payload);
    return response.data;
}

export async function createPrivateTrainingBooking(payload) {
    const response = await callable('createPrivateTrainingBooking')(payload);
    return response.data;
}

export async function listMyPrivateTrainingBookings() {
    const response = await callable('listMyPrivateTrainingBookings')({});
    return response.data;
}

export async function listPrivateTrainingBookingsAdmin() {
    const response = await callable('listPrivateTrainingBookingsAdmin')({});
    return response.data;
}

export async function updatePrivateTrainingBooking(payload) {
    const response = await callable('updatePrivateTrainingBooking')(payload);
    return response.data;
}
