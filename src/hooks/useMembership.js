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

    return useMemo(() => ({
        membership,
        loading,
        error,
        isActive: LIVE_STATUSES.has(membership?.status),
        canUseWolfGuide: LIVE_STATUSES.has(membership?.status)
            && Boolean(membership?.wolfGuideAccess ?? membership?.benefits?.wolfGuideAccess),
        refresh,
    }), [membership, loading, error, refresh]);
}
