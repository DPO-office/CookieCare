// ─── RandTrust AI — API service layer ────────────────────────────────────────
// All backend communication for the RandTrust AI feature lives here.
// Components and hooks import from this module — never call fetch directly.

import { apiUrl } from "../../../config";

export async function callDPAReview(authToken: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("document", file);
  const res = await fetch(apiUrl("/api/dpa-review"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  if (!res.ok) throw new Error(`DPA review failed (${res.status})`);
  const data = await res.json();
  return data.result ?? data.review ?? JSON.stringify(data, null, 2);
}

export async function callVendorReview(authToken: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("document", file);
  const res = await fetch(apiUrl("/api/vendor-review"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Vendor review failed (${res.status})`);
  const data = await res.json();
  return data.result ?? data.review ?? JSON.stringify(data, null, 2);
}

export async function callAIEthicsReview(authToken: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("document", file);
  const res = await fetch(apiUrl("/api/ai-ethics"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  if (!res.ok) throw new Error(`AI ethics review failed (${res.status})`);
  const data = await res.json();
  return data.result ?? data.review ?? JSON.stringify(data, null, 2);
}
