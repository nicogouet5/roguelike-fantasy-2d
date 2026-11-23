import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1800,
  },
  server: {
    host: true,
    port: 4174,
    strictPort: false,
  },
});
