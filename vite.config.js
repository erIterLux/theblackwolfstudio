import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const authPopupHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

function manualChunks(id) {
    if (!id.includes('node_modules')) return undefined;
    if (id.includes('/firebase/') || id.includes('node_modules/@firebase/')) {
        return 'firebase-vendor';
    }
    if (
        id.includes('/react/')
        || id.includes('/react-dom/')
        || id.includes('/react-router/')
        || id.includes('/react-router-dom/')
    ) {
        return 'react-vendor';
    }
    if (id.includes('/lucide-react/')) return 'icons-vendor';
    return undefined;
}

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        headers: authPopupHeaders,
    },
    preview: {
        headers: authPopupHeaders,
    },
    build: {
        target: 'es2022',
        cssCodeSplit: true,
        sourcemap: false,
        reportCompressedSize: true,
        chunkSizeWarningLimit: 750,
        rollupOptions: {
            output: {
                manualChunks,
            },
        },
    },
});
