import { defineConfig } from 'vitest/config'

// Unit tests only (money maths, sync rules): src/**/*.test.ts. No browser, no database.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000, // building an Excel or PDF file can be slow on a busy machine
    env: { VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'test-key' },
  },
})
