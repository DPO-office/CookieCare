import { pool } from "../config/database.js";
import { PoolClient } from "pg";

export async function withTransaction<T>(
  userId: string,
  userRole: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validate that userId and userRole are safe before embedding them in SET LOCAL.
    // UUIDs with optional "usr_"/"doc_" prefixes are the only expected formats for userId.
    // userRole is an application-controlled enum value.
    const safeIdPattern = /^[a-zA-Z0-9_\-]{1,128}$/;
    const safeRolePattern = /^[A-Z_]{1,64}$/;

    if (!safeIdPattern.test(userId)) {
      throw new Error(`Invalid userId format for RLS session variable: ${userId}`);
    }
    if (!safeRolePattern.test(userRole)) {
      throw new Error(`Invalid userRole format for RLS session variable: ${userRole}`);
    }

    // SET LOCAL does not accept parameterized values in PostgreSQL, so we embed
    // the already-validated strings directly. The regex guards above ensure
    // these cannot contain SQL-special characters.
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    await client.query(`SET LOCAL app.current_user_role = '${userRole}'`);

    const result = await fn(client);

    await client.query("COMMIT");
    client.release();
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Connection may already be gone (terminated unexpectedly).
    }
    // Passing the error discards the client instead of returning a dead
    // connection to the pool.
    client.release(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}
