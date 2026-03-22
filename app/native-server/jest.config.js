const collectCoverage = process.env.JEST_COVERAGE === '1' || process.env.CI === 'true';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  watchman: false,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverage,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/scripts/**/*'],
  coverageDirectory: 'coverage',
  ...(collectCoverage
    ? {
        coverageThreshold: {
          global: {
            branches: 70,
            functions: 80,
            lines: 80,
            statements: 80,
          },
        },
      }
    : {}),
};
