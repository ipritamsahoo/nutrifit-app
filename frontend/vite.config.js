import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    open: true,
    host: true, // Listen on all local IPs
    proxy: {
      '/musclewiki-video': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/proxy-video': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/proxy-image': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/exercise-gif': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/search-exercise': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    }
  },
});
