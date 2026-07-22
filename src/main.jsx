import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { AppSessionProvider } from './context/AppSessionContext';
import { NotificationProvider } from './context/NotificationContext';
import './styles/global.css';
import './styles/platform.css';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <AppSessionProvider>
                    <NotificationProvider>
                        <App />
                    </NotificationProvider>
                </AppSessionProvider>
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>,
);
