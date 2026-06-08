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
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
