import type { ChatMessage } from "../../../randtrustAI/types";

const STORAGE_KEY = "cookiecare_compare_history_v1";
const MAX_ENTRIES = 30;

export interface CompareHistoryEntry {
  id: string;
  title: string;
  sessionId: string | null;
  createdAt: string;
  messages: StoredChatMessage[];
}

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  files?: { name: string; size: number }[];
  compareResult?: ChatMessage["compareResult"];
}

function serializeMessages(messages: ChatMessage[]): StoredChatMessage[] {
  return messages
    .filter((m) => !m.isStreaming)
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content.replace(/\*\*/g, ""),
      timestamp: m.timestamp.toISOString(),
      files: m.files,
      compareResult: m.compareResult,
    }));
}

function deserializeMessages(stored: StoredChatMessage[]): ChatMessage[] {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    files: m.files,
    compareResult: m.compareResult,
  }));
}

function loadEntries(): CompareHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CompareHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: CompareHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function getCompareHistory(): CompareHistoryEntry[] {
  return loadEntries();
}

export function saveCompareToHistory(messages: ChatMessage[]): CompareHistoryEntry | null {
  const compareMsg = messages.find((m) => m.compareResult);
  if (!compareMsg?.compareResult) return null;

  const { originalFileName, revisedFileName, sessionId } = compareMsg.compareResult;
  const title = `${originalFileName} vs ${revisedFileName}`;
  const serialized = serializeMessages(messages);

  const entry: CompareHistoryEntry = {
    id: sessionId ?? `local-${Date.now()}`,
    title,
    sessionId: sessionId ?? null,
    createdAt: new Date().toISOString(),
    messages: serialized,
  };

  const existing = loadEntries().filter((e) => e.id !== entry.id);
  saveEntries([entry, ...existing]);
  return entry;
}

export function restoreCompareHistoryEntry(entry: CompareHistoryEntry): ChatMessage[] {
  return deserializeMessages(entry.messages);
}

export function deleteCompareHistoryEntry(id: string) {
  saveEntries(loadEntries().filter((e) => e.id !== id));
}

export function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
