import type { LoadSheetData } from "@/server/queries/dock";

export type Section = LoadSheetData["sections"][number];
export type SheetUnit = Section["units"][number];

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export const KIND_WORD: Record<string, [string, string]> = {
  chilled: ["chilled order", "chilled orders"],
  ambient: ["ambient order", "ambient orders"],
};

export function kindCount(units: { kind: string }[]) {
  const counts = new Map<string, number>();
  for (const u of units) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
  return [...counts]
    .map(([k, n]) => {
      const [one, many] = KIND_WORD[k] ?? [k, `${k}s`];
      return plural(n, one, many);
    })
    .join(" · ");
}

export const REASON_WORD: Record<string, string> = {
  damaged: "damaged",
  missing: "missing",
  wrong: "substituted",
  warm: "too warm",
};

/** "Loaded 44 of 46 · 2 units chilled goods damaged, flagged 03:22" */
export function shortfallLine(u: SheetUnit) {
  if (!u.shortfall) return `${u.cases} units · flagged`;
  const s = u.shortfall;
  return `Loaded ${u.cases - s.cases} of ${u.cases} · ${plural(s.cases, "unit")} ${REASON_WORD[s.reason] ?? s.reason}, flagged ${s.at}`;
}

export const m3 = (n: number) => `${n.toFixed(1)} m³`;

/** A plan-change note as separate lines, each outlet once. */
export function changeLines(note: string | null | undefined): string[] {
  if (!note) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of note.split(" · ")) {
    const line = part.trim().replace(/^Plan v\d+: /, "");
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/** "OUT075 moved to VEH009. Don’t load it, and 2 more changes" */
export function changeSummary(note: string | null | undefined) {
  const lines = changeLines(note);
  if (lines.length <= 1) return lines[0] ?? "";
  return `${lines[0]}, and ${plural(lines.length - 1, "more change")}`;
}
