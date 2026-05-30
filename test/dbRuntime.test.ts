import assert from "node:assert/strict";
import test from "node:test";
import {
  hasDatabaseConnectionString,
  redactDatabaseUrlForLogs,
  shouldSeedDefaultDocument,
} from "../src/utils/dbRuntime";

test("hasDatabaseConnectionString trims whitespace", () => {
  assert.equal(hasDatabaseConnectionString("   "), false);
  assert.equal(hasDatabaseConnectionString(" postgres://localhost/db "), true);
});

test("redactDatabaseUrlForLogs masks credentials", () => {
  assert.equal(
    redactDatabaseUrlForLogs("db:token@localhost:5432/name"),
    "db:******@localhost:5432/name"
  );
});

test("shouldSeedDefaultDocument only seeds when missing", () => {
  assert.equal(shouldSeedDefaultDocument(0), true);
  assert.equal(shouldSeedDefaultDocument(1), false);
});
