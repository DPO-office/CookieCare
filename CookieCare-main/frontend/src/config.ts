// const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

// export const API_BASE_URL = rawApiBaseUrl.replace(/\/$/, "");

// export const apiUrl = (path: string) => {
//   const normalizedPath = path.startsWith("/") ? path : `/${path}`;
//   return `${API_BASE_URL}${normalizedPath}`;
// };

// Browser ke current workstation URL ko dynamically pick karne ke liye
export const API_BASE_URL = typeof window !== "undefined" ? window.location.origin : "";

export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};