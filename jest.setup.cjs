const { useTestDatabase } = require("./jest.test-db.cjs");

// Loads env files and redirects DATABASE_URL to the isolated test database.
useTestDatabase();

console.log("[JEST ENV] DATABASE_URL: test database");
