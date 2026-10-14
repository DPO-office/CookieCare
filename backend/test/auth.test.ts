import { test } from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../server.js";

// Guard: these tests hit the real database and must only run in a test environment.
// Running them in development or production seeds fake "Test User" rows into
// the real users table which then appear in the Admin Panel as pending approvals.
if (process.env.NODE_ENV !== "test") {
  console.warn(
    "[auth.test.ts] Skipping tests — NODE_ENV is not 'test'. " +
    "Set NODE_ENV=test to run these against a dedicated test database."
  );
  process.exit(0);
}

test("POST /api/auth/register should require email, password, and name", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({});
  assert.strictEqual(res.status, 400);
});

test("POST /api/auth/register should return 201 and message on success", async () => {
  const email = `test-${Math.random()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({
      email,
      password: "password123",
      name: "Test User"
    });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.message, "Account created successfully. Awaiting administrator approval.");
});

test("POST /api/auth/login should fail for unapproved users", async () => {
  const email = `test-login-${Math.random()}@example.com`;
  // Register
  await request(app)
    .post("/api/auth/register")
    .send({
      email,
      password: "password123",
      name: "Test User"
    });

  // Login
  const res = await request(app)
    .post("/api/auth/login")
    .send({
      email,
      password: "password123"
    });

  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.body.error, "Your account is awaiting admin approval.");
});
