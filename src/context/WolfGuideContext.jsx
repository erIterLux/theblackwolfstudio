import {
    createContext,
    useContext,
    useMemo,
    useState,
} from 'react';

const WolfGuideContext = createContext(null);

export function WolfGuideProvider({ children }) {
    const [memberState, setMemberState] = useState('Steady');
    const value = useMemo(
        () => ({ memberState, setMemberState }),
        [memberState],
    );

    return (
        <WolfGuideContext.Provider value={value}>
            {children}
        </WolfGuideContext.Provider>
    );
}

export function useWolfGuideState() {
    const value = useContext(WolfGuideContext);
    if (!value) {
        throw new Error('useWolfGuideState must be used inside WolfGuideProvider.');
    }
    return value;
}
