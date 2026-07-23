import { getWorkspaceData } from './workspaceData';

export async function getAuthenticatedAppBootstrap() {
  return getWorkspaceData('bootstrap');
}
