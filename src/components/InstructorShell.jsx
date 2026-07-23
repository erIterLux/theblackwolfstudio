import PortalShell from './PortalShell';
import { instructorNavigation } from './portalNavigation';

export default function InstructorShell() {
  return (
    <PortalShell
      mode="instructor"
      title="Instructor workspace"
      homePath="/instructor"
      navigation={instructorNavigation}
      notificationsPath="/instructor/notifications"
      switchLink={{ label: 'Member view', to: '/member' }}
    />
  );
}
