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

export async function listPublishedEvents() {
    const response = await callable('listPublishedEvents')({});
    return response.data;
}

export async function quoteEventCheckout({
    eventId,
    participantCount,
    discountCode = '',
}) {
    return quoteStudioCheckout({
        purchaseType: 'event',
        offerId: eventId,
        quantity: participantCount,
        discountCode,
    });
}

export async function startEventCheckout({
    eventId,
    participantCount,
    discountCode = '',
    purchaser,
    participants,
}) {
    return startStudioCheckout({
        purchaseType: 'event',
        offerId: eventId,
        quantity: participantCount,
        discountCode,
        purchaser,
        participants,
    });
}

export async function getEventRegistration(registrationId, accessToken = '') {
    const response = await callable('getEventRegistration')({
        registrationId,
        accessToken,
    });
    return response.data;
}

export async function listMyEventRegistrations() {
    const response = await callable('listMyEventRegistrations')({});
    return response.data;
}

export async function saveEvent(payload) {
    const response = await callable('saveEvent')(payload);
    return response.data;
}

export async function listEventsAdmin() {
    const response = await callable('listEventsAdmin')({});
    return response.data;
}

export async function getEventWaiver(participantId, accessToken = '') {
    const response = await callable('getEventWaiver')({
        participantId,
        accessToken,
    });
    return response.data;
}

export async function signEventWaiver(payload) {
    const response = await callable('signEventWaiver')(payload);
    return response.data;
}

export async function getEventCheckIn(eventId) {
    const response = await callable('getEventCheckIn')({ eventId });
    return response.data;
}

export async function setEventParticipantCheckIn(participantId, action = 'check_in') {
    const response = await callable('setEventParticipantCheckIn')({
        participantId,
        action,
    });
    return response.data;
}
