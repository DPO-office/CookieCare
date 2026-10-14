import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiUrl } from "../../config";
import { useAppContext } from "../../contexts/AppContext";

type Artifact = { id: string };
type Preparation = { id: string; status: string; result: null | {
  preparationStatus?: string; mapArtifact?: Artifact; reconstructionArtifact?: Artifact | null;
  referencesArtifact?: Artifact; validationArtifact?: Artifact;
} };
type Provision = { id: string; revision: number; kind: string; original_label: string | null;
  text: string; content_hash: string; reconstruction_status: string;
  latest_review: { decision: string; reason: string } | null };
type Bundle = { sourceVersionId: string; pdfUrl: string;
  preparation: Preparation | null; provisions: Provision[];
  structureRuns: Array<{ id: string; provider: string; model: string; durationMs: number;
    replayedFromJobId: string | null; createdAt: string }> };
type Draft = { provisions: Array<{ id: string; kind: string; label: string | null;
  text: string; sourceSpans: Array<{ physicalPage: number | null }> }>;
  relationships: Array<{ exactMention: string; status: string }>;
  warnings: string[] };
type SourceMap = { warnings: string[]; pages: Array<{ physicalPage: number; status: string }> };
type Validation = { status: string; issues: Array<{ code: string; detail: string }> };

export default function ReviewPage() {
  const { sourceId, versionId } = useParams();
  const { authToken } = useAppContext();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sourceMap, setSourceMap] = useState<SourceMap | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [correctedKinds, setCorrectedKinds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queuedJobId, setQueuedJobId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!authToken || !sourceId || !versionId) return;
    const headers = { Authorization: `Bearer ${authToken}` };
    const response = await fetch(apiUrl(`/api/knowledge-base/sources/${encodeURIComponent(sourceId)}/versions/${encodeURIComponent(versionId)}/review-bundle`),
      { headers, signal });
    if (!response.ok) throw new Error("Could not load the review bundle");
    const next = await response.json() as Bundle;
    setBundle(next);
    const result = next.preparation?.result;
    const artifact = async <T,>(ref: Artifact | null | undefined): Promise<T | null> => {
      if (!ref || !next.preparation) return null;
      const fetched = await fetch(apiUrl(`/api/knowledge-base/jobs/${encodeURIComponent(next.preparation.id)}/artifacts/${encodeURIComponent(ref.id)}`),
        { headers, signal });
      if (!fetched.ok) throw new Error("Could not load an extraction artifact");
      return fetched.json() as Promise<T>;
    };
    const [mapped, reconstructed, checked] = await Promise.all([
      artifact<SourceMap>(result?.mapArtifact), artifact<Draft>(result?.reconstructionArtifact),
      artifact<Validation>(result?.validationArtifact),
    ]);
    setSourceMap(mapped);
    setDraft(reconstructed);
    setValidation(checked);
  }, [authToken, sourceId, versionId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Review failed");
    });
    return () => controller.abort();
  }, [load]);

  async function submit(provision: Provision, decision: "approve" | "reject" | "request_changes") {
    if (!reason.trim() || !authToken) { setError("Add a reason for this decision"); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(apiUrl("/api/knowledge-base/reviews"), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ targetKind: "provision", targetId: provision.id,
          revision: provision.revision, revisionHash: provision.content_hash, decision, reason }),
      });
      if (!response.ok) throw new Error("Review decision was not saved");
      setReason("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Review failed"); }
    finally { setBusy(false); }
  }

  async function correctKind(provision: Provision) {
    if (!reason.trim() || !authToken) { setError("Add a reason for this correction"); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch(apiUrl(`/api/knowledge-base/provisions/${encodeURIComponent(provision.id)}/correct-kind`), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ basedOnRevision: provision.revision, expectedHash: provision.content_hash,
          kind: correctedKinds[provision.id] ?? provision.kind, reason }),
      });
      if (!response.ok) throw new Error("Classification correction was not saved");
      setReason(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Correction failed"); }
    finally { setBusy(false); }
  }

  async function replayStructure() {
    if (!authToken || !sourceId || !versionId) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(apiUrl(`/api/knowledge-base/sources/${encodeURIComponent(sourceId)}/versions/${encodeURIComponent(versionId)}/structure-runs/replay`), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ provider: "kanon", fromJobId: bundle?.preparation?.id }),
      });
      if (!response.ok) throw new Error("Could not queue structure preparation");
      const result = await response.json() as { jobId: string };
      setQueuedJobId(result.jobId);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Preparation failed"); }
    finally { setBusy(false); }
  }

  if (!sourceId || !versionId) return <p>Source and version are required.</p>;
  return <div className="flex-1 overflow-y-auto bg-slate-50 p-6 text-slate-900">
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Shared legal knowledge base</p>
        <h1 className="mt-1 text-2xl font-semibold">Source review</h1>
        <p className="mt-2 text-sm text-slate-600">Review the PDF, extraction warnings, and exact provision revisions before approval.</p>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!bundle ? <p>Loading source…</p> : <>
        <div className="rounded-lg border bg-white p-4 text-sm">
          Preparation: <strong>{bundle.preparation?.result?.preparationStatus ?? bundle.preparation?.status ?? "not started"}</strong>
          {sourceMap && <span className="ml-3">{sourceMap.pages.length} physical pages</span>}
          {bundle.preparation?.result?.mapArtifact && bundle.preparation.status === "completed" &&
            <button type="button" disabled={busy} onClick={() => void replayStructure()}
              className="ml-3 rounded border px-3 py-1 text-xs hover:bg-slate-100 disabled:opacity-50">
              Replay structure extraction
            </button>}
          {queuedJobId && <p className="mt-2 text-slate-600">Preparation job {queuedJobId} is queued. Refresh this page to see its result.</p>}
        </div>
        {bundle.structureRuns.length > 0 && <section className="rounded-lg border bg-white p-4 text-sm">
          <h2 className="font-semibold">Structure extraction runs</h2>
          <ul className="mt-2 space-y-1 text-slate-600">
            {bundle.structureRuns.map(run => <li key={run.id}>
              {run.provider} · {run.model} · {run.durationMs} ms
              {run.replayedFromJobId ? " · replay" : ""}
            </li>)}
          </ul>
        </section>}
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 font-semibold">Original PDF {selectedPage ? `· page ${selectedPage}` : ""}</h2>
            <iframe title="Original legal PDF" src={`${bundle.pdfUrl}${selectedPage ? `#page=${selectedPage}` : ""}`}
              className="h-[680px] w-full rounded border" />
          </section>
          <div className="space-y-5">
            <section className="rounded-lg border bg-white p-4">
              <h2 className="font-semibold">Extraction warnings</h2>
              {(sourceMap?.warnings.length ?? 0) + (draft?.warnings.length ?? 0) +
                (validation?.issues.length ?? 0) === 0
                ? <p className="mt-2 text-sm text-slate-600">No warnings recorded.</p>
                : <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                  {[...(sourceMap?.warnings ?? []), ...(draft?.warnings ?? []),
                    ...(validation?.issues.map(issue => `${issue.code}: ${issue.detail}`) ?? [])]
                    .map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>}
            </section>
            {draft && <section className="rounded-lg border bg-white p-4">
              <h2 className="font-semibold">Reconstruction candidates</h2>
              <p className="mb-3 text-sm text-slate-600">These candidates are inspectable drafts. Approval is available after a provision revision is saved.</p>
              {draft.provisions.map(provision => <article key={provision.id} className="border-t py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{provision.label ?? provision.kind}</strong>
                  {provision.sourceSpans[0]?.physicalPage && <button type="button" className="text-blue-700 underline"
                    onClick={() => setSelectedPage(provision.sourceSpans[0]!.physicalPage)}>Page {provision.sourceSpans[0].physicalPage}</button>}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{provision.text}</p>
              </article>)}
              {draft.relationships.map((relation, index) => <p key={index} className="mt-2 text-xs text-slate-600">
                {relation.exactMention}: {relation.status}</p>)}
            </section>}
            <section className="rounded-lg border bg-white p-4">
              <h2 className="font-semibold">Saved provision revisions</h2>
              {!bundle.provisions.length && <p className="mt-2 text-sm text-slate-600">No provision revisions are ready for review.</p>}
              {bundle.provisions.map(provision => <article key={provision.id} className="border-t py-4 text-sm">
                <strong>{provision.original_label ?? provision.kind} · revision {provision.revision}</strong>
                <p className="mt-2 whitespace-pre-wrap">{provision.text}</p>
                <p className="mt-2 text-slate-600">Latest decision: {provision.latest_review?.decision ?? "none"}</p>
                <label className="mt-3 block text-xs font-medium">Decision reason
                  <textarea value={reason} onChange={event => setReason(event.target.value)}
                    className="mt-1 w-full rounded border p-2 text-sm" rows={2} /></label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["approve", "reject", "request_changes"] as const).map(decision =>
                    <button key={decision} type="button" disabled={busy} onClick={() => void submit(provision, decision)}
                      className="rounded border px-3 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50">{decision.replace("_", " ")}</button>)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  <label className="text-xs">Correct structural kind
                    <select className="ml-2 rounded border p-1" value={correctedKinds[provision.id] ?? provision.kind}
                      onChange={event => setCorrectedKinds(current => ({ ...current, [provision.id]: event.target.value }))}>
                      {["rule", "schedule", "section", "article", "paragraph", "point", "table", "definition",
                        "recital", "chapter", "annex", "footnote", "illustration", "unknown"].map(kind =>
                        <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={busy} onClick={() => void correctKind(provision)}
                    className="rounded border px-3 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50">Save new revision</button>
                </div>
              </article>)}
            </section>
          </div>
        </div>
      </>}
    </div>
  </div>;
}
