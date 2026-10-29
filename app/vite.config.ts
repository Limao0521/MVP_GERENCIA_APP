import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const coreDir = fileURLToPath(new URL('../core/src', import.meta.url));

export default defineConfig({
  plugins: [react()],
  // .env vive en la raíz del repo (una sola fuente de variables)
  envDir: '..',
  resolve: { alias: { '@core': coreDir } },
  build: { chunkSizeWarningLimit: 700 },
  server: { port: 5173, fs: { allow: ['..'] } },
});
