/**
 * Firebase / Identity Platform client configuration.
 *
 * Initialisation is lazy: the SDK is only touched when the user actually
 * starts a Google sign-in. This keeps the app bootable when the Firebase
 * env vars are absent (local dev, or before Identity Platform is provisioned).
 *
 * Required env vars for Google sign-in:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
};

/**
 * True when every value needed to talk to Identity Platform is present.
 * The UI uses this to decide whether to offer Google sign-in at all.
 */
export const isGoogleAuthConfigured =
  Boolean(firebaseConfig.apiKey) &&
  Boolean(firebaseConfig.authDomain) &&
  Boolean(firebaseConfig.projectId);

let cachedAuth: Auth | undefined;

function ensureApp(): FirebaseApp {
  const existing = getApps();
  return existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
}

/**
 * Returns the Firebase Auth instance, initialising the SDK on first use.
 * Throws a descriptive error when the env vars have not been configured.
 */
export function getFirebaseAuth(): Auth {
  if (!isGoogleAuthConfigured) {
    throw new Error(
      "Google sign-in is not configured. Set VITE_FIREBASE_API_KEY, " +
      "VITE_FIREBASE_AUTH_DOMAIN and VITE_FIREBASE_PROJECT_ID."
    );
  }

  if (!cachedAuth) {
    cachedAuth = getAuth(ensureApp());
  }

  return cachedAuth;
}

/** Fresh provider per call — GoogleAuthProvider carries per-request state. */
export function createGoogleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}
