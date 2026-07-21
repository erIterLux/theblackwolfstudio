import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseFunctions';

function callable(name) {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return httpsCallable(functions, name);
}

export async function getStudioReportSummary(payload = {}) {
  const response = await callable('getStudioReportSummary')(payload);
  return response.data;
}

export async function exportStudioReport(payload) {
  const response = await callable('exportStudioReport')(payload);
  return response.data;
}

export async function repairStudioReportCounters(confirm = false) {
  const response = await callable('repairStudioReportCounters')({ confirm });
  return response.data;
}
