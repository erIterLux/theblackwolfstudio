import { getWorkspaceData } from './workspaceData';

export async function getMemberDashboardSummary() {
  return getWorkspaceData('memberDashboard');
}
