import { useState, useCallback } from "react";

/**
 * Estado del modo de selección múltiple (PlaylistView/AlbumView).
 * Devuelve el set `selected`, el flag `selectMode` y los mutadores
 * que comparten ambos views.
 */
export function useMultiSelect(initial = false) {
  const [selectMode, setSelectMode] = useState(initial);
  const [selected, setSelected] = useState(() => new Set());

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => !v);
    setSelected(new Set());
  }, []);

  const resetSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  return {
    selectMode,
    selected,
    count: selected.size,
    toggleSelect,
    toggleSelectMode,
    resetSelect,
  };
}
