// jest.test-db.cjs
//
// Resolves the database the Jest suites run against. Tests wipe tables in
// beforeAll, so they must NEVER touch the dev database.
//
//   1. DATABASE_URL_TEST, if set.
//   2. Otherwise DATABASE_URL with "_test" appended to the database name
//      (e.g. .../nexusid -> .../nexusid_test).
//
// Throws if the result is the dev database. Never logs the URL itself.

const dotenv = require("dotenv");
const path = require("path");

function loadEnv() {
  dotenv.config({ path: path.join(__dirname, "services/backend/.env") });
  dotenv.config({ path: path.join(__dirname, ".env") });
}

function resolveTestDatabaseUrl() {
  loadEnv();

  const devUrl =
    process.env.NEXUSID_DEV_DATABASE_URL ?? process.env.DATABASE_URL;
  let testUrl = process.env.DATABASE_URL_TEST;

  if (!testUrl) {
    if (!devUrl) {
      throw new Error(
        "[jest] Neither DATABASE_URL_TEST nor DATABASE_URL is set.",
      );
    }
    const url = new URL(devUrl);
    const dbName = url.pathname.replace(/^\//, "");
    if (!dbName) {
      throw new Error(
        "[jest] DATABASE_URL has no database name; set DATABASE_URL_TEST.",
      );
    }
    url.pathname = `/${dbName}_test`;
    testUrl = url.toString();
  }

  if (devUrl && testUrl === devUrl) {
    throw new Error(
      "[jest] Test database resolves to the dev database. Refusing to run.",
    );
  }

  return { devUrl, testUrl };
}

/**
 * Points every Prisma client in this process at the test database.
 * The original dev URL is kept in NEXUSID_DEV_DATABASE_URL so a second call
 * (setupFiles runs once per test file) still compares against the real dev DB.
 */
function useTestDatabase() {
  const { devUrl, testUrl } = resolveTestDatabaseUrl();
  if (devUrl) process.env.NEXUSID_DEV_DATABASE_URL = devUrl;
  process.env.DATABASE_URL = testUrl;
  process.env.DATABASE_URL_TEST = testUrl;
  return testUrl;
}

module.exports = { useTestDatabase };
