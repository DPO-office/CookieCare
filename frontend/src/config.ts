export const API_BASE_URL = typeof window !== "undefined" ? window.location.origin : "";

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
