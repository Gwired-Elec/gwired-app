import { defineConfig } from 'vitest/config'

// Unit tests only (money maths, sync rules): src/**/*.test.ts. No browser, no database.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: { VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'test-key' },
  },
})
