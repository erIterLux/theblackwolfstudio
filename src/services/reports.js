import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';
import { getWorkspaceReportData } from './workspaceData';

function callable(name) {
    if (!functions) throw new Error('Firebase Functions is not configured.');
    return httpsCallable(functions, name);
}

async function invoke(name, payload = {}) {
    const response = await callable(name)(payload);
    return response.data;
}

export function getStudioReportSummary(payload = {}) {
    return getWorkspaceReportData('overview', payload);
}

export function getRevenueReport(payload = {}) {
    return getWorkspaceReportData('revenue', payload);
}

export function getMembershipReport(payload = {}) {
    return getWorkspaceReportData('memberships', payload);
}

export function getEventReport(payload = {}) {
    return getWorkspaceReportData('events', payload);
}

export function getPrivateTrainingReport(payload = {}) {
    return getWorkspaceReportData('privateTraining', payload);
}

export function getAttendanceReport(payload = {}) {
    return getWorkspaceReportData('attendance', payload);
}

export function getMemberEngagementReport(payload = {}) {
    return getWorkspaceReportData('engagement', payload);
}

export function getSystemHealthReport(payload = {}) {
    return getWorkspaceReportData('systemHealth', payload);
}

export function exportStudioReport(payload) {
    return invoke('exportStudioReport', payload);
}

export function repairStudioReportCounters(confirm = false) {
    return invoke('repairStudioReportCounters', { confirm });
}
