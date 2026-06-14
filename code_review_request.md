# Code Review Request

## Changes:
1. **Decouple Database Initialization**: All DDL and seeding logic moved from `backend/src/config/initDb.ts` to `scripts/setupDb.ts`. Server no longer runs DDL on startup.
2. **Real Encryption**: Implemented `encrypt` and `decrypt` utilities using Node's `crypto` (AES-256-GCM). Applied to all document content storage and retrieval.
3. **Document Versioning**: Created `document_versions` table. Updated `documents.ts` controller and `jobQueue.ts` to insert into `document_versions` on every create/update/redline-accept.
4. **Structured Logging**: Integrated `pino` for structured logging. Updated `server.ts` and `errorHandler` to use structured logs with context.

## Files Modified:
- `backend/src/controllers/documents.ts`
- `backend/src/services/jobQueue.ts`
- `backend/src/utils/crypto.ts`
- `backend/src/utils/logger.ts` (New)
- `backend/src/middleware/error.ts`
- `server.ts`
- `scripts/setupDb.ts`
