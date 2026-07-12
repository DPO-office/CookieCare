import { apiUrl } from "../../../config";
import { CookieScanResult } from "../../../shared/types";
import { ScanDepth } from "../types";

export async function startCookieScan(
  authToken: string,
  url: string,
  scanDepth: ScanDepth
): Promise<{ status: number; data: any }> {
  const res = await fetch(apiUrl("/api/vulnerabilities/scan-cookie"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ url, scanDepth }),
  });
  const data = await res.json();
  return { status: res.status, data: res.ok ? data : Promise.reject(new Error(data.error || "Scan failed")) };
}

export async function pollJobStatus(
  authToken: string,
  jobId: string
): Promise<{ status: string; result?: CookieScanResult; error?: string }> {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error("Failed to poll job");
  return res.json();
}

export async function shareReportByEmail(
  authToken: string,
  payload: {
    recipientEmail: string;
    subject: string;
    reportTitle: string;
    contentType: string;
    content: string;
    format: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(apiUrl("/api/reports/share-email"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { ok: res.ok, error: data.error };
}

export async function exportReport(
  authToken: string,
  payload: { title: string; contentType: string; content: string; format: string }
): Promise<Blob | null> {
  const res = await fetch(apiUrl("/api/documents/export"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return res.blob();
}
