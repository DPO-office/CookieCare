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
