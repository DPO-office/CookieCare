import React from "react";
import {
  Gavel, Folder, ArrowUp, RefreshCw, ChevronDown,
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

  /* context */
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
    <div className="shrink-0 bg-[#FAFAFB] px-10 pb-8 pt-3">
      <div className="max-w-5xl mx-auto w-full relative" ref={composerRef}>

        {/* Composer box */}
        <div className="relative bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-gray-300 transition-all duration-200 overflow-visible">

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            id="legal-prompt-input"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); autoResizeTextarea(); }}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask a legal question - GDPR compliance, contract review, tax treaties..."
            rows={1}
            className="w-full bg-transparent text-[15px] py-4 pl-5 pr-5 focus:outline-none placeholder:text-gray-400 text-gray-900 resize-none leading-relaxed"
            style={{ minHeight: "60px", maxHeight: "180px" }}
          />

          {/* Divider */}
          <div className="mx-4 border-t border-gray-100" />

          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex items-center gap-2">

              {/* Jurisdictions selector */}
              <button
                type="button"
                onClick={() => togglePopover("jurisdictions")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-150 cursor-pointer ${
                  openPopover === "jurisdictions" || selectedJurisdictions.length > 0
                    ? "text-white border-transparent shadow-sm"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-700"
                }`}
                style={openPopover === "jurisdictions" || selectedJurisdictions.length > 0 ? { background: "#2175D9" } : {}}
              >
                <Gavel className="w-3 h-3" />
                <span>
                  {selectedJurisdictions.length > 0
                    ? `${selectedJurisdictions.length} Jurisdiction${selectedJurisdictions.length > 1 ? "s" : ""}`
                    : "Jurisdiction"}
                </span>
                <ChevronDown className={`w-2.5 h-2.5 opacity-60 transition-transform duration-150 ${openPopover === "jurisdictions" ? "rotate-180" : ""}`} />
              </button>

              {/* Documents selector */}
              <button
                type="button"
                onClick={() => togglePopover("kb")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all duration-150 cursor-pointer ${
                  openPopover === "kb" || selectedKBCount > 0
                    ? "text-white border-transparent shadow-sm"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-700"
                }`}
                style={openPopover === "kb" || selectedKBCount > 0 ? { background: "#2175D9" } : {}}
              >
                <Folder className="w-3 h-3" />
                <span>
                  {selectedKBCount > 0
                    ? `${selectedKBCount} Doc${selectedKBCount > 1 ? "s" : ""}`
                    : "Documents"}
                </span>
                <ChevronDown className={`w-2.5 h-2.5 opacity-60 transition-transform duration-150 ${openPopover === "kb" ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* Send button */}
            <button
              id="legal-prompt-submit"
              type="button"
              onClick={() => handleQueryDispatch()}
              disabled={!searchQuery.trim() || isStreaming}
              className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none cursor-pointer shadow-sm shrink-0" style={{ background: "#2175D9" }}
            >
              {isStreaming
                ? <RefreshCw className="w-4 h-4 animate-spin text-white" />
                : <ArrowUp className="w-4 h-4 text-white" />}
            </button>
          </div>
        </div>

        {/* Hint */}
        <p className="text-center text-[10px] text-gray-400 mt-2.5">
          <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send
          &nbsp;-&nbsp;
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




