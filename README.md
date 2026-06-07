# PrivSecAI

PrivSecAI is a full-stack TypeScript app (React + Express) for legal document workflows and website security/cookie scanning.

## Quick start

```bash
npm ci
npm run dev
```

App/API runs on `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env` and set keys as needed:

- `GEMINI_API_KEY` (optional for offline fallback mode)
- `DATABASE_URL` (optional for Postgres mode; app falls back to local JSON storage when missing)

## MVP validation commands

```bash
npm run lint
npm run test
npm run build
```

## Production run

```bash
npm run build
npm run start
```

## Deploy to Vercel

This repo is set up as a Vite frontend plus an Express API wrapped for Vercel.

1. Push the repository to GitHub.
2. Import the repo in Vercel from the repository root.
3. Keep the default build command as `npm run build`.
4. Set the output directory to `dist/client` if Vercel does not infer it automatically.
5. Add environment variables in Vercel:
	- `DATABASE_URL`
	- `GEMINI_API_KEY` if you want live AI features
	- `CORS_ORIGIN` if you use a custom domain
6. Deploy from the root folder, not the `backend/` folder.

The backend is exposed through [api/[...path].ts](api/[...path].ts), which forwards all `/api/*` requests to the Express app in [server.ts](server.ts).