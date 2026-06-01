import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { pool, hasConnectionString } from "../config/database.js";
import { loadDatabase, saveDatabase } from "../utils/localDb.js";

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Please enter all required fields." });
  }

  const normalizedEmail = email.toLowerCase();
  const newUserId = "user_" + Math.random().toString(36).substr(2, 9);

  try {
    if (hasConnectionString) {
      const checkMail = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
      if (checkMail.rows.length > 0) {
        return res.status(400).json({ error: "Email already exists." });
      }

      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      await pool.query(
        "INSERT INTO users (id, email, name, password_hash, status, role) VALUES ($1, $2, $3, $4, $5, $6)",
        [newUserId, normalizedEmail, name, passwordHash, 'PENDING_APPROVAL', 'USER']
      );

      return res.status(201).json({ message: "Account created successfully. Awaiting administrator approval." });
    } else {
      throw new Error("No DB connection");
    }
  } catch (err: any) {
    console.warn("Postgres registration failed, using local fallback:", err.message);
    const db = loadDatabase();
    if (db.users.find((u: any) => u.email === normalizedEmail)) {
      return res.status(400).json({ error: "Email already exists (local)." });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const newUser = {
      id: newUserId,
      email: normalizedEmail,
      name,
      password_hash: passwordHash,
      status: 'PENDING_APPROVAL',
      role: 'USER'
    };
    db.users.push(newUser);
    saveDatabase(db);
    return res.status(201).json({ message: "Account created successfully. Awaiting administrator approval." });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing identity credentials" });
  }

  const normalizedEmail = email.toLowerCase();

  try {
    if (hasConnectionString) {
      const { rows } = await pool.query(
        "SELECT id, email, name, password_hash, status, role FROM users WHERE email = $1",
        [normalizedEmail]
      );

      if (rows.length > 0) {
        const user = rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (isPasswordValid) {
          if (user.status !== 'APPROVED') {
            return res.status(403).json({ error: "Your account is awaiting admin approval." });
          }
          return res.json({ token: user.id, user: { id: user.id, email: user.email, name: user.name, status: user.status, role: user.role } });
        }
      }
    } else {
      throw new Error("No DB connection");
    }
  } catch (err: any) {
    console.warn("Postgres login failed, using local fallback:", err.message);
    const db = loadDatabase();
    const user = db.users.find((u: any) => u.email === normalizedEmail);
    if (user) {
      const isPasswordValid = await bcrypt.compare(password, user.password_hash || user.passwordHash);
      if (isPasswordValid) {
        if (user.status !== 'APPROVED') {
          return res.status(403).json({ error: "Your account is awaiting admin approval." });
        }
        return res.json({ token: user.id, user: { id: user.id, email: user.email, name: user.name, status: user.status, role: user.role } });
      }
    }
  }

  return res.status(401).json({ error: "Invalid email or password." });
};
