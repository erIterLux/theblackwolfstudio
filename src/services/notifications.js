import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
    if (!functions) throw new Error('Firebase Functions is not configured.');
    return httpsCallable(functions, name);
}

export async function getMyNotificationUnreadCount() {
    const response = await callable('getMyNotificationUnreadCount')({});
    return response.data;
}

export async function listMyNotifications(payload = {}) {
    const response = await callable('listMyNotifications')(payload);
    return response.data;
}

export async function markNotificationRead(notificationId, read = true) {
    const response = await callable('markNotificationRead')({ notificationId, read });
    return response.data;
}

export async function markAllNotificationsRead() {
    const response = await callable('markAllNotificationsRead')({});
    return response.data;
}

export async function getMyNotificationPreferences() {
    const response = await callable('getMyNotificationPreferences')({});
    return response.data;
}

export async function saveMyNotificationPreferences(optional) {
    const response = await callable('saveMyNotificationPreferences')({ optional });
    return response.data;
}

export async function listStudioAnnouncementsAdmin() {
    const response = await callable('listStudioAnnouncementsAdmin')({});
    return response.data;
}

export async function saveStudioAnnouncement(payload) {
    const response = await callable('saveStudioAnnouncement')(payload);
    return response.data;
}
