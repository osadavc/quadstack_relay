export * from "./catalogue";
export * from "./time";

export type Role = "dispatcher" | "loader" | "driver" | "store";
export type Brand = "Fresh" | "Style" | "Tech";
export type Temp = "chilled" | "ambient";

/** Orders for the next day close at 16:00 the day before. */
export const CUTOFF = "16:00";

export const ROLE_LABEL: Record<Role, string> = {
  dispatcher: "Dispatcher",
  loader: "Loader",
  driver: "Driver",
  store: "Store manager",
};

export const DOCK_LABEL: Record<string, string> = {
  rear_dock: "Rear dock",
  street: "Street",
  mall_bay: "Mall bay",
};

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export const m3 = (n: number, digits = 1) => `${n.toFixed(digits)} m³`;
export const kg = (n: number) => `${Math.round(n).toLocaleString("en-GB")} kg`;
