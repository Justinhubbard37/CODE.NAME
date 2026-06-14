import { defineConfig } from 'vitest/config';

// Standalone test config (kept separate from the Tauri vite.config so tests run
// plugin-free and fast). Node environment — these are pure logic tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
