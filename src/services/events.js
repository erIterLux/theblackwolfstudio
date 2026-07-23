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

export async function listMyEventRegistrations(options = {}) {
    return getWorkspaceData('memberEventRegistrations', {}, options);
}

export async function saveEvent(payload) {
    const response = await callable('saveEvent')(payload);
    invalidateWorkspaceData('instructorEvents');
    return response.data;
}

export async function listEventsAdmin(options = {}) {
    return getWorkspaceData('instructorEvents', {}, options);
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

export async function getEventCheckIn(eventId, options = {}) {
    return getWorkspaceData('eventCheckIn', { eventId }, options);
}

export async function setEventParticipantCheckIn(participantId, action = 'check_in') {
    const response = await callable('setEventParticipantCheckIn')({
        participantId,
        action,
    });
    invalidateWorkspaceData('instructorEvents', 'memberEventRegistrations');
    return response.data;
}
