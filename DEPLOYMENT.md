# LORA production deployment on DigitalOcean

The main Droplet runs Caddy, the API, and PostgreSQL 17 with pgvector 0.8.7. A second Droplet runs the authenticated Docling service. The main image has no Docling model assets. Knowledge Base ingestion remains disabled for this deployment.

These instructions require a maintenance window and a current, tested database backup for upgrades. They do not provision Droplets, DNS, certificates, buckets, or firewalls.

## Secrets and network preparation

On the main Droplet, copy `.env.example` to `.env`, fill the values needed for the main application, and set file permissions to `0600`. Set `KB_INGESTION_ENABLED=false`; the four `DO_SPACES_*` values can remain blank. Keep `.env` outside Git and restrict access to the deployment account. Compose environment files are available to Docker and to anyone with Docker control; use a dedicated secrets manager if your operating model requires one. Generate a unique `POSTGRES_PASSWORD`, `JWT_SECRET`, and Docling bearer token (at least 32 random characters). Preserve the existing `ENCRYPTION_KEY` exactly when moving existing encrypted documents. It must be 32 bytes. Do not put seed admin credentials in `.env`.

Set `DATABASE_URL` to `postgresql://POSTGRES_USER:POSTGRES_PASSWORD@db:5432/POSTGRES_DB`, substituting the actual values and URL-encoding reserved password characters. The three `POSTGRES_*` values initialize a **new** database volume only; changing them later does not rotate credentials in an existing volume. The database has no published host port. Restrict SSH and Docker access to administrators.

On the Docling Droplet, copy `.env.docling.example` to `.env.docling` with mode `0600`. Use the same `DOCLING_SERVICE_TOKEN` value on both Droplets. Set `DOCLING_PRIVATE_IP` to that Droplet's private interface address. Permit TCP 443 to this private IP only from the main Droplet; deny public access to 443 and to Docling port 8090. The service container publishes no port. Arrange private DNS or a hosts entry so `DOCLING_DOMAIN` resolves to the private IP from the main Droplet. Install a trusted certificate for that name at `certs/docling/fullchain.pem` and `certs/docling/privkey.pem` on the Docling Droplet, with restricted file permissions. A DNS-validated public CA certificate or a CA trusted by the main Droplet can be used. The Caddy config does not issue certificates automatically. Set main `DOCLING_SERVICE_URL=https://<DOCLING_DOMAIN>/`; TLS verification stays enabled.

The API rejects a missing Docling URL or token in production. Its Docling calls use authenticated HTTPS, a 25 MiB input limit, a 120-second client timeout, and explicit errors. Docling limits processing to one concurrent request by default and returns 503 when busy. Size and concurrency limits can be adjusted after measuring the 4 GB Docling Droplet.

## Build and start, in order

1. On the Docling Droplet, run `docker compose --env-file .env.docling -f compose.docling.yaml config --quiet`, then `docker compose --env-file .env.docling -f compose.docling.yaml build`. The image installs `docling.rs` and its PDF model assets. Provision the TLS files, then run `docker compose --env-file .env.docling -f compose.docling.yaml up -d`. Check `docker compose --env-file .env.docling -f compose.docling.yaml ps` and logs. From the main Droplet, confirm that the private hostname resolves to the private IP and that HTTPS validates the certificate. Do not expose the service publicly for testing.
2. On the main Droplet, run `docker compose config --quiet` and `docker compose build`. Inspect the resulting image and confirm it contains `backend/dist/server.js`, but no `.models`, `.pdfium`, or production `docling.rs` package. The image is built from the root `Dockerfile`; `render.yaml` is separate and unchanged.
3. Run `docker compose up -d db` and wait for `docker compose ps db` to report healthy. On a **new** volume, the pinned `pgvector/pgvector:0.8.7-pg17-bookworm` image initializes PostgreSQL. Verify `docker compose exec db psql -U lora_app -d lora -c "SELECT extname FROM pg_available_extensions WHERE name = 'vector'"`, replacing the user/database if configured differently. This checks availability; the setup job creates the extension and fails if it cannot.
4. Take a backup before any existing-database schema update. Run the explicit application setup job: `docker compose --profile setup run --rm db-setup`. For a **new** database, provide `LORA_SEED_ADMIN_EMAIL` and `LORA_SEED_ADMIN_PASSWORD` (at least 16 characters) only to this one-off command, for example `docker compose --profile setup run --rm -e LORA_SEED_ADMIN_EMAIL -e LORA_SEED_ADMIN_PASSWORD db-setup` after setting those variables in a protected shell. The setup is repeatable and does not replace an existing admin password. Review its output; any pgvector failure is fatal.
5. Run `docker compose up -d --no-build api proxy`. Setup is not run on each API restart. Check `docker compose ps`, `docker compose logs --tail=100 db api proxy`, and `https://<LORA_DOMAIN>/api/healthz`. The health check requires PostgreSQL and the Docling service to respond. With `KB_INGESTION_ENABLED=false`, Knowledge Base routes return 503 and no KB migrations or jobs run.

For updates, back up first, build new images, review schema changes, run the explicit setup job, then recreate services. Keep the previous image tag and `.env` available for application rollback. Database schema rollback needs a tested restore plan; do not assume an older image can read a newer schema.

## Backups, restore, and operations

The named `postgres_data` volume contains the database. Caddy's `caddy_data` and `caddy_config` volumes retain certificates and settings. Back up PostgreSQL regularly with a consistent `pg_dump -Fc` archive, for example `docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > lora-$(date +%F).dump` from a protected directory on the Droplet. Encrypt and copy the backup off the Droplet. Back up the `.env` secrets and encryption key separately under access control. Periodically restore an archive into a **new, isolated test database**, check row counts and an encrypted-document read, and rehearse the application migrations there. Never run restore tests against production data or overwrite the production volume.

Monitor free disk space, database and container health, API errors, KB failed jobs, Docling 503/504 rates, certificate expiry, and backup age. Use `docker compose logs` with restricted access; the production Compose config disables verbose analysis traces and document-content dumps. Do not log document bytes, signed URLs, or tokens. Local diagnostic outputs are ephemeral and are not part of the production backup plan. Keep inbound main-Droplet firewall rules to TCP 80/443 (and UDP 443 if HTTP/3 is used), plus restricted SSH. `LORA_HTTP_PORT` exposes the API on loopback only for diagnostics.

## DigitalOcean Spaces staging gate

When Knowledge Base ingestion work resumes, create a private Space and a bucket-scoped Spaces key. Set `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_KEY`, and `DO_SPACES_SECRET` in the main Droplet's `.env`, then enable `KB_INGESTION_ENABLED=true` after reviewing the KB migration plan. The application derives the HTTPS regional endpoint and uses virtual-hosted addressing. The API then applies KB migrations and starts Knowledge Base processing. The Spaces API is S3 compatible, so the application still uses the S3 SDK and request headers; it does not use an AWS account or credential chain.

Before using Spaces in production, run the full intake and preparation flow against a real **private staging bucket** and verify:

- A browser presigned PDF upload succeeds with the required `Content-Type` and `x-amz-checksum-sha256` headers, a five-minute expiry, and CORS limited to the frontend origin.
- A wrong checksum, missing signed header, oversized PDF, and unauthorized key are rejected.
- Presigned read URLs work only until expiry, private objects cannot be fetched without authorization, and the application verifies the returned size and checksum.
- Immutable `If-None-Match: *` PDF and JSON artifact writes reject overwrites; artifact retrieval preserves content type, size, and SHA-256.
- Delete behavior for abandoned staging uploads works, without deleting committed immutable artifacts.
- Virtual-hosted addressing works with the actual Space name and TLS certificate.

Record Spaces response headers, SDK errors, and test results before using production storage. No Space or cloud setting is created by this repository change. See the KB [ingestion deployment guide](backend/src/mastra/knowledge-base/ingestion/DEPLOYMENT.md) for authorization and CORS details.
