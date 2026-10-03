import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.stories.tsx',
        '**/*.test.{ts,tsx}',
        'cypress/',
        '.next/',
        'dist/',
        'server/index.ts',
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'happy-dom',
          setupFiles: ['./tests/setup/vitest.ts'],
          include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          setupFiles: ['./tests/setup/vitest.server.ts'],
          include: ['server/__tests__/**/*.{test,spec}.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@server': path.resolve(__dirname, './server'),
      '@app': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
      '@contract': path.resolve(__dirname, './contract'),
      'next/image': path.resolve(__dirname, './tests/mocks/next/image.tsx'),
      'next/link': path.resolve(__dirname, './tests/mocks/next/link.tsx'),
      'next/router': path.resolve(__dirname, './tests/mocks/next/router.tsx'),
    },
  },
});
