"use client";

import { ROLE_LABEL, type Role } from "@relay/domain";
import {
  ChevronDown,
  KeyRound,
  MoreHorizontal,
  Power,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import {
  createUserAction,
  resetPasswordAction,
  setUserActiveAction,
} from "@/app/actions/dispatch";
import { initialsOf } from "@/components/account-menu";
import { Menu, toast } from "@/components/interact";
import { Avatar, Button, cx, Pill } from "@/components/ui";
import type { PeopleData } from "@/server/admin";
import { field, SearchField, Segmented, Sheet, tap } from "./bits";

/* Accounts: who can sign in, where they work, and their passwords. */

type Person = PeopleData["users"][number];
type Filter = "all" | Role;

const ROLES: Role[] = ["dispatcher", "loader", "driver", "store"];

const first = (name: string) => name.split(" ")[0];

export function People({
  data,
  me,
  depot,
}: {
  data: PeopleData;
  me: number;
  depot: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<{
    kind: "password" | "off";
    user: Person;
  } | null>(null);
  const [pending, start] = useTransition();

  const where = (u: Person) => {
    if (u.role === "driver" && u.vehicleId) {
      const v = data.vehicles.find((x) => x.id === u.vehicleId);
      return v ? `${v.id} · ${vehicleKind(v)}` : u.vehicleId;
    }
    if (u.role === "store" && u.outletId) {
      const o = data.outlets.find((x) => x.id === u.outletId);
      return o ? `${o.id} · ${o.name}` : u.outletId;
    }
    return u.depot ? `${u.depot} depot` : "";
  };

  const needle = query.trim().toLowerCase();
  const rows = data.users.filter(
    (u) =>
      (filter === "all" || u.role === filter) &&
      (!needle ||
        [u.name, u.email, u.phone ?? "", where(u)]
          .join(" ")
          .toLowerCase()
          .includes(needle)),
  );
  const count = (r: Role) => data.users.filter((u) => u.role === r).length;

  const switchOn = (u: Person) =>
    start(async () => {
      const res = await setUserActiveAction(u.id, true);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(`${first(u.name)}’s account is on`, { tone: "success" });
      router.refresh();
    });

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5 max-xl:px-4 max-xl:py-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="t-title">People</h1>
          <Pill tone="neutral" size="sm">
            {data.users.length}
          </Pill>
        </div>
        <Button
          variant="primary"
          icon={UserPlus}
          onClick={() => setAdding(true)}
          className={cx(tap, "ml-auto")}
        >
          Add person
        </Button>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-2 px-5 pt-4 pb-3 max-xl:px-4">
        <Segmented
          label="Filter by role"
          value={filter}
          onChange={setFilter}
          className="max-md:w-full"
          options={[
            { value: "all", label: "All", count: String(data.users.length) },
            {
              value: "dispatcher",
              label: "Dispatch",
              count: String(count("dispatcher")),
            },
            { value: "loader", label: "Dock", count: String(count("loader")) },
            {
              value: "driver",
              label: "Drivers",
              count: String(count("driver")),
            },
            { value: "store", label: "Stores", count: String(count("store")) },
          ]}
        />
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search name, email, vehicle, outlet"
          className="ml-auto w-[260px] max-md:ml-0 max-md:w-full"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin max-xl:overflow-visible">
        <div className="min-w-[860px] max-xl:min-w-0 max-xl:border-t max-xl:border-line">
          <div className="sticky top-0 z-10 flex h-[34px] items-center gap-3 border-y border-line bg-subtle px-5 t-caption-m text-fg-3 max-xl:hidden">
            <span className="min-w-0 flex-1">Name</span>
            <span className="w-[112px] shrink-0">Role</span>
            <span className="w-[220px] shrink-0">Where</span>
            <span className="w-[132px] shrink-0">Phone</span>
            <span className="w-[72px] shrink-0">Status</span>
            <span className="w-8 shrink-0" />
          </div>
          {rows.map((u) => (
            <PersonRow
              key={u.id}
              u={u}
              where={where(u)}
              self={u.id === me}
              busy={pending}
              onPassword={() => setTarget({ kind: "password", user: u })}
              onToggle={() =>
                u.active ? setTarget({ kind: "off", user: u }) : switchOn(u)
              }
            />
          ))}
          {rows.length === 0 && (
            <p className="px-5 py-10 text-center t-small text-fg-3">
              {data.users.length ? "No one matches." : "No accounts yet."}
            </p>
          )}
        </div>
      </div>

      <AddPerson
        open={adding}
        onClose={() => setAdding(false)}
        data={data}
        depot={depot}
      />
      <SetPassword
        user={target?.kind === "password" ? target.user : null}
        onClose={() => setTarget(null)}
      />
      <SwitchOff
        user={target?.kind === "off" ? target.user : null}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

const vehicleKind = (v: PeopleData["vehicles"][number]) =>
  `${v.temp === "reefer" ? "Reefer" : "Dry"} ${v.type}`;

function PersonRow({
  u,
  where,
  self,
  busy,
  onPassword,
  onToggle,
}: {
  u: Person;
  where: string;
  self: boolean;
  busy: boolean;
  onPassword: () => void;
  onToggle: () => void;
}) {
  const actions = (
    <Menu
      align="end"
      width={220}
      items={[
        { label: "Set a new password", icon: KeyRound, onSelect: onPassword },
        self
          ? {
              label: "Switch off",
              detail: "This is your account",
              icon: Power,
              disabled: true,
              onSelect: () => {},
            }
          : {
              label: u.active ? "Switch off" : "Switch on",
              icon: Power,
              danger: u.active,
              disabled: busy,
              onSelect: onToggle,
            },
      ]}
      trigger={(p) => (
        <button
          type="button"
          {...p}
          aria-label={`Actions for ${u.name}`}
          className="inline-flex size-8 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-subtle hover:text-fg max-xl:size-11 max-xl:rounded-[10px]"
        >
          <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden />
        </button>
      )}
    />
  );
  const status = u.active ? (
    <Pill tone="success" size="sm">
      Active
    </Pill>
  ) : (
    <Pill tone="offline" size="sm">
      Off
    </Pill>
  );
  return (
    <div
      className={cx(
        "border-b border-line",
        !u.active && "bg-subtle/50 text-fg-3",
      )}
    >
      {/* Desktop */}
      <div className="flex h-[56px] items-center gap-3 px-5 max-xl:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar
            initials={initialsOf(u.name)}
            size={30}
            tone={u.active ? "accent" : "neutral"}
          />
          <div className="min-w-0">
            <p className="truncate t-small-m">
              {u.name}
              {self && <span className="font-normal text-fg-3"> · you</span>}
            </p>
            <p className="truncate t-caption text-fg-3">{u.email}</p>
          </div>
        </div>
        <span className="w-[112px] shrink-0 t-small">{ROLE_LABEL[u.role]}</span>
        <span className="w-[220px] shrink-0 truncate t-small">{where}</span>
        <span
          className={cx(
            "w-[132px] shrink-0 t-mono",
            u.phone ? "text-fg-2" : "text-fg-3",
          )}
        >
          {u.phone ?? "No phone"}
        </span>
        <span className="w-[72px] shrink-0">{status}</span>
        <span className="w-8 shrink-0">{actions}</span>
      </div>

      {/* Phone and tablet */}
      <div className="flex items-start gap-3 py-3 pr-2 pl-4 xl:hidden">
        <Avatar
          initials={initialsOf(u.name)}
          size={36}
          tone={u.active ? "accent" : "neutral"}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <p className="flex items-center gap-2">
            <span className="min-w-0 truncate t-body-m">
              {u.name}
              {self && <span className="font-normal text-fg-3"> · you</span>}
            </span>
            {!u.active && status}
          </p>
          <p className="truncate t-small text-fg-2">
            {ROLE_LABEL[u.role]}
            {where ? ` · ${where}` : ""}
          </p>
          <p className="truncate t-caption text-fg-3">
            {u.email}
            {u.phone ? ` · ${u.phone}` : ""}
          </p>
        </div>
        <div className="-mt-1">{actions}</div>
      </div>
    </div>
  );
}

/* ---------- Forms ---------- */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="t-small-m">{label}</span>
        {hint}
      </div>
      {children}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <span className="relative flex">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(field, "w-full appearance-none pr-8")}
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={1.8}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-3"
        aria-hidden
      />
    </span>
  );
}

/** A readable temporary password: no look-alike characters. */
function makePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = new Uint32Array(10);
  crypto.getRandomValues(pick);
  return Array.from(pick, (n) => chars[n % chars.length]).join("");
}

function AddPerson({
  open,
  onClose,
  data,
  depot,
}: {
  open: boolean;
  onClose: () => void;
  data: PeopleData;
  depot: string;
}) {
  const router = useRouter();
  const blank = {
    name: "",
    email: "",
    role: "driver" as Role,
    phone: "",
    password: "",
    depot: data.depots.some((d) => d.id === depot)
      ? depot
      : (data.depots[0]?.id ?? ""),
    vehicleId: "",
    outletId: "",
  };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const close = () => {
    onClose();
    setForm(blank);
    setError(null);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createUserAction({
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone || undefined,
        password: form.password,
        depot:
          form.role === "dispatcher" || form.role === "loader"
            ? form.depot || undefined
            : undefined,
        vehicleId: form.role === "driver" ? form.vehicleId : undefined,
        outletId: form.role === "store" ? form.outletId : undefined,
      });
      if (!res.ok) return setError(res.error);
      toast(`Added ${form.name.trim()}`, {
        detail: `${ROLE_LABEL[form.role]} · ${form.email.trim()}`,
        tone: "success",
      });
      close();
      router.refresh();
    });

  const byDepot = <T extends { depot: string }>(xs: T[]) =>
    data.depots
      .map((d) => ({ d, items: xs.filter((x) => x.depot === d.id) }))
      .filter((g) => g.items.length);

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Add a person"
      width={480}
      actions={
        <>
          <Button onClick={close} className={cx(tap, "max-xl:order-last")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={submit}
            className={tap}
          >
            {pending ? "Adding" : "Add person"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name">
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoComplete="off"
            className={field}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="off"
            className={field}
          />
        </Field>
        <Field label="Role">
          <div className="grid grid-cols-2 gap-1.5 sm:flex">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={form.role === r}
                onClick={() => set("role", r)}
                className={cx(
                  "h-8 rounded-lg border px-2.5 t-small-m whitespace-nowrap transition-colors sm:flex-1 max-xl:h-11 max-xl:rounded-[10px]",
                  form.role === r
                    ? "border-accent bg-accent-tint text-accent-text"
                    : "border-line-strong bg-surface text-fg-2 hover:text-fg",
                )}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </Field>
        {(form.role === "dispatcher" || form.role === "loader") &&
          data.depots.length === 0 && (
            <Field label="Depot">
              <p className="t-small text-fg-3">No depots yet</p>
            </Field>
          )}
        {(form.role === "dispatcher" || form.role === "loader") &&
          data.depots.length > 0 && (
            <Field label="Depot">
              <Select
                label="Depot"
                value={form.depot}
                onChange={(v) => set("depot", v)}
              >
                {data.depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        {form.role === "driver" && data.vehicles.length === 0 && (
          <Field label="Vehicle">
            <p className="t-small text-fg-3">No vehicles yet</p>
          </Field>
        )}
        {form.role === "driver" && data.vehicles.length > 0 && (
          <Field label="Vehicle">
            <Select
              label="Vehicle"
              value={form.vehicleId}
              onChange={(v) => set("vehicleId", v)}
            >
              <option value="">Choose a vehicle</option>
              {byDepot(data.vehicles).map(({ d, items }) => (
                <optgroup key={d.id} label={d.name}>
                  {items.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} · {vehicleKind(v)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        )}
        {form.role === "store" && data.outlets.length === 0 && (
          <Field label="Outlet">
            <p className="t-small text-fg-3">No outlets yet</p>
          </Field>
        )}
        {form.role === "store" && data.outlets.length > 0 && (
          <Field label="Outlet">
            <Select
              label="Outlet"
              value={form.outletId}
              onChange={(v) => set("outletId", v)}
            >
              <option value="">Choose an outlet</option>
              {byDepot(data.outlets).map(({ d, items }) => (
                <optgroup key={d.id} label={d.name}>
                  {items.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id} · {o.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label="Phone"
          hint={<span className="t-caption text-fg-3">Optional</span>}
        >
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="077 123 4567"
            autoComplete="off"
            className={field}
          />
        </Field>
        <Field
          label="Temporary password"
          hint={
            <button
              type="button"
              onClick={() => set("password", makePassword())}
              className="ml-auto rounded-md px-1.5 py-0.5 t-caption-m text-accent-text hover:bg-accent-tint max-xl:py-1.5"
            >
              Generate
            </button>
          }
        >
          <input
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className={cx(field, "font-mono")}
          />
          <span className="t-caption text-fg-3">At least 8 characters</span>
        </Field>
        {error && <p className="t-small text-danger-text">{error}</p>}
        {/* Enter submits the form. */}
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function SetPassword({
  user,
  onClose,
}: {
  user: Person | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => {
    onClose();
    setPassword("");
    setError(null);
  };
  const save = () =>
    start(async () => {
      if (!user) return;
      setError(null);
      const res = await resetPasswordAction(user.id, password);
      if (!res.ok) return setError(res.error);
      toast(`New password set for ${first(user.name)}`, { tone: "success" });
      close();
    });
  return (
    <Sheet
      open={Boolean(user)}
      onClose={close}
      title={`New password for ${user ? first(user.name) : ""}`}
      description={user?.email}
      width={420}
      actions={
        <>
          <Button onClick={close} className={cx(tap, "max-xl:order-last")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pending || password.length < 8}
            onClick={save}
            className={tap}
          >
            {pending ? "Saving" : "Set password"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length >= 8) save();
        }}
      >
        <div className="flex items-center gap-2">
          <span className="t-small-m">Temporary password</span>
          <button
            type="button"
            onClick={() => setPassword(makePassword())}
            className="ml-auto rounded-md px-1.5 py-0.5 t-caption-m text-accent-text hover:bg-accent-tint max-xl:py-1.5"
          >
            Generate
          </button>
        </div>
        <input
          aria-label="Temporary password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={cx(field, "font-mono")}
        />
        <span className="t-caption text-fg-3">At least 8 characters</span>
        {error && <p className="t-small text-danger-text">{error}</p>}
      </form>
    </Sheet>
  );
}

function SwitchOff({
  user,
  onClose,
}: {
  user: Person | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const off = () =>
    start(async () => {
      if (!user) return;
      const res = await setUserActiveAction(user.id, false);
      if (!res.ok) return toast(res.error, { tone: "warning" });
      toast(`${first(user.name)}’s account is off`);
      onClose();
      router.refresh();
    });
  return (
    <Sheet
      open={Boolean(user)}
      onClose={onClose}
      title={`Switch off ${user ? first(user.name) : ""}’s account?`}
      description="They are signed out and can’t sign in until it is switched on again."
      width={420}
      actions={
        <>
          <Button onClick={onClose} className={cx(tap, "max-xl:order-last")}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={off}
            className={tap}
          >
            Switch off
          </Button>
        </>
      }
    />
  );
}
