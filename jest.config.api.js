/** @type {import('jest').Config} */
module.exports = {
  displayName: 'API Integration Tests',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/api/**/*.test.ts',
    '**/__tests__/api/**/*.test.js'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.api.js'],
  collectCoverageFrom: [
    'pages/api/**/*.{js,ts}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};