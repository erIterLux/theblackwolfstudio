import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/global.css';
import './styles/platform.css';
import './styles/progression.css';
import './styles/content.css';
import './styles/private-training.css';
import './styles/events.css';
import './styles/commerce-admin.css';
import './styles/purchases.css';
import './styles/private-booking.css';
import './styles/reports.css';
import './styles/notifications.css';
import './styles/dashboard-refinement.css';
import './styles/app-shells.css';
import './styles/operational-design-system.css';
import './styles/workflow-refinement.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { AppSessionProvider } from './context/AppSessionContext';
import { NotificationProvider } from './context/NotificationContext';

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
