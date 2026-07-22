import useStudioRole from '../hooks/useStudioRole';
import PortalShell from './PortalShell';
import { memberNavigation } from './portalNavigation';

export default function MemberShell() {
  const { isInstructor } = useStudioRole();

  return (
    <PortalShell
      mode="member"
      title="Member space"
      homePath="/member"
      navigation={memberNavigation}
      notificationsPath="/member/notifications"
      switchLink={isInstructor ? { label: 'Instructor tools', to: '/instructor' } : null}
    />
  );
}
