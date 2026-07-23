import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import { getWorkspaceData, invalidateWorkspaceData } from './workspaceData';

function callable(name) {
    if (!functions) throw new Error('Firebase Functions is not configured.');
    return httpsCallable(functions, name);
}

export async function getMyNotificationUnreadCount() {
    return getWorkspaceData('notificationUnreadCount');
}

export async function listMyNotifications(payload = {}, options = {}) {
    return getWorkspaceData('memberNotifications', payload, options);
}

export async function markNotificationRead(notificationId, read = true) {
    const response = await callable('markNotificationRead')({ notificationId, read });
    invalidateWorkspaceData('memberNotifications');
    return response.data;
}

export async function markAllNotificationsRead() {
    const response = await callable('markAllNotificationsRead')({});
    invalidateWorkspaceData('memberNotifications');
    return response.data;
}

export async function getMyNotificationPreferences(options = {}) {
    return getWorkspaceData('notificationPreferences', {}, options);
}

export async function saveMyNotificationPreferences(optional) {
    const response = await callable('saveMyNotificationPreferences')({ optional });
    invalidateWorkspaceData('notificationPreferences');
    return response.data;
}

export async function listStudioAnnouncementsAdmin(options = {}) {
    return getWorkspaceData('instructorAnnouncements', {}, options);
}

export async function saveStudioAnnouncement(payload) {
    const response = await callable('saveStudioAnnouncement')(payload);
    invalidateWorkspaceData('instructorAnnouncements');
    return response.data;
}
