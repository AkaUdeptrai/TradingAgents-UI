import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('..', import.meta.url));
  const env = loadEnv(mode, envDir, 'TRADINGAGENTS_UI_');
  const legacyEnvDir = fileURLToPath(new URL('../../portal', import.meta.url));
  const legacyEnv = loadEnv(mode, legacyEnvDir, 'PORTAL_');
  return {
    plugins: [react()],
    envDir,
    // Only this explicitly public value enters the browser bundle.
    define: {
      'import.meta.env.TRADINGAGENTS_UI_API_URL': JSON.stringify(
        env.TRADINGAGENTS_UI_API_URL || legacyEnv.PORTAL_API_URL || '/api',
      ),
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': `http://127.0.0.1:${env.TRADINGAGENTS_UI_PORT || legacyEnv.PORTAL_PORT || '8000'}`,
      },
    },
    test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], restoreMocks: true },
  };
});
