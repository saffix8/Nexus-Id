// services/backend/jest.global-setup.cjs
//
// Runs once before the backend suites: creates the test database if needed
// and applies all migrations to it. Never touches the dev database.

const { execSync } = require("child_process");
const path = require("path");
const { useTestDatabase } = require("../../jest.test-db.cjs");

module.exports = async function globalSetup() {
  const testUrl = useTestDatabase();

  execSync("npx prisma migrate deploy", {
    cwd: path.join(__dirname),
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: ["ignore", "ignore", "inherit"],
  });
};
