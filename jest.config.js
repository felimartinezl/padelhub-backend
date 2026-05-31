const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'app/api/**/*.ts',
    'lib/**/*.ts',
    '!lib/prisma.ts',
  ],
  clearMocks: true,
};

module.exports = async () => {
  const jestConfig = await createJestConfig(config)();
  return {
    ...jestConfig,
    moduleNameMapper: {
      ...jestConfig.moduleNameMapper,
      '^@/(.*)$': '<rootDir>/$1',
    },
  };
};
