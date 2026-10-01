import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: {
    postcss: {},
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});