import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    conditions: ['browser']
  },
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDom: { url: 'http://localhost' }
    },
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    globals: true
  }
});
