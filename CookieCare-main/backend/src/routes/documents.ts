import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import * as docController from "../controllers/documents.js";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 75 * 1024 * 1024 } });

router.get("/", authenticateToken, docController.getDocuments);
router.get("/:id", authenticateToken, docController.getDocumentById);
router.post("/", authenticateToken, docController.createDocument);
router.put("/:id", authenticateToken, docController.updateDocument);
router.delete("/:id", authenticateToken, docController.deleteDocument);

// we are using /upload route to upload the playbook
router.post("/upload", authenticateToken, upload.single("file"), docController.uploadDocument);
router.post("/export", authenticateToken, docController.exportDocument);
router.post("/:id/share", authenticateToken, docController.shareDocument);
router.post("/:id/request-signature", authenticateToken, docController.requestSignature);
router.post("/:id/sign", authenticateToken, docController.signDocument);

// Redlines
router.post("/:id/redline", authenticateToken, docController.createRedline);
router.post("/:id/redline/:redlineId/accept", authenticateToken, docController.acceptRedline);
router.post("/:id/redline/:redlineId/reject", authenticateToken, docController.rejectRedline);

export default router;

