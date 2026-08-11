/**
 * useLibrary
 *
 * Composes three focused hooks:
 * - useLibraryData    → remote data, items state, CRUD operations
 * - useLibraryUpload  → upload state machine, batch uploads, vault ingest
 * - useLibraryUI      → UI state (tabs, pagination, modals, form fields)
 *
 * Re-exports the entire composed API to preserve backward compatibility.
 */

import { useLibraryData } from "./useLibraryData";
import { useLibraryUpload } from "./useLibraryUpload";

export function useLibrary(authToken: string, onRefresh: () => void) {
  const dataHook = useLibraryData(authToken, onRefresh);
  const uploadHook = useLibraryUpload(
    authToken,
    dataHook.items,
    onRefresh,
    dataHook.fetchLibraryData
  );

  return {
    // Data state & operations
    items: dataHook.items,
    setItems: dataHook.setItems,
    savedDrafts: dataHook.savedDrafts,
    copiedId: dataHook.copiedId,
    fetchLibraryData: dataHook.fetchLibraryData,
    handleCopyId: dataHook.handleCopyId,
    handleDeleteItem: dataHook.handleDeleteItem,
    handleDeleteDraft: dataHook.handleDeleteDraft,
    handleCreateNewItem: dataHook.handleCreateNewItem,
    handleDeleteFileFromFolder: dataHook.handleDeleteFileFromFolder,

    // Upload state & operations
    uploadProgress: uploadHook.uploadProgress,
    uploadStatus: uploadHook.uploadStatus,
    setUploadStatus: uploadHook.setUploadStatus,
    uploadError: uploadHook.uploadError,
    uploadResultMessage: uploadHook.uploadResultMessage,
    uploadProgressPercent: uploadHook.uploadProgressPercent,
    uploadProgressMessage: uploadHook.uploadProgressMessage,
    resetUploadProgress: uploadHook.resetUploadProgress,
    pendingVaultFiles: uploadHook.pendingVaultFiles,
    vaultBatchError: uploadHook.vaultBatchError,
    suggestedVaultFolderName: uploadHook.suggestedVaultFolderName,
    addVaultFiles: uploadHook.addVaultFiles,
    removeVaultFile: uploadHook.removeVaultFile,
    clearVaultFiles: uploadHook.clearVaultFiles,
    handleCreateUploadFolder: uploadHook.handleCreateUploadFolder,
    handleTriggerUpload: uploadHook.handleTriggerUpload,
    handleVaultAssetUpload: uploadHook.handleVaultAssetUpload,
  };
}
