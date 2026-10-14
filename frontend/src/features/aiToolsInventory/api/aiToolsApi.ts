import { apiUrl } from "../../../config";
import type { AiTool, AiToolInput } from "../types";

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchAiTools(authToken: string): Promise<AiTool[]> {
  const res = await fetch(apiUrl("/api/ai-tools"), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createAiTool(authToken: string, payload: AiToolInput): Promise<AiTool> {
  const res = await fetch(apiUrl("/api/ai-tools"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateAiTool(
  authToken: string,
  id: string,
  payload: AiToolInput
): Promise<AiTool> {
  const res = await fetch(apiUrl(`/api/ai-tools/${id}`), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteAiTool(authToken: string, id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/ai-tools/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
}
