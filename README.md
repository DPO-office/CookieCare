# CookieCare

CookieCare is a full-stack TypeScript app (React + Express) for legal document workflows and website security/cookie scanning.

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