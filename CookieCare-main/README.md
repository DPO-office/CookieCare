# Lexify

Lexify is a full-stack TypeScript app (React + Express) for legal document workflows and website security/cookie scanning.

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

## Deploy to Render

This project is deployed on Render. The backend runs as a Node.js web service and the frontend is served as a static site.

Set the following environment variables in your Render service:
- `DATABASE_URL`
- `OPENROUTER_API_KEY`
- `JWT_SECRET`
- `CORS_ORIGIN` if you use a custom domain