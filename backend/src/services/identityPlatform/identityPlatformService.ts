/**
 * Identity Platform service.
 *
 * Verifies Google / Identity Platform ID tokens issued to the frontend.
 * Uses Firebase Admin SDK with Application Default Credentials on GCP
 * (or GOOGLE_APPLICATION_CREDENTIALS for local development).
 *
 * Controllers should call verifyIdToken() — they should not touch the
 * Admin SDK directly.
 */
import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

let firebaseApp: App | undefined;

function ensureApp(): App {
  if (firebaseApp) return firebaseApp;

  const existing = getApps();
  if (existing.length > 0) {
    firebaseApp = existing[0];
    return firebaseApp;
  }

  // ADC is picked up automatically on Cloud Run / GCE / GKE.
  // Locally, set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path.
  firebaseApp = initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });

  return firebaseApp;
}

/**
 * Verifies an Identity Platform ID token and returns its decoded claims.
 * Throws Firebase Auth errors for expired / invalid / revoked tokens.
 */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken> {
  return getAuth(ensureApp()).verifyIdToken(idToken);
}
