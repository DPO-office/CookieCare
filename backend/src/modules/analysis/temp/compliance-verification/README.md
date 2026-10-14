# Verification diagnostic files

Opt in locally with `ANALYSIS_DUMP_COMPLIANCE_VERIFICATION=1` and restart the backend. Set it to `0` to disable. This observer never changes legal decisions, retry policy, or time budgets. It records the canonical or shadow verification path; legacy comparisons keep their existing logs.

## Files

Default verification is now `legacy`. Its assessment and lock details remain in
the session `.compliance.log`; read `handedToReporting.rows` in the pre-report dump
for its actual outcomes. An empty `proposedOutcomes` array means the archived engine
did not run. The execution policy explicitly records the active engine and whether
multi-pass retries/review are enabled. Detailed raw-response traces below primarily
describe the archived `canonical`/`shadow` engine; absence of those files in legacy
mode is not a failed verification.

```text
out/
  latest.json                         newest run pointer, not results
  <session-safe-id>/<unique-run-id>/
    manifest.json                     expected check IDs, rule/document versions
    summary.json                      statuses, stopping gates, failures, active calls
    events.jsonl                      chronological index of payload files
    run/<sequence>-<event>.json        execution policy and reconciliation
    checks/<check-safe-id>/
      <sequence>-<event>.json          request, prompt, response, validation, review, lock
```

IDs remain verbatim inside files; safe hashed path components prevent collisions and path traversal. Each new run retains earlier runs. `latest.json` identifies the most recently started run. Sequence numbers distinguish concurrent workers and repeated attempts. Files are written as events arrive; an interrupted run retains its trace and active-call list rather than pretending to be complete.

## Reading a failure

1. Open `out/latest.json`, then its `summaryPath`.
2. Find the rule in `checks`. `gate` names the actual first assessment branch that stopped it, with supporting metadata. This explains current policy; it is not a new legal judgment.
3. Follow a validation failure's `file` for exact errors. The same check folder contains the preceding `attempt.response` with the raw parsed model output, and `attempt.started` with the actual prompt/schema and repair errors supplied to the model.
4. `review.comparison` retains both validated decisions and field-by-field differences in the exact projection compared. `review.unavailable` retains the second review's failure, not just a generic label.
5. `compliance.lock.audit` preserves the pre-lock verification result (including errors and attempts), lock validation failures, and the shared assessment gate. `compliance.verify.outcome` records the final status.
6. Additional-investigation events retain queries, bundle versions, elapsed time and stop reasons. `request` files hold frozen legal baselines, full selected evidence, offsets and instruction context for targeted replay without rerunning investigation.

The raw response is the value returned by the existing JSON completion client, not an HTTP transcript. If that client throws before returning a parsed response, only its error is available. Old runs cannot retroactively acquire missing raw outputs. A request with no response file and still listed as active has not produced an observable completion.

## Privacy and operational behavior

These files contain confidential contract passages, instructions and model responses. The output folder is ignored by Git. No environment dump or provider request headers are collected. Review diagnostics before sharing. Files use restrictive creation modes where supported; Windows access follows workspace ACLs. Retention is manual: this infrastructure does not delete existing diagnostics or export them anywhere.

The writer is best effort and synchronous so traces survive an interrupted run. Disk failures are exposed in `verificationDiagnostics.writeErrors` in the pre-report dump and in the normal compliance log; they do not change outcomes. Enabled tracing adds local I/O overhead and should not be used for production latency measurements. The regular compliance log receives compact references to detailed files, not just terminal messages.

Model queue events distinguish time waiting for a permit from actual processing time. The shared queue bounds initial investigation, verification, and additional investigation together. Use these events to compare live runs; a passing mocked test is not a latency measurement.

Transient Windows sharing violations while replacing `summary.json` trigger bounded asynchronous retries. Already-written event payloads and their index remain available if a summary update fails.

Run `npm run test:compliance` from `backend/` with `ANALYSIS_DUMP_COMPLIANCE_VERIFICATION=0` and `ANALYSIS_DUMP_COMPLIANCE_PRE_REPORT=0` to preserve pointers to real runs. Node test workers also disable default verification tracing and pre-report dumping, including when `.env` enables them. Diagnostic tests explicitly opt in using isolated temporary directories. Test commands outside the Node test runner should still set the flags explicitly.
