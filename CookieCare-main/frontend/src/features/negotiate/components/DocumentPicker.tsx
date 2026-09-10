import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  FileText,
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  Check,
  Upload,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  BookOpen,
  ChevronDown,
  X,
} from "lucide-react";
import { LegalDocument } from "../../../shared/types";
import { isPlaceholderVaultDocument } from "../../analyze/utils/vaultDocumentFilters";
import {
  fetchDocumentsPaginated,
  uploadEphemeralDocument,
  fetchLibraryItems,
} from "../../vault/api/vaultApi";
import { fetchDocumentDetails } from "../../negotiate/api/negotiateApi";
import { LibraryItem } from "../../vault/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;
const CARD_SHADOW = "0 1px 2px rgba(16,24,40,0.04), 0 0 0 1px rgba(16,24,40,0.06)";
const CARD_SHADOW_SELECTED =
  "0 1px 2px rgba(16,24,40,0.04), 0 0 0 2px rgba(79,91,217,0.22)";

// ─── Types ────────────────────────────────────────────────────────────────────

type Source = "upload" | "draft";

interface SourceTab {
  id: Source;
  label: string;
}

const SOURCES: SourceTab[] = [
  { id: "upload", label: "Uploaded Documents" },
  { id: "draft",  label: "Saved Drafts" },
];

/** The full session object passed to the parent when user confirms. */
export interface NegotiationSession {
  doc: LegalDocument;
  selectedPlaybookId: string | null;
  selectedPlaybookName: string | null;
}

interface DocumentPickerProps {
  /** JWT auth token */
  authToken: string;
  onConfirm: (session: NegotiationSession) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(iso: string | undefined | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 60) return "1mo ago";
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  } catch {
    return "";
  }
}

function displayTitle(title: string): string {
  const cleaned = title
    .replace(/[_-]+/g, " ")
    .replace(/\.(pdf|docx?)$/i, "")
    .trim();
  if (cleaned === cleaned.toUpperCase()) {
    return cleaned.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return cleaned;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}

function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = page * pageSize + 1;
  const to   = Math.min(total, (page + 1) * pageSize);

  const pages: (number | "…")[] = [];
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <p className="m-0 text-[11.5px] text-[#98A2B3]">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-white text-[#667085] transition hover:bg-[#EEF2FF] hover:text-[#4F5BD9] disabled:cursor-not-allowed disabled:opacity-30"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {pages.map((p, idx) =>
          p === "…" ? (
            <span key={`ell-${idx}`} className="select-none px-1 text-[12px] text-[#C0C9D4]">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p as number)}
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none text-[12px] font-medium transition ${
                p === page
                  ? "bg-[#4F5BD9] text-white"
                  : "bg-white text-[#667085] hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
              }`}
              style={{ boxShadow: p === page ? "none" : CARD_SHADOW }}
            >
              {(p as number) + 1}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages - 1}
          aria-label="Next page"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-white text-[#667085] transition hover:bg-[#EEF2FF] hover:text-[#4F5BD9] disabled:cursor-not-allowed disabled:opacity-30"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i}>
          <div
            className="flex animate-pulse items-center gap-3.5 rounded-[22px] bg-white px-4 py-3.5"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-[#F2F4F7]" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded-full bg-[#F2F4F7]" />
              <div className="h-3 w-1/3 rounded-full bg-[#F2F4F7]" />
            </div>
            <div className="h-5 w-16 rounded-full bg-[#F2F4F7]" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Playbook button + popover (portal-based so it escapes overflow:hidden) ───

interface PlaybookDropdownProps {
  authToken: string;
  selected: { id: string; name: string } | null;
  onSelect: (item: { id: string; name: string } | null) => void;
}

function PlaybookDropdown({ authToken, selected, onSelect }: PlaybookDropdownProps) {
  const [open, setOpen]             = useState(false);
  const [items, setItems]           = useState<LibraryItem[]>([]);
  const [loading, setLoading]       = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const popoverRef  = useRef<HTMLDivElement>(null);

  // Fetch AI Rulebooks on open — same source/filter as Vault AI Rulebook tab
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(false);
    fetchLibraryItems(authToken)
      .then((data: any[]) => {
        if (cancelled) return;
        setItems(data.filter((i) => i.type === "rulebook") as LibraryItem[]);
      })
      .catch(() => { if (!cancelled) setFetchError(true); setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, authToken]);

  // Measure trigger position so the portal popover aligns correctly
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      if (triggerRef.current) setPopoverRect(triggerRef.current.getBoundingClientRect());
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        popoverRef.current  && !popoverRef.current.contains(t)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const popoverContent = open && popoverRect ? createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: popoverRect.bottom + 6,
        left: popoverRect.left,
        width: Math.max(popoverRect.width, 260),
        zIndex: 9999,
        borderRadius: 16,
        background: "#fff",
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(16,24,40,0.14), 0 0 0 1px rgba(16,24,40,0.07)",
      }}
    >
      {/* "No playbook" row */}
      <button
        type="button"
        onClick={() => { onSelect(null); setOpen(false); }}
        className={`flex w-full cursor-pointer items-center gap-2.5 border-none border-b border-[#F2F4F7] px-4 py-3 text-left text-[12.5px] transition ${
          !selected ? "bg-[#EEF2FF] font-medium text-[#4F5BD9]" : "bg-transparent text-[#667085] hover:bg-[#F7F8FB]"
        }`}
      >
        {!selected
          ? <Check className="h-3.5 w-3.5 shrink-0 text-[#4F5BD9]" />
          : <span className="h-3.5 w-3.5 shrink-0" />
        }
        No playbook
      </button>

      <div className="max-h-[220px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-[#667085]">
            <Loader2 className="h-4 w-4 animate-spin text-[#4F5BD9]" />
            Loading…
          </div>
        ) : fetchError ? (
          <p className="px-4 py-4 text-center text-[12px] text-[#DC2626]">
            Failed to load rulebooks.
          </p>
        ) : items.length === 0 ? (
          <div className="px-4 py-4 text-center">
            <p className="m-0 text-[12px] font-medium text-[#1a1a1a]">No AI Rulebooks found</p>
            <p className="m-0 mt-0.5 text-[11px] text-[#98A2B3]">Add one via Vault → AI Rulebook.</p>
          </div>
        ) : (
          items.map((item) => {
            const isActive = selected?.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { onSelect({ id: item.id, name: item.name }); setOpen(false); }}
                className={`flex w-full cursor-pointer items-start gap-2.5 border-none border-b border-[#F2F4F7] px-4 py-2.5 text-left transition last:border-none ${
                  isActive ? "bg-[#EEF2FF]" : "bg-transparent hover:bg-[#F7F8FB]"
                }`}
              >
                {isActive
                  ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4F5BD9]" />
                  : <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4F5BD9] opacity-50" />
                }
                <div className="min-w-0">
                  <p className={`m-0 truncate text-[12px] font-medium ${isActive ? "text-[#4F5BD9]" : "text-[#1a1a1a]"}`}>
                    {item.name}
                  </p>
                  {item.description && item.description !== "-" && (
                    <p className="m-0 mt-0.5 truncate text-[10.5px] text-[#98A2B3]">
                      {item.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  ) : null;

  // Compact trigger button — selected state shows name + clear ×
  return (
    <>
      {selected ? (
        <div className="inline-flex h-9 items-center gap-0 rounded-full bg-[#EEF2FF] pl-3 pr-1 text-[12.5px] font-medium text-[#4F5BD9]" style={{ boxShadow: CARD_SHADOW }}>
          <BookOpen className="mr-1.5 h-3.5 w-3.5 shrink-0" />
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="max-w-[160px] truncate border-none bg-transparent cursor-pointer p-0 text-[12.5px] font-medium text-[#4F5BD9] hover:text-[#3a46b0]"
            title={selected.name}
          >
            {selected.name}
          </button>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-1.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[#4F5BD9] transition hover:bg-[#C7D0F8] p-0"
            title="Remove playbook"
            aria-label="Remove playbook"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-[#C7D0F8] bg-white px-3.5 text-[12.5px] font-medium text-[#667085] transition hover:border-[#4F5BD9] hover:bg-[#EEF2FF] hover:text-[#4F5BD9]"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#4F5BD9] opacity-70" />
          Playbook
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#98A2B3] transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {popoverContent}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocumentPicker({ authToken, onConfirm }: DocumentPickerProps) {
  // ── Document list state ───────────────────────────────────────────────────
  const [source, setSource]             = useState<Source>("upload");
  const [search, setSearch]             = useState("");
  const [debouncedSearch, setDebounced] = useState("");
  const [page, setPage]                 = useState(0);
  const [docs, setDocs]                 = useState<any[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc]   = useState<any | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState<string | null>(null);

  // ── Playbook state ────────────────────────────────────────────────────────
  const [selectedPlaybook, setSelectedPlaybook] = useState<{ id: string; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Search debounce ────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Reset on source switch
  useEffect(() => {
    setPage(0);
    setSelectedDoc(null);
    setSearch("");
    setDebounced("");
    setError(null);
  }, [source]);

  // Clear selection when page changes
  useEffect(() => { setSelectedDoc(null); }, [page]);

  // ── Fetch document page ────────────────────────────────────────────────────
  const loadPage = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDocumentsPaginated(authToken, {
        type:   source,           // "upload" | "draft" — exact Vault filter
        search: debouncedSearch.trim() || undefined,
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });

      // Strip placeholder/ephemeral records (belt-and-suspenders, backend already
      // excludes ephemeral_upload but guard against legacy data)
      const valid = (result.data as any[]).filter(
        (d) => !isPlaceholderVaultDocument(d) && d.type !== "ephemeral_upload"
      );

      setDocs(valid);
      setTotal(result.pagination.total);
    } catch (err: any) {
      setError(err.message ?? "Failed to load documents.");
      setDocs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [authToken, source, debouncedSearch, page]);

  useEffect(() => { loadPage(); }, [loadPage]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    setUploadError(null);
    try {
      // Upload as ephemeral — session-only, never persisted to Vault.
      // The backend stores type='ephemeral_upload' with no folder_id, so the
      // file is excluded from all Vault lists (getDocuments filters it out).
      // We poll for content readiness (the file_processing job populates
      // files.content asynchronously) then call onConfirm directly —
      // bypassing the picker list entirely.
      const { fileId } = await uploadEphemeralDocument(authToken, file);

      // Poll until content is populated (file_processing job) or timeout.
      // Interval: 1.5 s, max wait: 30 s (20 attempts).
      const POLL_INTERVAL_MS = 1500;
      const MAX_ATTEMPTS = 20;
      let doc: any = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        doc = await fetchDocumentDetails(authToken, fileId);
        if (doc && doc.content && doc.content.trim().length > 0) break;
        // Content not ready yet — wait and retry.
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      if (!doc) throw new Error("Failed to load the uploaded document.");

      // Confirm with the ephemeral doc (content may be empty for very large
      // files still processing — Negotiate will show the evaluation overlay).
      onConfirm({
        doc: doc as LegalDocument,
        selectedPlaybookId: selectedPlaybook?.id ?? null,
        selectedPlaybookName: selectedPlaybook?.name ?? null,
      });
    } catch (err: any) {
      setUploadError(err.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!selectedDoc) return;
    onConfirm({
      doc: selectedDoc as LegalDocument,
      selectedPlaybookId: selectedPlaybook?.id ?? null,
      selectedPlaybookName: selectedPlaybook?.name ?? null,
    });
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  const activeSource = SOURCES.find((s) => s.id === source)!;

  return (
    <div className="dpa-results-bg flex min-h-0 flex-1 flex-col overflow-hidden font-sans">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-3xl">

          {/* ── Header ── */}
          <header className="mb-8">
            <p className="m-0 mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-[#98A2B3]">
              Legal Space · Negotiate
            </p>
            <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
              Open negotiation
            </h1>
            <p className="m-0 mt-2 max-w-xl text-[14px] leading-relaxed text-[#667085]">
              Select the document you want to negotiate and, optionally, a playbook to guide the AI strategy.
            </p>
          </header>

          {/* ════════════════════════════════════════════════════════════════
               SECTION 1 — Document selection
          ════════════════════════════════════════════════════════════════ */}
          <div
            className="overflow-hidden rounded-[24px] bg-white"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <div className="border-b border-[#F4F4F5] px-5 py-4">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98A2B3]">
                Select document
              </p>
            </div>

            <div className="px-5 py-4">
              {/* Source tabs + Upload + Playbook */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                {/* Left: source tabs */}
                <div
                  className="flex items-center gap-0.5 rounded-full bg-[#F7F8FB] p-1"
                  style={{ boxShadow: CARD_SHADOW }}
                >
                  {SOURCES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSource(s.id)}
                      className={`cursor-pointer rounded-full border-none px-4 py-1.5 text-[13px] font-medium transition-all ${
                        source === s.id
                          ? "bg-white text-[#1a1a1a]"
                          : "bg-transparent text-[#667085] hover:text-[#1a1a1a]"
                      }`}
                      style={source === s.id ? { boxShadow: CARD_SHADOW } : undefined}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Right: playbook + upload */}
                <div className="flex items-center gap-2 flex-wrap">
                  <PlaybookDropdown
                    authToken={authToken}
                    selected={selectedPlaybook}
                    onSelect={setSelectedPlaybook}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border-none bg-[#EEF2FF] px-4 text-[13px] font-medium text-[#4F5BD9] transition hover:bg-[#e4e9ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Upload error */}
              {uploadError && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[14px] bg-[#FEF2F2] px-4 py-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#DC2626]" />
                  <p className="m-0 text-[13px] leading-snug text-[#DC2626]">{uploadError}</p>
                </div>
              )}

              {/* Search */}
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  type="text"
                  placeholder={`Search ${activeSource.label.toLowerCase()}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-full border-none bg-[#F7F8FB] pl-11 pr-4 text-[13px] text-[#1a1a1a] outline-none placeholder:text-[#98A2B3] focus:shadow-[0_0_0_3px_rgba(79,91,217,0.14)]"
                />
              </div>

              {/* Results count */}
              {!loading && !error && total > 0 && (
                <p className="mb-3 mt-0 text-[11.5px] text-[#98A2B3]">
                  {debouncedSearch.trim()
                    ? `${docs.length} result${docs.length !== 1 ? "s" : ""} for "${debouncedSearch}"`
                    : `${total} ${activeSource.label.toLowerCase()}`}
                </p>
              )}

              {/* Loading */}
              {loading && <SkeletonList />}

              {/* Fetch error */}
              {!loading && error && (
                <div
                  className="flex flex-col items-center gap-3 rounded-[18px] bg-[#FEF9F0] px-5 py-10 text-center"
                >
                  <AlertCircle className="h-7 w-7 text-[#F97316]" strokeWidth={1.5} />
                  <p className="m-0 text-[13px] font-semibold text-[#1a1a1a]">Failed to load documents</p>
                  <p className="m-0 text-[12px] text-[#667085]">{error}</p>
                  <button
                    type="button"
                    onClick={loadPage}
                    className="mt-1 inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border-none bg-[#EEF2FF] px-4 text-[13px] font-medium text-[#4F5BD9] transition hover:bg-[#e4e9ff]"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!loading && !error && docs.length === 0 && (
                <div className="flex flex-col items-center rounded-[18px] bg-[#F7F8FB] px-5 py-10 text-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F5BD9]">
                    {source === "upload" ? (
                      <FolderOpen className="h-5 w-5" strokeWidth={1.75} />
                    ) : (
                      <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} />
                    )}
                  </div>
                  <p className="m-0 text-[13px] font-semibold text-[#1a1a1a]">
                    {debouncedSearch.trim()
                      ? "No documents match your search"
                      : source === "upload"
                      ? "No uploaded documents yet"
                      : "No saved drafts yet"}
                  </p>
                  <p className="m-0 mt-1.5 max-w-[240px] text-[12px] leading-relaxed text-[#667085]">
                    {debouncedSearch.trim()
                      ? "Try a different search term."
                      : source === "upload"
                      ? "Upload a contract PDF or DOCX to get started."
                      : "Save a draft from the Draft workspace first."}
                  </p>
                </div>
              )}

              {/* Document list */}
              {!loading && !error && docs.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {docs.map((doc: any) => {
                    const isSelected = selectedDoc?.id === doc.id;
                    const isDraft    = doc.type === "draft";
                    const dateLabel  = relativeDate(doc.updated_at ?? doc.updatedAt ?? doc.created_at);
                    return (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedDoc(isSelected ? null : doc)}
                          className="group flex w-full cursor-pointer items-center gap-3 rounded-[18px] bg-white px-4 py-3 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-px"
                          style={{ boxShadow: isSelected ? CARD_SHADOW_SELECTED : CARD_SHADOW }}
                        >
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                              isSelected ? "bg-[#4F5BD9] text-white" : "bg-[#EEF2FF] text-[#4F5BD9]"
                            }`}
                          >
                            {isSelected ? (
                              <Check className="h-4 w-4" strokeWidth={2.25} />
                            ) : isDraft ? (
                              <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} />
                            ) : (
                              <FileText className="h-4 w-4" strokeWidth={1.75} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="m-0 truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
                              {displayTitle(doc.title)}
                            </p>
                            {dateLabel && (
                              <p className="m-0 mt-0.5 text-[11.5px] text-[#98A2B3]">{dateLabel}</p>
                            )}
                          </div>
                          <span
                            className={`score-badge shrink-0 text-[10px] font-medium ${
                              isDraft ? "bg-[#EEF2FF] text-[#4F5BD9]" : "bg-[#F7F8FB] text-[#667085]"
                            }`}
                          >
                            {isDraft ? "Draft" : "Uploaded"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Pagination */}
              {!loading && !error && (
                <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
              )}
            </div>

            {/* ── Footer CTA inside the card ── */}
            <div className="border-t border-[#F4F4F5] px-5 py-4">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!selectedDoc}
                className={`inline-flex w-full h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-none text-[13.5px] font-semibold transition-opacity disabled:cursor-not-allowed ${
                  selectedDoc
                    ? "primary-gradient text-white hover:opacity-90"
                    : "bg-[#F2F4F7] text-[#C0C9D4]"
                }`}
              >
                Open Negotiation
                <ChevronRight className="h-4 w-4" />
              </button>
              {!selectedDoc && (
                <p className="m-0 mt-2 text-center text-[11.5px] text-[#98A2B3]">
                  Select a document to continue
                </p>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
