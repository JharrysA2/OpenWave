// Timestamp LRC válido: [m:ss], [mm:ss], [mm:ss.x], [mm:ss.xx], [mm:ss.xxx]
const LRC_TIME_TOKEN = /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/;

/**
 * Parse .lrc synced lyrics into [{time, text}] array.
 * Soporta múltiples timestamps por línea ([00:12.00][01:10.00]Texto),
 * tags de metadata ([ti:], [ar:], ...), offset [offset:+500] y
 * formatos [m:ss], [mm:ss.xxx], [mm:ss.xx], [mm:ss.x], [mm:ss].
 */
export function parseLrc(lines) {
  const parsed = [];
  let offsetMs = 0;

  for (const rawLine of lines) {
    const input = (rawLine || "").replace(/\r$/, "").trim();
    if (!input) continue;

    // Procesar los grupos [..] que abren la línea: timestamps y/o metadata.
    // Ej: [00:12.00][01:10.00]Texto → 2 timestamps;
    //     [offset:+500] → desplaza todas las líneas posteriores.
    const tags = [];
    let cursor = 0;
    while (cursor < input.length && input[cursor] === "[") {
      const close = input.indexOf("]", cursor);
      if (close === -1) break;
      const token = input.slice(cursor + 1, close);
      const timeMatch = token.match(LRC_TIME_TOKEN);
      if (timeMatch) {
        tags.push(timeMatch);
      } else {
        // Metadata (sin timestamp) — solo nos importa el offset
        const colon = token.indexOf(":");
        const key = colon !== -1 ? token.slice(0, colon).toLowerCase() : "";
        if (key === "offset") {
          offsetMs = parseInt(token.slice(colon + 1), 10) || 0;
        }
      }
      cursor = close + 1;
    }

    const text = input.slice(cursor).trim();

    // Línea de solo metadata/offset → no genera entrada cantable
    if (tags.length === 0) {
      if (text) {
        // Sin timestamp → heredar el tiempo de la entrada anterior (o 0)
        const prevTime = parsed.length > 0 ? parsed[parsed.length - 1].time : 0;
        parsed.push({ time: prevTime, text });
      }
      continue;
    }

    for (const t of tags) {
      const min = parseInt(t[1], 10);
      const sec = parseInt(t[2], 10);
      const ms = t[3] ? parseInt(t[3].padEnd(3, "0"), 10) : 0;
      let time = min * 60 + sec + ms / 1000 + offsetMs / 1000;
      if (time < 0) time = 0;
      parsed.push({ time, text });
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
}
