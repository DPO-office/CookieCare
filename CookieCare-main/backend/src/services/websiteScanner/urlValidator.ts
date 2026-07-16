/**
 * Reusable URL validation utility.
 *
 * Centralises SSRF-protection logic so every scanning feature uses the same
 * blocklist.  ScannerService now delegates to this module; the Cookie Scanner
 * behaviour is unchanged.
 */

import { UrlValidationResult } from "./types.js";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254", // AWS metadata
  "::1",
  "::ffff:127.0.0.1",
  "localhost.localdomain",
]);

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^fc[0-9a-f]{2}:/i, // IPv6 unique-local
  /^fe[89ab][0-9a-f]:/i, // IPv6 link-local
];

/** Ports that should never be used for web scanning. */
const BLOCKED_PORTS = new Set(["25", "465", "587"]);

/**
 * Validate a URL for safety before making any network request.
 *
 * @returns `{ valid: true }` when safe, or `{ valid: false, reason }` when
 *          the URL is blocked/private/invalid.
 */
export function validateUrl(url: string): UrlValidationResult {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch (err: any) {
    return { valid: false, reason: `Invalid URL format: ${err.message}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, reason: `Blocked hostname: ${hostname}` };
  }

  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, reason: `Private IP range blocked: ${hostname}` };
    }
  }

  if (parsed.port && BLOCKED_PORTS.has(parsed.port)) {
    return { valid: false, reason: `Blocked port: ${parsed.port}` };
  }

  return { valid: true };
}

/**
 * Normalise a raw URL string by prepending https:// when no scheme is given.
 */
export function normaliseUrl(raw: string): string {
  return raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `https://${raw}`;
}
