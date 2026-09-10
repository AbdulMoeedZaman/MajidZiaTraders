import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Unit tests run the main-process services against a temporary SQLite file in plain Node.
// `electron` is replaced by a small stub (tests/unit/electron-stub.ts).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      electron: resolve(__dirname, 'tests/unit/electron-stub.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 20000,
  },
})
