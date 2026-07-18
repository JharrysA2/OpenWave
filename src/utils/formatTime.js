export function fmtTime(s) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
}
