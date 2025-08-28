/** @type {import('jest').Config} */
// Use globalThis to avoid ESLint no-undef in non-Node contexts
const coverageProvider = (globalThis.process?.env?.JEST_COVERAGE === 'babel') ? 'babel' : 'v8';

const config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverage: true,
  coverageProvider,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/types/**'
  ],
  coverageThreshold: {
    './src/**/*.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.(ts)$': ['ts-jest', { useESM: true }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
};

export default config;
