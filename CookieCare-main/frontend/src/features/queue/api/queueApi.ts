import { apiUrl } from "../../../config";
import { Job } from "../types";

export async function fetchJobs(token: string): Promise<Job[]> {
  const res = await fetch(apiUrl("/api/jobs"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}
