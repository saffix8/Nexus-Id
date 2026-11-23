/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",

  roots: ["<rootDir>/src"],

  moduleFileExtensions: ["ts", "js", "json"],

  extensionsToTreatAsEsm: [".ts"],

  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  // Redirects DATABASE_URL to the isolated test database (see jest.test-db.cjs).
  setupFiles: ["<rootDir>/../../jest.setup.cjs"],
  globalSetup: "<rootDir>/jest.global-setup.cjs",

  testPathIgnorePatterns: ["/node_modules/", "/__tests__/helpers.ts"],
};
