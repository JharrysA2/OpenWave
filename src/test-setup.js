import "@testing-library/jest-dom";

// Node ≥ 25 instala un `localStorage` nativo (webstorage experimental) en
// globalThis que devuelve `undefined` sin `--localstorage-file`. En vitest,
// globalThis es la ventana de jsdom, así que ese accessor propio tapa el que
// jsdom trae y los tests ven `localStorage === undefined` («Cannot read
// properties of undefined (reading 'clear')»). Se sustituye por un almacén
// con la misma API para que los tests vuelvan a funcionar en cualquier Node.
if (typeof localStorage === "undefined") {
  const datos = new Map();
  const almacen = {
    getItem(clave) {
      return datos.has(clave) ? datos.get(clave) : null;
    },
    setItem(clave, valor) {
      datos.set(clave, String(valor));
    },
    removeItem(clave) {
      datos.delete(clave);
    },
    clear() {
      datos.clear();
    },
    key(i) {
      return [...datos.keys()][i] ?? null;
    },
    get length() {
      return datos.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: almacen,
    configurable: true,
    writable: true,
  });
}
