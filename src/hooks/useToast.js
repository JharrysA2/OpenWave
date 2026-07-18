let _nextId = 0;

import { useState, useCallback } from "react";

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((msg, type = "info") => {
    const id = ++_nextId;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  return { toasts, show };
}
