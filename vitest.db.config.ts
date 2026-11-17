import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { loadEnv } from 'vite'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['supabase/tests/**/*.test.ts', 'src/**/*.db.test.ts'],
    env: loadEnv('test', process.cwd(), ''),
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
