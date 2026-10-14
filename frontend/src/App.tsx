/**
 * App.tsx — Gutted shell.
 *
 * All routing, auth, and layout logic has moved to:
 *   src/main.tsx          → AppProvider + RouterProvider
 *   src/router/index.tsx  → route tree
 *   src/router/AppLayout.tsx → persistent sidebar shell
 *   src/contexts/AppContext.tsx → global state
 *
 * This file is kept only so legacy imports don't break during the transition.
 * It is no longer rendered directly — main.tsx uses RouterProvider instead.
 */
export default function App() {
  return null;
}
