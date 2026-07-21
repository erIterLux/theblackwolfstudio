import { createContext, useContext } from 'react';
import useNotifications from '../hooks/useNotifications';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const value = useNotifications({ poll: true, limit: 120 });
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationCenter() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('useNotificationCenter must be used inside NotificationProvider.');
  return value;
}
