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

    // Set RLS variables within the transaction
    // Sanitize values to prevent SQL injection in session variables
    const sanitizedId = userId.replace(/'/g, "''");
    const sanitizedRole = userRole.replace(/'/g, "''");

    await client.query(`SET LOCAL app.current_user_id = '${sanitizedId}'`);
    await client.query(`SET LOCAL app.current_user_role = '${sanitizedRole}'`);

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
