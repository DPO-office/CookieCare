import React from "react";
import {
  Plus, Gavel, FileCode, Folder, Globe, ArrowUp, RefreshCw, ChevronDown, X,
} from "lucide-react";
import { OutputFormat, PopoverType } from "../types";
import Popovers from "./Popovers";
import { KBFolder } from "../types";

interface ComposerBarProps {
  /* query */
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  autoResizeTextarea: () => void;
  handleQueryDispatch: (e?: React.FormEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isStreaming: boolean;

  /* context chips */
  selectedJurisdictions: string[];
  toggleJurisdiction: (label: string) => void;
  selectedKBCount: number;
  selectedFolderCount: number;
  webDiscoveryUrls: string[];
  selectedFormat: OutputFormat;

  /* popovers */
  openPopover: PopoverType;
  togglePopover: (p: PopoverType) => void;
  setOpenPopover: (p: PopoverType) => void;
  composerRef: React.RefObject<HTMLDivElement | null>;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fileUploadRef: React.RefObject<HTMLInputElement | null>;

  /* popover data */
  availableJurisdictions: any[];
  setSelectedJurisdictions: (v: string[]) => void;
  setSelectedFormat: (f: OutputFormat) => void;
  folders: KBFolder[];
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  handleAddFolder: (e: React.FormEvent) => void;
  toggleFolderSelection: (id: string) => void;
  handleDeleteFolder: (id: string, e: React.MouseEvent) => void;
  setActiveFolderForUpload: (id: string) => void;
  webDiscoveryUrlInput: string;
  setWebDiscoveryUrlInput: (v: string) => void;
  handleAddWebUrl: (e: React.FormEvent) => void;
  removeWebUrl: (url: string) => void;
}

export default function ComposerBar({
  searchQuery, setSearchQuery, autoResizeTextarea, handleQueryDispatch,
  handleKeyDown, isStreaming,
  selectedJurisdictions, toggleJurisdiction, selectedKBCount,
  selectedFolderCount, webDiscoveryUrls, selectedFormat,
  openPopover, togglePopover, setOpenPopover, composerRef, popoverRef,
  textareaRef, fileUploadRef,
  availableJurisdictions, setSelectedJurisdictions, setSelectedFormat,
  folders, newFolderName, setNewFolderName, handleAddFolder,
  toggleFolderSelection, handleDeleteFolder, setActiveFolderForUpload,
  webDiscoveryUrlInput, setWebDiscoveryUrlInput, handleAddWebUrl, removeWebUrl,
}: ComposerBarProps) {
  return (
    <div className="shrink-0 bg-[#F7F8FA] px-4 pb-5 pt-3">
      <div className="max-w-3xl mx-auto w-full relative" ref={composerRef}>

        {/* Context chips */}
        {(selectedJurisdictions.length > 0 || selectedKBCount > 0 || webDiscoveryUrls.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
            {selectedJurisdictions.slice(0, 3).map((j) => (
              <span key={j}
                className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shadow-xs">
                <Gavel className="w-2.5 h-2.5 text-gray-400" />
                {j}
                <button type="button" onClick={() => toggleJurisdiction(j)} className="hover:text-red-500 transition ml-0.5">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {selectedJurisdictions.length > 3 && (
              <span className="text-[11px] font-medium bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full shadow-xs">
                +{selectedJurisdictions.length - 3} jurisdictions
              </span>
            )}
            {selectedKBCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shadow-xs">
                <Folder className="w-2.5 h-2.5 text-gray-400" />
                {selectedKBCount} doc{selectedKBCount > 1 ? "s" : ""} from {selectedFolderCount} folder{selectedFolderCount > 1 ? "s" : ""}
              </span>
            )}
            {webDiscoveryUrls.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shadow-xs">
                <Globe className="w-2.5 h-2.5 text-gray-400" />
                {webDiscoveryUrls.length} web source{webDiscoveryUrls.length > 1 ? "s" : ""}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shadow-xs">
              <FileCode className="w-2.5 h-2.5 text-gray-400" />
              {selectedFormat}
            </span>
          </div>
        )}

        {/* Composer box */}
        <div className="relative bg-white border border-gray-200 rounded-2xl shadow-md hover:shadow-lg focus-within:shadow-lg focus-within:border-gray-300 transition-all overflow-visible">
          <textarea
            ref={textareaRef}
            id="legal-prompt-input"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); autoResizeTextarea(); }}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask a legal question — GDPR compliance, contract review, tax treaties…"
            rows={1}
            className="w-full bg-transparent text-sm py-3.5 pl-4 pr-4 focus:outline-none placeholder:text-gray-400 text-gray-900 resize-none leading-relaxed"
            style={{ minHeight: "52px", maxHeight: "180px" }}
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 pb-3 pt-1 gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              {/* + button */}
              <button type="button" onClick={() => togglePopover("add")}
                className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-all cursor-pointer shrink-0 ${
                  openPopover === "add"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                }`} title="Add context">
                <Plus className={`w-3.5 h-3.5 transition-transform duration-200 ${openPopover === "add" ? "rotate-45" : ""}`} />
              </button>

              {/* Jurisdictions chip */}
              <button type="button" onClick={() => togglePopover("jurisdictions")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                  openPopover === "jurisdictions" || selectedJurisdictions.length > 0
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                }`}>
                <Gavel className="w-3 h-3" />
                <span>{selectedJurisdictions.length > 0 ? `${selectedJurisdictions.length} Jurisdiction${selectedJurisdictions.length > 1 ? "s" : ""}` : "Jurisdictions"}</span>
                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
              </button>

              {/* Format chip */}
              <button type="button" onClick={() => togglePopover("format")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                  openPopover === "format"
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                }`}>
                <FileCode className="w-3 h-3" />
                <span>{selectedFormat}</span>
                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
              </button>

              {selectedKBCount > 0 && (
                <button type="button" onClick={() => togglePopover("kb")}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                    openPopover === "kb"
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}>
                  <Folder className="w-3 h-3" />
                  <span>{selectedKBCount} Doc{selectedKBCount > 1 ? "s" : ""}</span>
                </button>
              )}
            </div>

            {/* Send */}
            <button
              id="legal-prompt-submit"
              type="button"
              onClick={() => handleQueryDispatch()}
              disabled={!searchQuery.trim() || isStreaming}
              className="w-8 h-8 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer shadow-sm shrink-0"
            >
              {isStreaming
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <ArrowUp className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-2">
          <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send
          &nbsp;·&nbsp;
          <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">Shift+Enter</kbd> for new line
        </p>

        <Popovers
          openPopover={openPopover}
          popoverRef={popoverRef}
          availableJurisdictions={availableJurisdictions}
          selectedJurisdictions={selectedJurisdictions}
          toggleJurisdiction={toggleJurisdiction}
          setSelectedJurisdictions={setSelectedJurisdictions}
          selectedFormat={selectedFormat}
          setSelectedFormat={setSelectedFormat}
          folders={folders}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          handleAddFolder={handleAddFolder}
          toggleFolderSelection={toggleFolderSelection}
          handleDeleteFolder={handleDeleteFolder}
          setActiveFolderForUpload={setActiveFolderForUpload}
          fileUploadRef={fileUploadRef}
          selectedKBCount={selectedKBCount}
          selectedFolderCount={selectedFolderCount}
          webDiscoveryUrlInput={webDiscoveryUrlInput}
          setWebDiscoveryUrlInput={setWebDiscoveryUrlInput}
          webDiscoveryUrls={webDiscoveryUrls}
          handleAddWebUrl={handleAddWebUrl}
          removeWebUrl={removeWebUrl}
          setOpenPopover={setOpenPopover}
        />
      </div>
    </div>
  );
}
