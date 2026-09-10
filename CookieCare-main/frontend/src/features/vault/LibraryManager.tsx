import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Upload } from "lucide-react";
import { LegalDocument } from "../../shared/types";
import { isPlaceholderVaultDocument } from "../analyze/utils/vaultDocumentFilters";
import { fetchRawDocument } from "./api/vaultApi";
import { TABS_CONFIG } from "./constants";
import { useLibrary } from "./hooks/useLibrary";
import { useLibraryUI } from "./hooks/useLibraryUI";
import { VAULT_STYLES } from "./styles/vaultStyles";
import { useAppContext } from "../../contexts/AppContext";
import { LibraryItemSource } from "./types";

import { SavedDraftsTable } from "./components/SavedDraftsTable";
import { LibraryItemsTable } from "./components/LibraryItemsTable";
import { FolderDetailView } from "./components/FolderDetailView";
import { ItemDetailView } from "./components/ItemDetailView";
import { CreateItemModal } from "./components/CreateItemModal";
import { FileUploadModal } from "./components/FileUploadModal";
import { VaultIngestModal } from "./components/VaultIngestModal";
import { VaultScopeSelector } from "./components/VaultScopeSelector";

interface LibraryProps {
  /** @deprecated Read from AppContext; kept for backward-compat */
  authToken?: string;
  /** @deprecated Read from AppContext; kept for backward-compat */
  onRefresh?: () => void;
  /** @deprecated Navigation handled internally via useNavigate */
  onOpenInDraftEditor?: (doc: LegalDocument) => void;
}

export default function LibraryManager(_props: LibraryProps = {}) {
  const { authToken: ctxToken, fetchDocuments, setOpenDraftId } = useAppContext();
  const authToken = ctxToken ?? "";
  const onRefresh = fetchDocuments;
  const navigate = useNavigate();

  const handleOpenInDraftEditor = (doc: LegalDocument) => {
    setOpenDraftId(doc.id);
    navigate("/drafting");
  };

  const {
    items,
    savedDrafts,
    copiedId,
    uploadStatus,
    setUploadStatus,
    uploadError,
    uploadResultMessage,
    uploadProgressPercent,
    uploadProgressMessage,
    resetUploadProgress,
    pendingVaultFiles,
    vaultBatchError,
    suggestedVaultFolderName,
    addVaultFiles,
    removeVaultFile,
    clearVaultFiles,
    handleCreateUploadFolder,
    handleCopyId,
    handleDeleteItem,
    handleDeleteDraft,
    handleCreateNewItem,
    handleTriggerUpload,
    handleVaultAssetUpload,
    handleDeleteFileFromFolder,
  } = useLibrary(authToken, onRefresh);

  const {
    activeTab,
    searchQuery,
    setSearchQuery,
    savedDraftsSearch,
    setSavedDraftsSearch,
    handleTabChange,
    currentPage,
    setCurrentPage,
    recordsPerPage,
    setRecordsPerPage,
    sortField,
    sortDirection,
    toggleSort,
    isCreateOpen,
    setIsCreateOpen,
    selectedFolder,
    setSelectedFolder,
    viewDetailItem,
    setViewDetailItem,
    isAddFileOpen,
    setIsAddFileOpen,
    isVaultIngestOpen,
    setIsVaultIngestOpen,
    openVaultIngest,
    scopeFilter,
    setScopeFilter,
    vaultContractType,
    setVaultContractType,
    vaultJurisdiction,
    setVaultJurisdiction,
    formName,
    setFormName,
    formDescription,
    setFormDescription,
    formTags,
    setFormTags,
    formDetails,
    setFormDetails,
    formFolderTarget,
    setFormFolderTarget,
    resetCreateForm,
  } = useLibraryUI();

  const activeTabInfo = TABS_CONFIG.find((t) => t.id === activeTab) ?? TABS_CONFIG[0];

  // ── Open document in new tab ──────────────────────────────────────────────
  const [openingId, setOpeningId] = useState<string | null>(null);

  const handleOpenDocument = useCallback(
    async (item: import("./types").LibraryItem, e: React.MouseEvent) => {
      e.stopPropagation();
      if (openingId) return;

      // Extract sourceFileId from item.details
      let sourceFileId: string | null = null;
      try {
        const details =
          typeof item.details === "string" ? JSON.parse(item.details) : item.details;
        sourceFileId = details?.sourceFileId ?? null;
      } catch { /* ignore */ }

      if (!sourceFileId) {
        alert("Source file not available for this item.");
        return;
      }

      setOpeningId(item.id);
      try {
        const result = await fetchRawDocument(authToken, sourceFileId);
        if (!result) {
          alert("Could not load the original file. It may still be processing.");
          return;
        }
        const blob = new Blob([result.buffer], { type: result.mimeType });
        const url  = URL.createObjectURL(blob);
        const tab  = window.open(url, "_blank", "noopener,noreferrer");
        if (tab) {
          // Revoke after the browser has had time to load the blob.
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
      } finally {
        setOpeningId(null);
      }
    },
    [authToken, openingId]
  );
  const isVaultIngestTab =
    activeTab === "rulebook" || activeTab === "templates" || activeTab === "clauses";
  // Tabs that support the private / org scope split.
  const isScopedTab = isVaultIngestTab;

  // Unified item list filtered by tab type + optional scope + search query.
  const filteredTabItems = items.filter((item) => {
    if (item.type !== activeTab) return false;
    // Apply scope filter only on tabs that carry source metadata.
    if (isScopedTab && scopeFilter !== "all" && item.source !== scopeFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.tags.toLowerCase().includes(q) ||
      item.createdBy.toLowerCase().includes(q)
    );
  });

  // Counts for the VaultScopeSelector badges (unaffected by current scope selection).
  const privateCount = isScopedTab
    ? items.filter((i) => i.type === activeTab && i.source === "private").length
    : 0;
  const orgCount = isScopedTab
    ? items.filter((i) => i.type === activeTab && i.source === "org").length
    : 0;

  const sortedItems = [...filteredTabItems].sort((a, b) => {
    let fa: any = a[sortField] ?? "";
    let fb: any = b[sortField] ?? "";
    if (typeof fa === "string") fa = fa.toLowerCase();
    if (typeof fb === "string") fb = fb.toLowerCase();
    if (fa < fb) return sortDirection === "asc" ? -1 : 1;
    if (fa > fb) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / recordsPerPage));

  const filteredDrafts = savedDrafts.filter((d) => {
    if (d.type !== "draft") return false;
    if (isPlaceholderVaultDocument(d)) return false;
    if (!savedDraftsSearch.trim()) return true;
    return (d.title || "").toLowerCase().includes(savedDraftsSearch.toLowerCase());
  });

  const folderItems = items.filter((i) => i.type === "files");

  // onSubmit now receives the scope chosen inside the modal.
  const onCreateSubmit = async (e: React.FormEvent, source: LibraryItemSource) => {
    e.preventDefault();
    const ok = await handleCreateNewItem(activeTab, formName, formDescription, formTags, formDetails, source);
    if (ok) {
      resetCreateForm();
      setIsCreateOpen(false);
    }
  };

  const openFileUpload = (folderId?: string) => {
    clearVaultFiles();
    setUploadStatus("idle");
    setFormFolderTarget(folderId || folderItems[0]?.id || "");
    setIsAddFileOpen(true);
  };

  const closeFileUpload = () => {
    if (uploadStatus === "uploading") return;
    setIsAddFileOpen(false);
    setUploadStatus("idle");
    clearVaultFiles();
  };

  const submitVaultFiles = async () => {
    let targetFolderId = formFolderTarget;
    if (suggestedVaultFolderName) {
      targetFolderId = (await handleCreateUploadFolder(suggestedVaultFolderName)) || "";
      if (!targetFolderId) return;
      setFormFolderTarget(targetFolderId);
    }
    const ok = await handleTriggerUpload(targetFolderId);
    if (ok) setTimeout(closeFileUpload, 1200);
  };

  const closeVaultIngestModal = () => {
    setIsVaultIngestOpen(false);
    setUploadStatus("idle");
    resetUploadProgress();
  };

  // The modal passes the chosen scope as a second argument when a file is selected.
  const handleVaultFileSelect = async (file: File, source: LibraryItemSource) => {
    const ok = await handleVaultAssetUpload({
      tab: activeTab as "rulebook" | "templates" | "clauses",
      file,
      contractType: activeTab === "rulebook" ? undefined : vaultContractType || undefined,
      jurisdiction: activeTab === "rulebook" ? undefined : vaultJurisdiction || undefined,
      source,
    });
    if (ok) setTimeout(closeVaultIngestModal, 2200);
  };

  return (
    <>
      <style>{VAULT_STYLES}</style>
      <div className="vlt dpa-results-bg flex h-full min-h-0 flex-1 flex-col overflow-hidden font-sans">
        <div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-8 sm:px-10">
          <div className="mx-auto w-full max-w-5xl">

            <header className="vlt-rise-1 mb-8">
              <p className="vlt-overline mb-2">Vault repository</p>
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                <div>
                  <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#1a1a1a] sm:text-[34px]">
                    {activeTabInfo.label}
                  </h1>
                  <p className="m-0 mt-2 max-w-[480px] text-[14px] leading-relaxed text-[#667085]">
                    {activeTabInfo.desc}.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {activeTab === "files" && (
                    <button type="button" onClick={() => openFileUpload()} className="vlt-btn-ghost">
                      <Upload style={{ width: 14, height: 14 }} />
                      Add files
                    </button>
                  )}
                  {isVaultIngestTab && (
                    <button type="button" onClick={openVaultIngest} className="vlt-btn-ghost">
                      <Upload style={{ width: 14, height: 14 }} />
                      Upload document
                    </button>
                  )}
                  {activeTab !== "saved-drafts" && (
                    <button type="button" onClick={() => setIsCreateOpen(true)} className="vlt-btn-primary">
                      <Plus style={{ width: 14, height: 14 }} />
                      {activeTabInfo.buttonWord}
                    </button>
                  )}
                </div>
              </div>
            </header>

            <div className="vlt-rise-2 vlt-tabs mb-5 flex gap-1.5 overflow-x-auto pb-1">
              {TABS_CONFIG.map((tab) => {
                const isActive = activeTab === tab.id;
                const count =
                  tab.id === "saved-drafts"
                    ? savedDrafts.filter((d) => d.type === "draft" && !isPlaceholderVaultDocument(d)).length
                    : items.filter((i) => i.type === tab.id).length;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabChange(tab.id)}
                    className={`vlt-tab flex shrink-0 cursor-pointer items-center gap-2 rounded-full ${isActive ? "active" : ""}`}
                    style={{
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? "#FFFFFF" : "#667085",
                    }}
                  >
                    {tab.label}
                    <span
                      style={{
                        padding: "1px 7px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        background: isActive ? "rgba(255,255,255,0.18)" : "#EEF2FF",
                        color: isActive ? "#FFFFFF" : "#4F5BD9",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="vlt-rise-3 vlt-card overflow-hidden flex flex-col">
              <div className="flex flex-col items-start justify-between gap-3 border-b border-[#F4F4F5] px-5 py-4 sm:flex-row sm:items-center">
                <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#1a1a1a]">
                  All {activeTabInfo.label}
                </span>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {isScopedTab && (
                    <VaultScopeSelector
                      scope={scopeFilter}
                      onScopeChange={(s) => {
                        // Clicking the already-active segment resets to "all" (show everything).
                        setScopeFilter((prev) => (prev === s ? "all" : s));
                        setCurrentPage(1);
                      }}
                      privateCount={privateCount}
                      orgCount={orgCount}
                    />
                  )}
                  <div className="relative w-full sm:w-64 flex-shrink-0">
                  <svg
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 14,
                      height: 14,
                      color: "var(--text-faint)",
                      pointerEvents: "none",
                    }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    className="vlt-search"
                    value={activeTab === "saved-drafts" ? savedDraftsSearch : searchQuery}
                    onChange={(e) => {
                      if (activeTab === "saved-drafts") {
                        setSavedDraftsSearch(e.target.value);
                      } else {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }
                    }}
                    placeholder={activeTabInfo.placeholder}
                  />
                  </div>
                </div>
              </div>

              {activeTab === "saved-drafts" ? (
                <SavedDraftsTable
                  drafts={filteredDrafts}
                  onDelete={handleDeleteDraft}
                  onOpenInDraftEditor={handleOpenInDraftEditor}
                />
              ) : (
                <LibraryItemsTable
                  items={sortedItems}
                  activeTab={activeTab}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  recordsPerPage={recordsPerPage}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  copiedId={copiedId}
                  activeTabLabel={activeTabInfo.label}
                  onSort={toggleSort}
                  onRowClick={(item) => {
                    if (item.type === "files") setSelectedFolder(item);
                    else setViewDetailItem(item);
                  }}
                  onCopyId={handleCopyId}
                  onDelete={(id, e) => handleDeleteItem(id, activeTab, e)}
                  onOpen={handleOpenDocument}
                  openingId={openingId}
                  onPageChange={setCurrentPage}
                  onRecordsPerPageChange={(n) => {
                    setRecordsPerPage(n);
                    setCurrentPage(1);
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {isCreateOpen && (
          <CreateItemModal
            activeTab={activeTab}
            activeTabInfo={activeTabInfo}
            formName={formName}
            formDescription={formDescription}
            formTags={formTags}
            formDetails={formDetails}
            onChangeName={setFormName}
            onChangeDescription={setFormDescription}
            onChangeTags={setFormTags}
            onChangeDetails={setFormDetails}
            onSubmit={onCreateSubmit}
            onClose={() => setIsCreateOpen(false)}
          />
        )}

        {selectedFolder && (
          <FolderDetailView
            folder={selectedFolder}
            onClose={() => setSelectedFolder(null)}
            onAddFiles={(folderId) => openFileUpload(folderId)}
            onDeleteFile={(folderId, fileId) => {
              handleDeleteFileFromFolder(folderId, fileId).then(() => {
                setSelectedFolder((prev) =>
                  prev ? { ...prev, fileList: (prev.fileList || []).filter((f) => f.id !== fileId) } : null
                );
              });
            }}
            onDeleteFolder={(id, e) => handleDeleteItem(id, "files", e)}
          />
        )}

        {viewDetailItem && (
          <ItemDetailView
            item={viewDetailItem}
            onClose={() => setViewDetailItem(null)}
            onDelete={(id, type, e) => handleDeleteItem(id, type, e)}
          />
        )}

        {isAddFileOpen && (
          <FileUploadModal
            uploadStatus={uploadStatus}
            uploadError={uploadError}
            uploadResultMessage={uploadResultMessage}
            uploadProgressPercent={uploadProgressPercent}
            uploadProgressMessage={uploadProgressMessage}
            pendingVaultFiles={pendingVaultFiles}
            vaultBatchError={vaultBatchError}
            suggestedVaultFolderName={suggestedVaultFolderName}
            formFolderTarget={formFolderTarget}
            folders={folderItems}
            onChangeFolderTarget={setFormFolderTarget}
            onAddFiles={addVaultFiles}
            onRemoveFile={removeVaultFile}
            onClearFiles={clearVaultFiles}
            onSubmit={submitVaultFiles}
            onClose={closeFileUpload}
          />
        )}

        {isVaultIngestOpen && isVaultIngestTab && (
          <VaultIngestModal
            activeTab={activeTab}
            uploadStatus={uploadStatus}
            uploadError={uploadError}
            uploadResultMessage={uploadResultMessage}
            uploadProgressPercent={uploadProgressPercent}
            uploadProgressMessage={uploadProgressMessage}
            vaultContractType={vaultContractType}
            vaultJurisdiction={vaultJurisdiction}
            onChangeContractType={setVaultContractType}
            onChangeJurisdiction={setVaultJurisdiction}
            onFileSelect={handleVaultFileSelect}
            onClose={closeVaultIngestModal}
          />
        )}
      </div>
    </>
  );
}
