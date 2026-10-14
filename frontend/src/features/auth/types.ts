export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export interface AuthSuccessPayload {
  token: string;
  user: AuthUser;
}

/** Returned by register (201) — no token, just a message. */
export interface AuthPendingPayload {
  message: string;
  code: "PENDING_APPROVAL";
}

/** Error body shape from login/google when user is pending. */
export interface AuthPendingError {
  error: string;
  code: "PENDING_APPROVAL";
}
