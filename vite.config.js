import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const authPopupHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        headers: authPopupHeaders,
    },
    preview: {
        headers: authPopupHeaders,
    },
});

