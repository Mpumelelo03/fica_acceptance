import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const { VITE_API_BASE_URL } = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: VITE_API_BASE_URL || 'http://localhost:5000',
          changeOrigin: true
        }
      }
    }
  };
});
