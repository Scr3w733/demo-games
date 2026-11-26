import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        game: `${root}index.html`,
        landing: `${root}landing.html`,
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
