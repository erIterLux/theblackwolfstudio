import useStudioRole from '../hooks/useStudioRole';
import { WolfGuideProvider } from '../context/WolfGuideContext';
import PortalShell from './PortalShell';
import { memberNavigation } from './portalNavigation';

export default function MemberShell() {
  const { isInstructor } = useStudioRole();

  return (
    <WolfGuideProvider>
      <PortalShell
        mode="member"
        title="Member space"
        homePath="/member"
        navigation={memberNavigation}
        notificationsPath="/member/notifications"
        showWolfGuide
        switchLink={isInstructor ? { label: 'Instructor tools', to: '/instructor' } : null}
      />
    </WolfGuideProvider>
  );
}
