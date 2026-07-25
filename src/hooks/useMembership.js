import { useMemo } from 'react';
import { useAppSession } from '../context/AppSessionContext';

const LIVE_STATUSES = new Set(['active', 'trialing']);

export default function useMembership() {
    const {
        membership,
        loading,
        error,
        refresh,
    } = useAppSession();

    return useMemo(() => {
        const isActive = LIVE_STATUSES.has(membership?.status);
        const planKey = String(membership?.planKey || '').toLowerCase();
        const weeklyMessages = Number(
            membership?.benefits?.wolfGuideMessagesPerWeek
            ?? (planKey === 'train' ? 15 : planKey === 'integrate' ? 30 : 0),
        );
        const previewMessages = Number(
            membership?.benefits?.wolfGuidePreviewMessages
            ?? (planKey === 'begin' ? 3 : 0),
        );
        const hasWeeklyAccess = Boolean(
            membership?.wolfGuideAccess
            ?? membership?.benefits?.wolfGuideAccess
            ?? weeklyMessages > 0,
        );

        return {
            membership,
            loading,
            error,
            isActive,
            canUseWolfGuide: isActive && (hasWeeklyAccess || previewMessages > 0),
            hasWeeklyWolfGuideAccess: isActive && hasWeeklyAccess,
            wolfGuideMessagesPerWeek: weeklyMessages,
            wolfGuidePreviewMessages: previewMessages,
            refresh,
        };
    }, [membership, loading, error, refresh]);
}
