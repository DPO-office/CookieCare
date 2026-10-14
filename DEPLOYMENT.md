# LORA on one DigitalOcean Droplet

The root [compose.yaml](compose.yaml) runs the API and knowledge base worker as separate containers from the same image. [Caddyfile](Caddyfile) serves the application over HTTPS. The worker applies its knowledge base SQL migrations before polling. No separate Mastra Droplet is needed.

## Prepare

1. Install Docker and Docker Compose on the Droplet. Point a public DNS name at its IP address and allow inbound TCP ports 80 and 443 (and UDP 443 for HTTP/3). Provide an existing PostgreSQL database and a private S3 bucket. The database user must be able to create and update the application tables. Configure bucket CORS for browser PDF uploads as described in [the ingestion deployment guide](backend/src/mastra/knowledge-base/ingestion/DEPLOYMENT.md).
2. Copy [.env.example](.env.example) to an untracked `.env` on the Droplet and supply production values. Set `LORA_DOMAIN` to the DNS name and `CORS_ORIGIN` to its matching `https://` origin. `ENCRYPTION_KEY` must be exactly 32 bytes. Keep the existing encryption key when migrating an existing database. `JWT_SECRET` and `CORS_ORIGIN` are required in production.
3. Build the image: `docker compose build`. This must finish successfully before starting either process.
4. Apply the application database setup: `docker compose --profile setup run --rm db-setup`. For a **new** database, set `LORA_SEED_ADMIN_EMAIL` and `LORA_SEED_ADMIN_PASSWORD` (at least 16 characters) in the shell and pass them with `docker compose --profile setup run --rm -e LORA_SEED_ADMIN_EMAIL -e LORA_SEED_ADMIN_PASSWORD db-setup`. Keep those seed values out of `.env` so they are not passed to the long-running API and worker. Existing databases do not need the seed values. The setup command does not replace an existing admin password.
5. Start the proxy and both processes: `docker compose up -d --no-build`. Inspect them with `docker compose ps` and `docker compose logs --tail=100 proxy api kb-worker`. Check `https://$LORA_DOMAIN/api/healthz` after DNS and certificates are ready.

The API is also bound to `127.0.0.1:8080` for local diagnostics; change `LORA_HTTP_PORT` if it is already occupied. Caddy routes the public domain to the API over the private Compose network and stores certificates in a persistent Docker volume. The worker has no published port. The included `render.yaml` is for Render and is not used by this Droplet setup.

For updates, build the new image, run the database setup command, then run `docker compose up -d --no-build`. The worker checks its own migration checksums at startup. Back up PostgreSQL before schema changes and retain the production `.env` and encryption key securely.

The S3 adapter currently uses AWS S3 endpoints. DigitalOcean Spaces needs a configured custom endpoint and live compatibility testing before substituting it for the bucket above.
