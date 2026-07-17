# Ask AI Lawyer Fix Plan

## Goal
Stabilize the Ask AI Lawyer experience for MVP by:
- fixing the `+` context menu and its nested popovers
- ensuring jurisdiction and output format popover close buttons work
- removing non-essential Web Discovery UI from MVP
- preserving secure vault document selection for question grounding
- hardening backend prompt generation, token use, and output sanitation

---

## 1. UI Fixes

### 1.1 `+` button and nested popover flow
Files:
- `frontend/src/features/askAILawyer/components/ComposerBar.tsx`
- `frontend/src/features/askAILawyer/components/Popovers.tsx`
- `frontend/src/features/askAILawyer/hooks/useAskAILawyer.ts`

Actions:
- Keep the plus button as the entrypoint for popover navigation, but simplify state handling so `openPopover` is the single source of truth.
- Ensure `togglePopover("add")` and nested actions properly open the next panel.
- Remove `Web Discovery` from the add-menu options for MVP; comment it out so it can be restored later if needed.
- Ensure the `button` close controls inside `jurisdictions` and `format` popovers call `setOpenPopover(null)` and that this state change is not canceled by outside-click logic.

### 1.2 Popover outside-click behavior
Files:
- `frontend/src/features/askAILawyer/hooks/useAskAILawyer.ts`
- `frontend/src/features/askAILawyer/components/Popovers.tsx`

Actions:
- Confirm the outside-click listener uses a robust containment check for both composer and popover DOM nodes.
- If necessary, change the event listener from `mousedown` to `pointerdown` or adjust the containment logic so internal button clicks do not count as outside clicks.
- Ensure `popoverRef` correctly references the actual rendered popover container.

### 1.3 Jurisdictions popover
Files:
- `frontend/src/features/askAILawyer/components/Popovers.tsx`

Actions:
- Maintain the current multi-select jurisdiction list.
- Keep the close `X` button visible and enabled.
- If the popover closes unexpectedly, make the close button independent of the selection button logic.
- Add an explicit `Clear all` control to remove all jurisdictions.

### 1.4 Output format popover and IRAC option
Files:
- `frontend/src/features/askAILawyer/components/Popovers.tsx`
- `frontend/src/features/askAILawyer/types.ts`

Actions:
- Keep `Full IRAC` as the default output format for MVP, because backend supports it.
- Ensure the popover close `X` works and that selecting a format updates state immediately.
- Keep `Brief Summary` and `CREAC` as available options if they already work, but prioritize `Full IRAC` for legal precision.

### 1.5 Vault / KB document selection
Files:
- `frontend/src/features/askAILawyer/components/Popovers.tsx`
- `frontend/src/features/askAILawyer/hooks/useAskAILawyer.ts`
- `frontend/src/features/askAILawyer/api/askAILawyerApi.ts`

Actions:
- Preserve folder/document selection state by keeping `KBFolder.isSelected` and selected file IDs.
- In the KB popover, make document selection explicit and clearly show counts for selected docs/folders.
- Ensure `askLawyer` sends selected document IDs to the backend and that the backend uses them as grounding context.
- Keep vault functionality working at any cost by making selected docs the primary context source.

---

## 2. Backend Fixes

### 2.1 API contract and job payload
Files:
- `backend/src/routes/lawyer.ts`
- `backend/src/services/jobQueue.ts`
- `backend/src/agents/legalAgent.ts`

Actions:
- Keep `documentIds` as the canonical document input field.
- Accept `jurisdiction`, `outputFormat`, and `documentIds` in `/api/lawyer/ask`.
- Pass these fields into the job payload so the legal ask job can use them when retrieving and grounding content.
- Remove or comment out any `webContext` usage in the new MVP flow.

### 2.2 Strict prompt engineering and token layout
Files:
- `backend/src/agents/askLawyerAgent.ts`
- `backend/src/agents/legalAgent.ts`
- `backend/src/modules/drafting/llm/index.ts` or provider config

Actions:
- Use a top-heavy prompt layout: static system instructions first, followed by retrieved document context, then the user query last.
- Keep the system prompt explicit:
  - restrict reasoning to selected jurisdictions and provided document text
  - prohibit open-web knowledge/hallucinated precedent
  - require IRAC headings if `Full IRAC` is selected
- If IRAC is enabled, enforce four markdown headings: `ISSUE`, `RULE`, `APPLICATION`, `CONCLUSION`.
- Prefer `Full IRAC` and do not introduce additional complexity unless backend already handles format options naturally.

### 2.3 Temperature and deterministic completion
Files:
- `backend/src/agents/askLawyerAgent.ts`
- `backend/src/modules/drafting/config/model-specs.ts`
- `backend/src/modules/drafting/llm/provider/*`

Actions:
- Set the LLM call temperature exactly to `0.0` for Ask AI Lawyer tasks.
- If the agent uses a generic execution path, override the model configuration for this path.
- Avoid creative variation for legal logic.

### 2.4 Output sanitation and failure handling
Files:
- `backend/src/agents/askLawyerAgent.ts`
- `backend/src/services/jobQueue.ts`

Actions:
- Strip markdown code fences and wrapper pollution from the final returned text before saving or streaming it.
  - Example: remove leading/trailing ```` ```markdown ```` or ```` ``` ````.
- Preserve the final sanitized string in job result state.
- On network timeout, LLM error, or parse failure, capture the error in advisory state instead of crashing.
  - Return an error payload that the frontend can display gracefully via `lawyerError`.
- Keep the main UI intact and allow retrying.

### 2.5 State tracking schema
Files:
- Potential backend job state storage or response schema (no obvious existing state store)

Actions:
- Record session metadata in the job/log payload:
  - user query text
  - active jurisdictions array
  - selected document IDs / folder IDs
  - chosen output format
- Store grounding context inside the job execution payload for traceability.
- Store output payload details:
  - raw LLM text
  - sanitized render text
  - runtime metadata: timestamps, durations, status
- This can be implemented as enriched job result fields or additional log records.

---

## 3. Minimal MVP adjustments

### Remove non-essential Web Discovery
Files:
- `frontend/src/features/askAILawyer/api/askAILawyerApi.ts`
- `frontend/src/features/askAILawyer/hooks/useAskAILawyer.ts`
- `frontend/src/features/askAILawyer/components/Popovers.tsx`
- `frontend/src/features/askAILawyer/types.ts`
- `backend/src/routes/lawyer.ts`

Actions:
- Comment out Web Discovery UI and logic in the frontend.
- Remove or ignore `webContext` from the frontend body payload.
- Keep the code paths in place for later restoration, but do not surface the feature for the MVP.

### Keep vault and document grounding working
- Ensure vault selection is the primary source of document context.
- Do not rely on web discovery for the MVP; use secure internal document grounding only.

---

## 4. Implementation timeline

1. Update frontend state and popover handling for Ask AI Lawyer.
2. Comment out Web Discovery UI and API flows.
3. Verify vault selection is passed through `askLawyer` and used by backend.
4. Harden the backend `AskLawyerAgent` prompt and temperature configuration.
5. Add output sanitation and graceful error handling.
6. Test the full flow end-to-end on a sample legal query.

---

## 5. Notes

- The most critical path is the vault-backed document context plus `Full IRAC` output.
- Web Discovery is explicitly deprioritized and should be delivered as commented-out/disabled UI for the MVP.
- The frontend should not crash if a popover close action fails; instead, the open state should simply close cleanly.
- If the backend cannot safely support `CREAC` as a second output format, keep only `Full IRAC` and `Brief Summary` for now.

---

## 6. Files most likely to change
- `frontend/src/features/askAILawyer/components/ComposerBar.tsx`
- `frontend/src/features/askAILawyer/components/Popovers.tsx`
- `frontend/src/features/askAILawyer/hooks/useAskAILawyer.ts`
- `frontend/src/features/askAILawyer/api/askAILawyerApi.ts`
- `frontend/src/features/askAILawyer/types.ts`
- `backend/src/routes/lawyer.ts`
- `backend/src/agents/legalAgent.ts`
- `backend/src/agents/askLawyerAgent.ts`
- `backend/src/modules/drafting/config/model-specs.ts` (if needed)
- `backend/src/services/jobQueue.ts` (error / state capture)
