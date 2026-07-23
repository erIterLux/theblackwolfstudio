import { useAppSession } from '../context/AppSessionContext';

export default function useStudioRole() {
    const {
        role,
        loading,
        error,
        isInstructor,
        refresh,
    } = useAppSession();

    return {
        role,
        loading,
        error,
        isInstructor,
        refresh: () => refresh({ force: true }),
    };
}
