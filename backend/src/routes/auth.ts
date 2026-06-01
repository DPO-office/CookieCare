import { Router } from "express";
import { authenticateToken, isAdmin } from "../middleware/auth.js";
import * as authController from "../controllers/auth.js";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);

export default router;
