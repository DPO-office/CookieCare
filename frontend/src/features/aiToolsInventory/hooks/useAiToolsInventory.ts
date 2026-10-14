import { useCallback, useEffect, useMemo, useState } from "react";
import { createAiTool, deleteAiTool, fetchAiTools, updateAiTool } from "../api/aiToolsApi";
import { EMPTY_TOOL_FORM } from "../constants";
import type { AiTool, AiToolInput, StatusTab } from "../types";
import { computeMetrics, filterTools } from "../utils";

export function useAiToolsInventory(authToken: string) {
  const [tools, setTools] = useState<AiTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<StatusTab>("all");
  const [editing, setEditing] = useState<AiTool | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchAiTools(authToken);
      setTools(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => filterTools(tools, tab, query), [tools, tab, query]);
  const metrics = useMemo(() => computeMetrics(tools), [tools]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (tool: AiTool) => {
    setEditing(tool);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
  };

  const saveTool = async (payload: AiToolInput) => {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const updated = await updateAiTool(authToken, editing.id, payload);
        setTools((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await createAiTool(authToken, payload);
        setTools((prev) => [created, ...prev]);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tool.");
    } finally {
      setSaving(false);
    }
  };

  const removeTool = async (id: string) => {
    setError(null);
    try {
      await deleteAiTool(authToken, id);
      setTools((prev) => prev.filter((t) => t.id !== id));
      if (editing?.id === id) closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tool.");
    }
  };

  return {
    tools,
    visible,
    metrics,
    loading,
    error,
    query,
    setQuery,
    tab,
    setTab,
    editing,
    formOpen,
    saving,
    openCreate,
    openEdit,
    closeForm,
    saveTool,
    removeTool,
    defaultForm: editing ?? EMPTY_TOOL_FORM,
  };
}
