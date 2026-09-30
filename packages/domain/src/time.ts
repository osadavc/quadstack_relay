/*
 * Operational times are Asia/Colombo wall-clock strings,
 * 'YYYY-MM-DD HH:MM:SS', so they never shift with the server's time zone.
 * Engine and plan times are minutes after midnight on the delivery day.
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

const colombo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** A moment as Asia/Colombo wall-clock time, 'YYYY-MM-DD HH:MM:SS'. */
export function colomboTime(at: Date = new Date()): string {
  const p = Object.fromEntries(
    colombo.formatToParts(at).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export const colomboToday = (at: Date = new Date()) =>
  colomboTime(at).slice(0, 10);

/** Day of the week, 0 = Sunday. */
export const dowOf = (day: string) =>
  new Date(`${day.slice(0, 10)}T00:00:00Z`).getUTCDay();

/** Normalise '2026-04-06T06:52' or '2026-04-06 06:52:00' to the stored form. */
export function normalizeOps(ts: string): string {
  const [d, t = "00:00:00"] = ts.replace("T", " ").split(" ");
  const [h = "00", m = "00", s = "00"] = t.split(":");
  return `${d} ${pad(Number(h))}:${pad(Number(m))}:${pad(Number(s.slice(0, 2)))}`;
}

function toUtcMs(ts: string): number {
  const [d, t] = normalizeOps(ts).split(" ");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi, s] = t.split(":").map(Number);
  return Date.UTC(y, mo - 1, da, h, mi, s);
}

function fromUtcMs(ms: number): string {
  const x = new Date(ms);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}`;
}

export function addMinutes(ts: string, minutes: number): string {
  return fromUtcMs(toUtcMs(ts) + minutes * 60_000);
}

export function addDays(day: string, days: number): string {
  return fromUtcMs(toUtcMs(`${day} 00:00:00`) + days * 86_400_000).slice(0, 10);
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 60_000);
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (toUtcMs(`${b} 00:00:00`) - toUtcMs(`${a} 00:00:00`)) / 86_400_000,
  );
}

export const cmpOps = (a: string, b: string) =>
  normalizeOps(a).localeCompare(normalizeOps(b));

export const maxOps = (a: string, b: string) => (cmpOps(a, b) >= 0 ? a : b);

/** Story time for a plan offset on the delivery day (minutes after midnight). */
export function opsAt(day: string, minutes: number): string {
  return addMinutes(`${day} 00:00:00`, Math.round(minutes));
}

/** Minutes after midnight of `day` (negative for the day before). */
export function minutesOf(ts: string, day: string): number {
  return minutesBetween(`${day} 00:00:00`, ts);
}

export const dayOf = (ts: string) => normalizeOps(ts).slice(0, 10);

/** '06:52' */
export function hhmm(ts: string): string {
  return normalizeOps(ts).slice(11, 16);
}

/** '06:52' from minutes after midnight (any day). */
export function clockOf(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** '06:52' for minutes on `day`, 'Sat 21:17' when they fall on another day. */
export function clockOn(day: string, minutes: number): string {
  const offset = Math.floor(Math.round(minutes) / 1440);
  return offset === 0
    ? clockOf(minutes)
    : `${weekday(addDays(day, offset))} ${clockOf(minutes)}`;
}

export function toMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
}

/** 'Mon 6 Apr' */
export function dayLabel(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** 'Mon' */
export function weekday(day: string): string {
  return DAYS[new Date(`${day.slice(0, 10)}T00:00:00Z`).getUTCDay()];
}

/** '06:52' on `today`, 'Sun 19:42' otherwise. */
export function stamp(ts: string, today: string): string {
  const d = dayOf(ts);
  return d === today ? hhmm(ts) : `${weekday(d)} ${hhmm(ts)}`;
}

/** '05:30–08:00' */
export function windowLabel(open: number | string, close: number | string) {
  const o = typeof open === "number" ? clockOf(open) : open;
  const c = typeof close === "number" ? clockOf(close) : close;
  return `${o}–${c}`;
}
