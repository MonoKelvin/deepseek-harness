import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));

const port = 5173;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(configDir, './src'),
    },
  },
  clearScreen: false,
  root: '.',
  server: {
    port,
    strictPort: true,
  },
  base: './',
  build: {
    outDir: 'dist',
  },
});
