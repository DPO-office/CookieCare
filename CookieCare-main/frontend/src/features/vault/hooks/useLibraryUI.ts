/**
 * useLibraryUI
 *
 * Owns: all UI-only state — active tab, search, pagination, sort,
 * modal visibility, form fields, and vault ingest form state.
 */

import { useState } from "react";
import { LibraryTabId, LibraryItem, LibraryItemSource } from "../types";

export function useLibraryUI() {
  // Tab & search
  const [activeTab, setActiveTab] = useState<LibraryTabId>("files");
  const [searchQuery, setSearchQuery] = useState("");
  const [savedDraftsSearch, setSavedDraftsSearch] = useState("");

  // Scope filter — only active for tabs that support private/org (rulebook, templates, clauses).
  // "all" means show everything the user can see (own private + all org).
  const [scopeFilter, setScopeFilter] = useState<"all" | LibraryItemSource>("all");

  // Pagination & sort
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [sortField, setSortField] = useState<keyof LibraryItem>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Modal visibility
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<LibraryItem | null>(null);
  const [viewDetailItem, setViewDetailItem] = useState<LibraryItem | null>(null);
  const [isAddFileOpen, setIsAddFileOpen] = useState(false);
  const [isVaultIngestOpen, setIsVaultIngestOpen] = useState(false);

  // Vault ingest form
  const [vaultContractType, setVaultContractType] = useState("NDA");
  const [vaultJurisdiction, setVaultJurisdiction] = useState("");

  // Create item form
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formDetails, setFormDetails] = useState("");
  const [formFolderTarget, setFormFolderTarget] = useState("");

  const handleTabChange = (tabId: LibraryTabId) => {
    setActiveTab(tabId);
    setSearchQuery("");
    setCurrentPage(1);
    // Reset scope filter when switching tabs so stale scopes don't carry over.
    setScopeFilter("all");
  };

  const toggleSort = (field: keyof LibraryItem) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const resetCreateForm = () => {
    setFormName("");
    setFormDescription("");
    setFormTags("");
    setFormDetails("");
  };

  const openVaultIngest = () => {
    setVaultContractType("NDA");
    setVaultJurisdiction("");
    setIsVaultIngestOpen(true);
  };

  return {
    // Tab & search
    activeTab,
    searchQuery,
    setSearchQuery,
    savedDraftsSearch,
    setSavedDraftsSearch,
    handleTabChange,

    // Scope filter (rulebook / templates / clauses only)
    scopeFilter,
    setScopeFilter,

    // Pagination & sort
    currentPage,
    setCurrentPage,
    recordsPerPage,
    setRecordsPerPage,
    sortField,
    sortDirection,
    toggleSort,

    // Modal visibility
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

    // Vault ingest form
    vaultContractType,
    setVaultContractType,
    vaultJurisdiction,
    setVaultJurisdiction,

    // Create item form
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
  };
}
