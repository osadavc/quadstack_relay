import { DEFAULT_SETTINGS, type EngineInput } from "./types";

/** The inputs a draft was built against; previous placement is only a hint. */
export function planningInputKey(input: EngineInput): string {
  const { previous: _previous, ...raw } = input;
  const snapshot = {
    ...raw,
    orders: [...input.orders].sort((a, b) => a.id.localeCompare(b.id)),
    vehicles: [...input.vehicles].sort((a, b) => a.id.localeCompare(b.id)),
    travel: [...input.travel].sort((a, b) =>
      a.district.localeCompare(b.district),
    ),
    pins: [...(input.pins ?? [])].sort((a, b) =>
      a.orderId.localeCompare(b.orderId),
    ),
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
  };
  return JSON.stringify(snapshot, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return value;
  });
}
