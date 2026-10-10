let _nextId = 0;

import { useState, useCallback } from "react";

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((msg, type = "info") => {
    // Dedup: si el MISMO mensaje+tipo ya está en pantalla no se apila otra
    // copia (un mismo error puede venir de dos fuentes — p.ej. playSong y el
    // evento error del <audio>). El timer del toast original sigue vigente.
    const id = ++_nextId;
    setToasts((t) =>
      t.some((x) => x.msg === msg && x.type === type) ? t : [...t, { id, msg, type }],
    );
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return { toasts, show };
}
