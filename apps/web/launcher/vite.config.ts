import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const port = 5173;

export default defineConfig({
  plugins: [react()],
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
