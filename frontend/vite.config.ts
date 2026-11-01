import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // The repository-root .env is shared with the backend; only TRADINGAGENTS_UI_* is read.
  const envDir = fileURLToPath(new URL('..', import.meta.url));
  const env = loadEnv(mode, envDir, 'TRADINGAGENTS_UI_');
  return {
    plugins: [react()],
    envDir,
    // Only this explicitly public value enters the browser bundle.
    define: {
      'import.meta.env.TRADINGAGENTS_UI_API_URL': JSON.stringify(
        env.TRADINGAGENTS_UI_API_URL || '/api',
      ),
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': `http://127.0.0.1:${env.TRADINGAGENTS_UI_PORT || '8000'}`,
      },
    },
    test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], restoreMocks: true },
  };
});
