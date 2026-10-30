import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('..', import.meta.url));
  const env = loadEnv(mode, envDir, 'PORTAL_');
  return {
    plugins: [react()],
    envDir,
    // Only this explicitly public value enters the browser bundle.
    define: { 'import.meta.env.PORTAL_API_URL': JSON.stringify(env.PORTAL_API_URL || '/api') },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${env.PORTAL_PORT || '8000'}` },
    },
    test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], restoreMocks: true },
  };
});
