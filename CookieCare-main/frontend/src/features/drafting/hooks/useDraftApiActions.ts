import { apiUrl } from "../../../config";
import { LegalDocument } from "../../../shared/types";
import { markdownToHtml } from "../../../shared/utils/markdownToHtml";

interface UseDraftApiActionsParams {
  authToken: string;
  onRefresh: () => void;
  setSelectedDoc: (doc: LegalDocument | null) => void;
  setEditorContent: (content: string) => void;
  setIsSaving: (saving: boolean) => void;
  setSavingMsg: (msg: string) => void;
}

export function useDraftApiActions({
  authToken,
  onRefresh,
  setSelectedDoc,
  setEditorContent,
  setIsSaving,
  setSavingMsg,
}: UseDraftApiActionsParams) {
  
  const handleCreateDocument = async (
    newTitle: string,
    newType: "NDA" | "DPA" | "SLA" | "Custom",
    onSuccess: () => void
  ) => {
    if (!newTitle.trim()) return;

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ title: newTitle, type: newType })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      onSuccess();
      onRefresh();
      
      setSelectedDoc(data);
      const raw = data.content || "";
      setEditorContent(/<[a-z][\s\S]*>/i.test(raw.trim()) ? raw : markdownToHtml(raw));
    } catch (err: any) {
      alert(err.message || "Failed to create agreement draft");
    }
  };

  const handleSaveDraft = async (
    selectedDoc: LegalDocument | null,
    editorContent: string,
    commentText: string = "Manual Editor Draft Commit",
    titleOverride?: string
  ) => {
    if (!selectedDoc) return;
    setIsSaving(true);
    setSavingMsg("Encrypting and saving on clouds...");

    try {
      const saveTitle = titleOverride ?? selectedDoc.title;
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ content: editorContent, title: saveTitle, comment: commentText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSelectedDoc({ ...selectedDoc, title: saveTitle, ...data });
      onRefresh();
      setSavingMsg("FIPS Enclave Saved and Encrypted Successfully!");
      setTimeout(() => setSavingMsg(""), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to save document. Please verify signature locking details.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDraft = async (selectedDoc: LegalDocument | null, onSuccess: () => void) => {
    if (!selectedDoc) return;
    if (!confirm(`Are you sure you want to delete "${selectedDoc.title}"?`)) return;
    
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}`), {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      if (res.ok) {
        onSuccess();
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleShare = async (selectedDoc: LegalDocument | null, shareEmail: string, onSuccess: () => void) => {
    if (!selectedDoc || !shareEmail.trim()) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}/share`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ email: shareEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSelectedDoc({ ...selectedDoc, sharedWith: data.sharedWith ?? [] });
      onRefresh();
      onSuccess();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRequestSignature = async (
    selectedDoc: LegalDocument | null,
    requestSignEmail: string,
    onSuccess: () => void
  ) => {
    if (!selectedDoc || !requestSignEmail.trim()) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}/request-signature`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ email: requestSignEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSelectedDoc({ ...selectedDoc, signatures: data.signatures ?? [] });
      onRefresh();
      onSuccess();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSignDocument = async (selectedDoc: LegalDocument | null, signerName: string, onSuccess: () => void) => {
    if (!selectedDoc || !signerName.trim()) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}/sign`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ fullName: signerName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const refreshedDocRes = await fetch(apiUrl(`/api/documents/${selectedDoc.id}`), {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      const refreshedDoc = await refreshedDocRes.json();
      setSelectedDoc(refreshedDoc);
      const raw = refreshedDoc.content || "";
      setEditorContent(/<[a-z][\s\S]*>/i.test(raw.trim()) ? raw : markdownToHtml(raw));
      onRefresh();
      onSuccess();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleVersionRestore = (
    historicalContent: string,
    versionNumber: number,
    saveDraft: () => void
  ) => {
    if (!confirm(`Are you sure you want to revert the live draft to Version ${versionNumber}?`)) return;
    const raw = historicalContent || "";
    const isHtml = /<[a-z][\s\S]*>/i.test(raw.trim());
    setEditorContent(isHtml ? raw : markdownToHtml(raw));
    setTimeout(() => {
      saveDraft();
    }, 100);
  };

  const handleSealDocumentLocally = async (selectedDoc: LegalDocument | null) => {
    if (!selectedDoc) return;
    if (!confirm("Are you sure you want to apply cryptographic locking over this document? This seals all arrays as read-only forever.")) return;
    
    try {
      const res = await fetch(apiUrl(`/api/documents/${selectedDoc.id}/sign`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ fullName: "SYSTEM EXECUTIVE LOCK SEAL" })
      });
      if (!res.ok) throw new Error("Could not register local locking execution.");
      
      const refreshedDocRes = await fetch(apiUrl(`/api/documents/${selectedDoc.id}`), {
        headers: { "Authorization": `Bearer ${authToken}` }
      });
      const refreshedDoc = await refreshedDocRes.json();
      setSelectedDoc(refreshedDoc);
      const raw = refreshedDoc.content || "";
      setEditorContent(/<[a-z][\s\S]*>/i.test(raw.trim()) ? raw : markdownToHtml(raw));
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExportDoc = async (selectedDoc: LegalDocument | null, selectedTemplateName: string | null, editorContent: string) => {
    try {
      const exportTitle = selectedDoc?.title || selectedTemplateName || "Lexify Draft";
      const res = await fetch(apiUrl("/api/documents/export"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: exportTitle,
          contentType: "redlines",
          content: editorContent.replace(/\[GEMINI\]/g, "[AI LEGAL ASSISTANT]").replace(/\[USER\]/g, "[USER QUERY]"),
          format: "docx"
        })
      });

      if (!res.ok) throw new Error("Backend export failed");

      const blob = await res.blob();
      const element = document.createElement("a");
      element.href = URL.createObjectURL(blob);
      element.download = `${exportTitle.toLowerCase().replace(/\s+/g, "_")}_draft.docx`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } catch (err: any) {
      console.warn("Secure DOCX export fallback applied:", err.message);
      const element = document.createElement("a");
      const file = new Blob([editorContent], {type: "text/plain"});
      element.href = URL.createObjectURL(file);
      element.download = `${selectedTemplateName?.toLowerCase().replace(/\s+/g, "_") || "legal_agreement"}_draft.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const handlePrintDoc = async (selectedDoc: LegalDocument | null, selectedTemplateName: string | null, editorContent: string) => {
    try {
      const exportTitle = selectedDoc?.title || selectedTemplateName || "Lexify Draft";
      const res = await fetch("/api/documents/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
          title: exportTitle,
          contentType: "redlines",
          content: editorContent.replace(/\[GEMINI\]/g, "[AI LEGAL ASSISTANT]").replace(/\[USER\]/g, "[USER QUERY]"),
          format: "pdf"
        })
      });

      if (!res.ok) throw new Error("Backend PDF generation failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        const element = document.createElement("a");
        element.href = url;
        element.download = `${exportTitle.toLowerCase().replace(/\s+/g, "_")}_draft.pdf`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      }
    } catch (err: any) {
      console.warn("Print fallback applied:", err.message);
      window.print();
    }
  };

  return {
    handleCreateDocument,
    handleSaveDraft,
    handleDeleteDraft,
    handleShare,
    handleRequestSignature,
    handleSignDocument,
    handleVersionRestore,
    handleSealDocumentLocally,
    handleExportDoc,
    handlePrintDoc,
  };
}
