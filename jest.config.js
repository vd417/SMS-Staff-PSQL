module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Default 5s is too tight for waitFor-heavy screen tests once the full
  // suite runs across parallel workers and CPU contention slows them down.
  testTimeout: 20000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Nested git worktrees under .worktrees/ carry their own node_modules (a second copy
  // of react et al.) — without this, jest's haste map picks up both copies and hooks
  // fail with "Cannot read properties of null (reading 'useState')".
  modulePathIgnorePatterns: ['<rootDir>/\\.worktrees/'],
  // Fixture data lives under a __tests__ folder (so it's colocated with contract.test.ts) but
  // isn't itself a test file — jest-expo's default testMatch otherwise picks it up and fails
  // with "Your test suite must contain at least one test."
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/\\.worktrees/', '<rootDir>/src/data/__tests__/fixtures/'],
  watchPathIgnorePatterns: ['<rootDir>/\\.worktrees/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated|react-native-gesture-handler|@tanstack/.*|i18next|react-i18next))',
  ],
};
