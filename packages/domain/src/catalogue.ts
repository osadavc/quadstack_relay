/*
 * What an order is. Per the brief, a Fresh outlet places separate chilled
 * and ambient (dry grocery) orders, so it can have two orders for the same
 * delivery day; Style and Tech order ambient goods. An order is a count of
 * units with its total weight and volume, since every vehicle has a weight
 * and a volume limit and a load must satisfy both.
 */

export const TEMPS_BY_BRAND: Record<string, ("chilled" | "ambient")[]> = {
  Fresh: ["chilled", "ambient"],
  Style: ["ambient"],
  Tech: ["ambient"],
};

export const tempsFor = (brand: string) => TEMPS_BY_BRAND[brand] ?? ["ambient"];

export const TEMP_LABEL: Record<string, string> = {
  chilled: "Chilled",
  ambient: "Ambient",
};

/** The one line an order carries: its goods, by temperature. */
export const lineName = (temp: string) =>
  temp === "chilled" ? "Chilled goods" : "Ambient goods";

/** 'WF-1005-074C': brand, delivery date, outlet number, C/A for Fresh. */
export function orderIdFor(
  brand: string,
  day: string,
  outletId: string,
  temp: string,
): string {
  const b = brand === "Fresh" ? "F" : brand === "Style" ? "S" : "T";
  const mmdd = `${day.slice(5, 7)}${day.slice(8, 10)}`;
  const suffix = brand === "Fresh" ? (temp === "chilled" ? "C" : "A") : "";
  return `W${b}-${mmdd}-${outletId.slice(3)}${suffix}`;
}
