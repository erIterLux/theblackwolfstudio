import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
    if (!functions) throw new Error('Firebase Functions is not configured.');
    return httpsCallable(functions, name);
}

async function invoke(name, payload = {}) {
    const response = await callable(name)(payload);
    return response.data;
}

export function getStudioReportSummary(payload = {}) {
    return invoke('getStudioReportSummary', payload);
}

export function getRevenueReport(payload = {}) {
    return invoke('getRevenueReport', payload);
}

export function getMembershipReport(payload = {}) {
    return invoke('getMembershipReport', payload);
}

export function getEventReport(payload = {}) {
    return invoke('getEventReport', payload);
}

export function getPrivateTrainingReport(payload = {}) {
    return invoke('getPrivateTrainingReport', payload);
}

export function getAttendanceReport(payload = {}) {
    return invoke('getAttendanceReport', payload);
}

export function getMemberEngagementReport(payload = {}) {
    return invoke('getMemberEngagementReport', payload);
}

export function getSystemHealthReport(payload = {}) {
    return invoke('getSystemHealthReport', payload);
}

export function exportStudioReport(payload) {
    return invoke('exportStudioReport', payload);
}

export function repairStudioReportCounters(confirm = false) {
    return invoke('repairStudioReportCounters', { confirm });
}
