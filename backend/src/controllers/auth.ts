import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { pool } from "../config/database.js";

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Please enter all required fields." });
  }

  const normalizedEmail = email.toLowerCase();
  const newUserId = "user_" + Math.random().toString(36).substr(2, 9);

  try {
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
  } catch (err: any) {
    console.error("Registration failed:", err);
    return res.status(500).json({ error: "Registration failed." });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing identity credentials" });
  }

  const normalizedEmail = email.toLowerCase();

  try {
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
        return res.json({
          token: user.id,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            status: user.status,
            role: user.role
          }
        });
      }
    }
  } catch (err: any) {
    console.error("Login failed:", err);
    return res.status(500).json({ error: "Login failed." });
  }

  return res.status(401).json({ error: "Invalid email or password." });
};
