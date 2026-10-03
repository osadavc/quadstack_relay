import { db, schema as s } from "@relay/db";
import {
  addDays,
  CUTOFF,
  clockOf,
  clockOn,
  cmpOps,
  dayLabel,
  hhmm,
  minutesBetween,
  orderIdFor,
  stamp,
  tempsFor,
  weekday,
} from "@relay/domain";
import { and, desc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { User } from "../auth";
import { cutoffFor, now, orderingDay, outletDay } from "../clock";
import { type OutletHistory, outletHistory } from "../history";
import { activeProducts } from "../products";
import {
  eventsFor,
  loadedCases,
  type OrderStory,
  orderStories,
  trailOf,
} from "./story";

/* The store manager's screens. */

async function outletFor(user: User) {
  if (!user.outletId) throw new Error("No outlet on this account");
  const [o] = await db
    .select()
    .from(s.outlets)
    .where(eq(s.outlets.id, user.outletId));
  return o;
}

/** Orders on one delivery, including any a published plan moved off it. */
async function deliveryOrders(outletId: string, day: string) {
  return db
    .select()
    .from(s.orders)
    .where(
      and(
        eq(s.orders.outletId, outletId),
        or(eq(s.orders.deliveryDay, day), eq(s.orders.deferredFrom, day)),
        ne(s.orders.status, "draft"),
      ),
    );
}

export async function storeHeader(user: User) {
  const outlet = await outletFor(user);
  const today = now().slice(0, 10);
  const notes = await db
    .select()
    .from(s.notifications)
    .where(eq(s.notifications.audience, `outlet:${outlet.id}`))
    .orderBy(desc(s.notifications.at))
    .limit(20);
  return {
    outlet: { id: outlet.id, name: outlet.name, brand: outlet.brand },
    notifications: notes.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      link: n.link,
      at: stamp(n.at, today),
      unread: !n.readAt,
    })),
    unread: notes.filter((n) => !n.readAt).length,
  };
}

/* ---------- S1 Place order ---------- */

export async function orderForm(user: User) {
  const outlet = await outletFor(user);
  const t = now();
  const day = await orderingDay();
  const cutoff = cutoffFor(day);
  const temps = tempsFor(outlet.brand);

  // The store's own orders for the day; orders moved here by a plan are listed apart.
  const onDay = await db
    .select()
    .from(s.orders)
    .where(
      and(eq(s.orders.outletId, outlet.id), eq(s.orders.deliveryDay, day)),
    );
  const current = onDay.filter((o) => !o.deferredFrom);
  const carried = onDay.filter((o) => o.deferredFrom);
  // Orders a published plan took off this day.
  const movedOff = await db
    .select()
    .from(s.orders)
    .where(
      and(eq(s.orders.outletId, outlet.id), eq(s.orders.deferredFrom, day)),
    );
  // Last order on the same weekday, for "same as last time".
  const past = await db
    .select()
    .from(s.orders)
    .where(
      and(
        eq(s.orders.outletId, outlet.id),
        lt(s.orders.deliveryDay, day),
        ne(s.orders.status, "draft"),
        isNull(s.orders.deferredFrom),
      ),
    )
    .orderBy(desc(s.orders.deliveryDay));
  const sameDay = past.filter((o) => weekday(o.deliveryDay) === weekday(day));
  const lastByTemp = new Map<string, string>();
  for (const o of [...sameDay, ...past])
    if (!lastByTemp.has(o.temp)) lastByTemp.set(o.temp, o.id);
  // Lines of the current and last orders, for product quantities.
  const lineOrderIds = [
    ...current.map((o) => o.id),
    ...[...lastByTemp.values()],
  ];
  const lines = lineOrderIds.length
    ? await db
        .select()
        .from(s.orderLines)
        .where(inArray(s.orderLines.orderId, lineOrderIds))
    : [];
  const catalogue = new Map(
    await Promise.all(
      temps.map(
        async (temp) =>
          [temp, await activeProducts(outlet.brand, temp)] as const,
      ),
    ),
  );

  const sections = temps.map((temp) => {
    const order = current.find((o) => o.temp === temp);
    const last = past.find((o) => o.id === lastByTemp.get(temp));
    const moved = movedOff.find((o) => o.temp === temp);
    const products = catalogue.get(temp) ?? [];
    const mine = lines.filter((l) => l.orderId === order?.id);
    const before = lines.filter((l) => l.orderId === last?.id);
    const active = new Set(products.map((p) => p.id));
    return {
      temp,
      orderId: order?.id ?? orderIdFor(outlet.brand, day, outlet.id, temp),
      status: order?.status ?? null,
      /** "products" when dispatch keeps products for this brand and temperature. */
      mode: products.length ? ("products" as const) : ("totals" as const),
      units: order?.units ?? 0,
      weightKg: order?.weightKg ?? 0,
      volumeM3: order?.volumeM3 ?? 0,
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        weightKg: p.weightKg,
        volumeM3: p.volumeM3,
        qty: mine.find((l) => l.productId === p.id)?.cases ?? 0,
        last: before.find((l) => l.productId === p.id)?.cases ?? null,
      })),
      /** Lines on the current order that the product list no longer offers. */
      retired: mine
        .filter((l) => !l.productId || !active.has(l.productId))
        .map((l) => ({ name: l.name, qty: l.cases })),
      last: last
        ? {
            day: dayLabel(last.deliveryDay),
            units: last.units,
            weightKg: last.weightKg,
            volumeM3: last.volumeM3,
          }
        : null,
      moved: moved
        ? {
            id: moved.id,
            units: moved.units,
            to: dayLabel(moved.deferredTo ?? moved.deliveryDay),
          }
        : null,
    };
  });

  const history = (await outletHistory(db, [outlet.id], day)).get(outlet.id);
  const runs = await db
    .select()
    .from(s.serviceLog)
    .where(eq(s.serviceLog.outletId, outlet.id))
    .orderBy(desc(s.serviceLog.day));
  const runDays = [
    ...new Set(runs.filter((r) => r.day < day).map((r) => r.day)),
  ].slice(0, 4);
  const placed = current.filter((o) => o.status !== "draft");
  const stories = await orderStories(onDay.map((o) => o.id));
  const planned = [...stories.values()].find((st) => st.band);

  // A delivery before this one that is still under way stays in view.
  const openDay = await outletDay(outlet.id);
  const earlier = openDay < day ? await deliveryOrders(outlet.id, openDay) : [];
  const earlierStories = await orderStories(earlier.map((o) => o.id));
  const earlierPlanned = [...earlierStories.values()].find(
    (st) => st.band && st.order.deliveryDay === openDay,
  );
  return {
    outlet: {
      id: outlet.id,
      name: outlet.name,
      brand: outlet.brand,
      window: `${outlet.windowOpen}–${outlet.windowClose}`,
    },
    day,
    dayLabel: dayLabel(day),
    closesLabel: `${dayLabel(addDays(day, -1))} ${CUTOFF}`,
    nowLabel: `${dayLabel(t.slice(0, 10))} ${hhmm(t)}`,
    minutesLeft: Math.max(0, minutesBetween(t, cutoff)),
    sections,
    placed: placed.map((o) => ({
      id: o.id,
      temp: o.temp,
      at: o.placedAt ? stamp(o.placedAt, t.slice(0, 10)) : "",
      status: o.status,
      channel: o.channel,
    })),
    planned: planned
      ? {
          band: planned.band?.label ?? "",
          vehicleId: planned.trip?.vehicleId ?? "",
          tripNo: planned.trip?.tripNo ?? 1,
        }
      : null,
    carried: carried.map((o) => ({
      id: o.id,
      temp: o.temp,
      units: o.units,
      from: o.deferredFrom ? dayLabel(o.deferredFrom) : "",
      reason: o.deferReason,
    })),
    protection: protectionNote(history),
    earlier: earlier.length
      ? {
          day: openDay,
          dayLabel: dayLabel(openDay),
          orders: earlier.map((o) => ({
            id: o.id,
            temp: o.temp,
            status: o.status,
            movedTo:
              o.deliveryDay !== openDay && o.deferredTo
                ? dayLabel(o.deferredTo)
                : null,
          })),
          band: earlierPlanned?.band?.label ?? null,
          vehicleId: earlierPlanned?.trip?.vehicleId ?? null,
        }
      : null,
    lastRuns: runDays.map((d) => ({
      day: dayLabel(d),
      chilled:
        runs.find((r) => r.day === d && r.temp === "chilled")?.outcome ?? null,
      ambient:
        runs.find((r) => r.day === d && r.temp === "ambient")?.outcome ?? null,
    })),
  };
}

/** Why the outlet's orders go first, or that a skip is on record. */
function protectionNote(h: OutletHistory | undefined) {
  const skips = h?.consecutiveSkips ?? 0;
  if (skips >= 2) return `Skipped on the last ${skips} runs · planned first`;
  return skips === 1 ? "Skipped on the last run" : null;
}

/* ---------- S3 On the way ---------- */

export type DeliveryStatus =
  | "planned"
  | "deferred"
  | "live"
  | "arrived"
  | "degraded"
  | "delivered"
  | "received"
  | "failed"
  | "none";

/** Where an order stands on the delivery for `day`. */
function statusOf(st: OrderStory, day: string): DeliveryStatus {
  if (st.receipt) return "received";
  if (st.order.deliveryDay !== day) return "deferred";
  if (st.stop?.status === "failed") return "failed";
  const sp = st.stopProgress;
  const p = st.progress;
  if (st.stop?.status === "completed" || sp?.state === "done")
    return "delivered";
  if (p?.offline) return "degraded";
  if (sp?.arrivedAt != null) return "arrived";
  if (p && p.status === "on_road") return "live";
  if (st.plan) return "planned";
  return "none";
}

export async function todayView(user: User) {
  const outlet = await outletFor(user);
  const t = now();
  const day = await outletDay(outlet.id);
  const orders = await deliveryOrders(outlet.id, day);
  const stories = await orderStories(orders.map((o) => o.id));
  // Orders still on this delivery first, chilled before dry; moved ones last.
  const rank = (st: OrderStory) =>
    (st.order.deliveryDay === day ? 0 : 2) +
    (st.order.temp === "chilled" ? 0 : 1);
  const list = [...stories.values()].sort((a, b) => rank(a) - rank(b));
  const items = list.map((st) => {
    const status = statusOf(st, day);
    const p = st.progress;
    const sp = st.stopProgress;
    const driver = st.driverName
      ? st.driverName.split(" ")[0]
      : st.run
        ? `${st.run.vehicleId}`
        : "the driver";
    const note = (() => {
      switch (status) {
        case "planned":
          return {
            title: st.run
              ? `Leaves ${st.run.depot} at ${clockOf(st.run.depart)} on ${st.run.vehicleId}`
              : "Planned",
            body: st.stop?.seq != null ? `Stop ${st.stop.seq} on the trip` : "",
          };
        case "live":
          return {
            title: sp
              ? `Expected ${clockOf(sp.expected)}`
              : `${driver} is on the way`,
            body:
              sp && sp.expected > sp.windowClose
                ? "Behind your receiving window"
                : "Within your receiving window",
          };
        case "arrived":
          return {
            title: `${driver} arrived ${clockOn(p?.day ?? day, sp?.arrivedAt ?? 0)}`,
            body: `Unloading at the ${st.outlet.dockType === "rear_dock" ? "rear dock" : st.outlet.dockType === "mall_bay" ? "mall bay" : "kerb"}.`,
          };
        case "degraded":
          return {
            title: `No signal from ${st.run?.vehicleId ?? "the truck"} since ${p?.lastHeard != null ? clockOn(p.day, p.lastHeard) : "it left"}`,
            body: "",
          };
        case "delivered":
          return {
            title: `Delivered ${st.stop?.completedAt ? hhmm(st.stop.completedAt) : clockOn(p?.day ?? day, sp?.completedAt ?? 0)} by ${driver}`,
            body: "Photo and signature on record",
          };
        case "received":
          return {
            title: `You confirmed ${st.receipt?.received} of ${st.receipt?.expected} at ${st.receipt ? hhmm(st.receipt.confirmedAt) : ""}`,
            body: "",
          };
        case "deferred":
          return {
            title: `Moved to ${st.order.deferredTo ? dayLabel(st.order.deferredTo) : "the next run"}`,
            body: st.order.deferReason ?? "",
          };
        case "failed":
          return { title: "Not delivered", body: st.stop?.problem ?? "" };
        default:
          return {
            title: "Waiting for the plan",
            body: "",
          };
      }
    })();
    return {
      orderId: st.order.id,
      temp: st.order.temp,
      brand: st.order.brand,
      status,
      movedFrom:
        st.order.deferredFrom && st.order.deliveryDay === day
          ? dayLabel(st.order.deferredFrom)
          : null,
      band: st.band?.label ?? null,
      expected: sp ? clockOf(sp.expected) : null,
      note,
      trail: trailOf(st, "store"),
      canConfirm:
        !st.receipt &&
        ["delivered", "arrived", "degraded"].includes(status) &&
        (status !== "degraded" ||
          sp?.arrivedAt != null ||
          (p?.lastHeard != null && st.stop != null)),
      receipt: st.receipt
        ? { received: st.receipt.received, expected: st.receipt.expected }
        : null,
      vehicleId: st.run?.vehicleId ?? null,
      driverOnline: p ? !p.offline : true,
    };
  });
  return {
    outlet: {
      id: outlet.id,
      name: outlet.name,
      brand: outlet.brand,
      dock: outlet.dockType,
    },
    day,
    dayLabel: dayLabel(day),
    clock: hhmm(t),
    items,
    manager: user.name,
  };
}

/* ---------- S4 Confirm receipt ---------- */

export async function confirmView(user: User, orderId: string) {
  const outlet = await outletFor(user);
  const st = (await orderStories([orderId])).get(orderId);
  if (!st || st.order.outletId !== outlet.id) return null;
  const lines = st.lines.map((l) => {
    const short = st.shortfalls
      .filter((x) => x.orderLineId === l.id)
      .reduce((a, x) => a + x.cases, 0);
    const expected = l.cases - short;
    return {
      id: l.id,
      name: l.name,
      unit: l.unitLabel,
      expected,
      short,
      counted: st.receipt
        ? (st.receipt.counts[String(l.id)] ?? expected)
        : expected,
    };
  });
  const driverName = st.driverName
    ? st.driverName.split(" ")[0]
    : (st.run?.vehicleId ?? "the driver");
  const ready = canReceive(st);
  const sp = st.stopProgress;
  return {
    orderId,
    temp: st.order.temp,
    outlet: { id: outlet.id, name: outlet.name },
    ready,
    deliveredLine:
      st.stop?.status === "completed" && st.stop.completedAt
        ? `Delivered ${hhmm(st.stop.completedAt)} by ${driverName} · photo and signature on record`
        : sp?.state === "done"
          ? `Delivered ${clockOn(st.order.deliveryDay, sp.completedAt ?? 0)} by ${driverName} · photo and signature on record`
          : st.progress?.offline
            ? `Handover not synced from ${driverName}’s phone yet`
            : sp?.arrivedAt != null
              ? `${driverName} arrived ${clockOn(st.order.deliveryDay, sp.arrivedAt)} · unloading`
              : st.run
                ? `${st.run.vehicleId} leaves the depot at ${clockOf(st.run.depart)}`
                : "Not on a vehicle yet",
    lines,
    expected: lines.reduce((a, l) => a + l.expected, 0),
    shortCases: lines.reduce((a, l) => a + l.short, 0),
    receipt: st.receipt
      ? {
          at: hhmm(st.receipt.confirmedAt),
          received: st.receipt.received,
          expected: st.receipt.expected,
          note: st.receipt.note,
        }
      : null,
    driverOnline: st.progress ? !st.progress.offline : true,
    driverName,
  };
}

/** Goods can be counted once the truck is on its way or has delivered. */
export function canReceive(st: OrderStory) {
  if (st.receipt) return true;
  if (st.stop?.status === "completed" || st.stopProgress?.state === "done")
    return true;
  return Boolean(
    st.progress && ["on_road", "completed"].includes(st.progress.status),
  );
}

/* ---------- S5 Delivery record ---------- */

export async function recordView(user: User, orderId: string) {
  const outlet = await outletFor(user);
  // The record covers the outlet's orders on the same run, chilled and dry.
  const [anchor] = await db
    .select()
    .from(s.orders)
    .where(eq(s.orders.id, orderId));
  if (!anchor || anchor.outletId !== outlet.id) return null;
  const siblings = await db
    .select()
    .from(s.orders)
    .where(
      and(
        eq(s.orders.outletId, outlet.id),
        eq(s.orders.deliveryDay, anchor.deliveryDay),
        ne(s.orders.status, "draft"),
      ),
    );
  const stories = await orderStories(siblings.map((o) => o.id));
  const main = stories.get(orderId);
  if (!main) return null;
  const others = [...stories.values()].filter((x) => x.order.id !== orderId);
  const all = [main, ...others];

  const stopDone = (st: OrderStory) =>
    st.stop?.status === "completed" || st.stopProgress?.state === "done";
  const rows = all.flatMap((st) =>
    st.lines.map((l) => {
      const short = st.shortfalls
        .filter((x) => x.orderLineId === l.id)
        .reduce((a, x) => a + x.cases, 0);
      const loaded = l.cases - short;
      const released =
        Boolean(st.run?.releasedAt) || st.progress?.releasedAt != null;
      const deliveredKnown = stopDone(st);
      const onPhone =
        !deliveredKnown &&
        Boolean(st.progress?.offline) &&
        (st.stopProgress?.arrivedAt != null || false);
      const handed = st.stop?.counts?.[st.order.id];
      const handedAll = handed === undefined || handed === loadedCases(st);
      const received = st.receipt
        ? (st.receipt.counts[String(l.id)] ?? null)
        : null;
      const notes: string[] = [];
      if (short) notes.push(`${short} damaged at dock (credited)`);
      if (st.receipt && received !== null && received < loaded)
        notes.push(
          `${loaded - received} short at receipt${st.receipt.note ? ` · “${st.receipt.note}”` : ""}`,
        );
      if (st.receipt && received !== null && received > loaded)
        notes.push(`${received - loaded} extra at receipt`);
      return {
        key: `${st.order.id}-${l.id}`,
        orderId: st.order.id,
        temp: st.order.temp,
        name: l.name,
        ordered: l.cases,
        loaded: released ? loaded : null,
        loadedWarn: short > 0,
        delivered: deliveredKnown ? (handedAll ? loaded : null) : null,
        deliveredNote: onPhone
          ? "On the driver’s phone"
          : deliveredKnown && !handedAll
            ? `Order total ${handed}`
            : null,
        received,
        receivedWarn: received !== null && received !== loaded,
        notes,
        released,
        state: st.receipt ? "received" : released ? "loaded" : "pending",
      };
    }),
  );

  const runIds = [
    ...new Set(
      all.map((x) => x.run?.id).filter((x): x is string => Boolean(x)),
    ),
  ];
  const events = (
    await eventsFor({
      orderIds: all.map((x) => x.order.id),
      outletId: outlet.id,
      tripRunIds: runIds,
    })
  )
    .filter((e) => !e.tripRunId || e.outletId === outlet.id || !e.outletId)
    .filter(
      (e) =>
        e.outletId === outlet.id ||
        all.some((x) => x.order.id === e.orderId) ||
        (e.tripRunId &&
          runIds.includes(e.tripRunId) &&
          [
            "dock.released",
            "driver.accepted",
            "driver.departed",
            "driver.offline",
            "dock.loading",
          ].includes(e.kind)),
    )
    .sort((a, b) => cmpOps(a.at, b.at) || a.id - b.id);

  const evidence: {
    kind: string;
    title: string;
    meta: string;
    mediaId?: string | null;
  }[] = [];
  for (const st of all)
    for (const sf of st.shortfalls)
      evidence.push({
        kind: "photo",
        title: `Dock ${sf.photoId ? "photo" : "note"} · ${sf.cases} ${sf.reason} ${sf.cases === 1 ? "unit" : "units"}`,
        meta: `${st.loaderName?.split(" ")[0] ?? "Dock"} · ${hhmm(sf.recordedAt)}`,
        mediaId: sf.photoId,
      });
  if (main.run?.reeferTempC != null)
    evidence.push({
      kind: "temp",
      title: `Reefer at release ${main.run.reeferTempC.toFixed(1)} °C`,
      meta: `${main.run.vehicleId} · ${main.loaderName?.split(" ")[0] ?? "Dock"}${main.run.releasedAt ? ` · ${hhmm(main.run.releasedAt)}` : ""}`,
    });
  const stop = main.stop;
  if (stop?.signatureId)
    evidence.push({
      kind: "signature",
      title: "Signature at handover",
      meta: `${stop.receiverName ?? "Receiver"} · ${stop.completedAt ? hhmm(stop.completedAt) : ""}`,
      mediaId: stop.signatureId,
    });
  if (stop?.photoId)
    evidence.push({
      kind: "photo",
      title: "Handover photo",
      meta: `${main.driverName?.split(" ")[0] ?? "Driver"} · ${stop.completedAt ? hhmm(stop.completedAt) : ""}${stop.recordedOffline ? ` · recorded offline, sent ${stop.syncedAt ? hhmm(stop.syncedAt) : ""}` : ""}`,
      mediaId: stop.photoId,
    });
  if (stop?.tempC != null)
    evidence.push({
      kind: "temp",
      title: `Probe at handover ${stop.tempC.toFixed(1)} °C`,
      meta: stop.tempC <= 5 ? "Within 0 to 5 °C" : "Above 5 °C",
    });
  for (const st of all)
    if (st.receipt?.photoId)
      evidence.push({
        kind: "photo",
        title: "Store photo of the difference",
        meta: `${outlet.name} · ${hhmm(st.receipt.confirmedAt)}`,
        mediaId: st.receipt.photoId,
      });

  const pendingOnPhone = Boolean(main.progress?.offline);
  return {
    orderId,
    outlet: { id: outlet.id, name: outlet.name },
    dayLabel: dayLabel(anchor.deliveryDay),
    vehicleId: main.run?.vehicleId ?? null,
    temps: all.map((x) => x.order.temp),
    receivedAt: main.receipt ? hhmm(main.receipt.confirmedAt) : null,
    stages: trailOf(main, "store"),
    rows,
    events: events.map((e) => ({
      id: e.id,
      at: hhmm(e.at),
      day: dayLabel(e.at.slice(0, 10)),
      role: e.role,
      actor: e.actorName,
      text: e.text,
      source: e.source,
    })),
    evidence,
    credits: all.flatMap((st) =>
      st.shortfalls.map((sf) => ({
        ref: sf.creditRef,
        cases: sf.cases,
        reason: sf.reason,
        line: st.lines.find((l) => l.id === sf.orderLineId)?.name ?? "",
      })),
    ),
    pendingOnPhone,
    reconciliation: main.reconciliation
      ? {
          status: main.reconciliation.status,
          resolution: main.reconciliation.resolution,
          driver: main.reconciliation.driverCount,
          store: main.reconciliation.storeCount,
        }
      : null,
  };
}

/* ---------- S2 Deferral notice ---------- */

export async function noticeView(user: User, orderId: string) {
  const outlet = await outletFor(user);
  const today = now().slice(0, 10);
  const st = (await orderStories([orderId])).get(orderId);
  if (!st || st.order.outletId !== outlet.id) return null;
  // The delivery the order was taken off, and what is still on it.
  const from = st.order.deferredFrom ?? st.order.deliveryDay;
  const others = (await deliveryOrders(outlet.id, from)).filter(
    (o) => o.id !== orderId && o.deliveryDay === from,
  );
  const otherStories = await orderStories(others.map((o) => o.id));
  const [note] = await db
    .select()
    .from(s.notifications)
    .where(
      and(
        eq(s.notifications.audience, `outlet:${outlet.id}`),
        eq(s.notifications.orderId, orderId),
        eq(s.notifications.kind, "deferral"),
      ),
    )
    .orderBy(desc(s.notifications.at))
    .limit(1);
  const [depot] = await db
    .select()
    .from(s.depots)
    .where(eq(s.depots.id, outlet.depot));
  const [pin] = await db
    .select()
    .from(s.pins)
    .where(and(eq(s.pins.orderId, orderId), eq(s.pins.kind, "defer")));
  const [dispatcher] = await db
    .select()
    .from(s.users)
    .where(
      and(eq(s.users.role, "dispatcher"), eq(s.users.depot, outlet.depot)),
    );
  return {
    orderId,
    outlet: { id: outlet.id, name: outlet.name },
    dispatch: {
      name: dispatcher?.name ?? "Dispatch",
      role: `Dispatch · ${outlet.depot}`,
      phone: dispatcher?.phone ?? depot?.phone ?? null,
    },
    temp: st.order.temp,
    brand: st.order.brand,
    deferred: Boolean(st.order.deferredFrom),
    // A person's decision is shown in their words; the planner's is translated.
    byDispatcher: Boolean(pin),
    reason: pin ? (pin.reason ?? "") : plainReason(st.order.deferReason ?? ""),
    rawReason: st.order.deferReason,
    nextRun: st.order.deferredTo ? dayLabel(st.order.deferredTo) : null,
    dayLabel: dayLabel(from),
    toldAt: note ? stamp(note.at, today) : null,
    noticeId: note?.id ?? null,
    acknowledged: Boolean(note?.ackAt),
    stillComing: [...otherStories.values()].map((o) => ({
      orderId: o.order.id,
      temp: o.order.temp,
      status: o.order.status,
      band: o.band?.label ?? null,
      vehicleId: o.trip?.vehicleId ?? null,
    })),
  };
}

/** The dispatcher's reason, rewritten for the store. */
function plainReason(reason: string) {
  if (/reefer|fridge/i.test(reason))
    return "Every refrigerated truck was full on this run.";
  if (/van/i.test(reason))
    return "Only vans can reach your store, and they were full on this run.";
  if (/larger than any|heavier/i.test(reason))
    return "The order is larger than any truck. Dispatch will call to split it.";
  if (/window/i.test(reason))
    return "No truck could reach you inside your receiving window on this run.";
  return reason;
}

/* ---------- Receipts list ---------- */

export async function receiptsList(user: User) {
  const outlet = await outletFor(user);
  const day = await outletDay(outlet.id);
  const orders = await db
    .select()
    .from(s.orders)
    .where(and(eq(s.orders.outletId, outlet.id), ne(s.orders.status, "draft")))
    .orderBy(desc(s.orders.deliveryDay), desc(s.orders.id));
  const receipts = orders.length
    ? await db
        .select()
        .from(s.receipts)
        .where(
          inArray(
            s.receipts.orderId,
            orders.map((o) => o.id),
          ),
        )
    : [];
  return orders.map((o) => {
    const r = receipts.find((x) => x.orderId === o.id);
    return {
      id: o.id,
      day: dayLabel(o.deliveryDay),
      current: o.deliveryDay === day,
      temp: o.temp,
      units: o.units,
      status: o.status,
      movedFrom: o.deferredFrom ? dayLabel(o.deferredFrom) : null,
      deferReason: o.deferReason,
      received: r ? `${r.received} of ${r.expected}` : null,
    };
  });
}
