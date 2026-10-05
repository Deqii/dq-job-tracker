import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://root:password@localhost:3306/job_tracker_test',
      JWT_SECRET: 'test-secret',
    },
  },
});