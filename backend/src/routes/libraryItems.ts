import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { getLibraryItems, createLibraryItem, deleteLibraryItem } from "../controllers/libraryItems.js";

const router = Router();

router.get("/", authenticateToken, getLibraryItems);
router.post("/", authenticateToken, createLibraryItem);
router.delete("/:id", authenticateToken, deleteLibraryItem);

export default router;
