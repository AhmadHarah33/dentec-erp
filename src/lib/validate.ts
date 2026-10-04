/**
 * Runtime checks for what a browser sends to a server action.
 *
 * TypeScript types are erased at the boundary: a client can send any shape,
 * with extra fields (`status`, `number`, `id`, `consumed`…), strings where
 * numbers belong, and `NaN` or `Infinity` — server actions serialise both.
 * Postgres will not catch those (`NaN > 0` is true for `numeric`), and the
 * stock ledger is append-only, so a poisoned row cannot be removed again.
 *
 * Every reader either returns a clean value or throws `Invalid`; `parse()`
 * turns that into a `Result` the action can return. Parsers build a NEW
 * object from named fields, so anything not listed is dropped.
 */

import { fail, ok, type Result } from "@/app/actions/shared";

export class Invalid extends Error {
  constructor(readonly field: string) {
    super(`invalid ${field}`);
  }
}

function bad(field: string): never {
  throw new Invalid(field);
}

export type Obj = Record<string, unknown>;

export function obj(x: unknown, field: string): Obj {
  if (typeof x !== "object" || x === null || Array.isArray(x)) bad(field);
  return x as Obj;
}

export function str(x: unknown, field: string, max = 500): string {
  if (typeof x !== "string" || x.length > max) bad(field);
  return x as string;
}

/** A reference to another record. May be empty — the action decides whether that is allowed. */
export function ref(x: unknown, field: string): string {
  return str(x ?? "", field, 100);
}

/** A reference that may be absent: null, undefined and "" all read as null. */
export function nullableRef(x: unknown, field: string): string | null {
  if (x === null || x === undefined || x === "") return null;
  return str(x, field, 100);
}

export function bool(x: unknown, field: string): boolean {
  if (typeof x !== "boolean") bad(field);
  return x as boolean;
}

interface NumOpts {
  min?: number;
  max?: number;
  /** Strictly greater than this. */
  gt?: number;
  int?: boolean;
}

/** A finite number inside bounds. Defaults: 0 ≤ n ≤ 1e12 — pass `min` for anything that may be negative. */
export function num(x: unknown, field: string, o: NumOpts = {}): number {
  if (typeof x !== "number" || !Number.isFinite(x)) bad(field);
  const n = x as number;
  if (n < (o.min ?? 0) || n > (o.max ?? 1e12)) bad(field);
  if (o.gt !== undefined && n <= o.gt) bad(field);
  if (o.int && !Number.isInteger(n)) bad(field);
  return n;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date as "YYYY-MM-DD". */
export function date(x: unknown, field: string): string {
  const s = str(x, field, 10);
  if (!DATE.test(s)) bad(field);
  const d = new Date(s + "T00:00:00Z");
  const year = d.getUTCFullYear();
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s || year < 1900 || year > 2200) bad(field);
  return s;
}

export function oneOf<T extends string>(x: unknown, field: string, allowed: readonly T[]): T {
  if (typeof x !== "string" || !allowed.includes(x as T)) bad(field);
  return x as T;
}

export function arr<T>(x: unknown, field: string, max: number, fn: (item: unknown, index: number) => T): T[] {
  if (!Array.isArray(x) || x.length > max) bad(field);
  return (x as unknown[]).map(fn);
}

/**
 * `{ [key]: parsed }` when the caller sent that key, `{}` when it did not.
 * Lets an update leave an omitted field alone while a form that sends the key
 * (even as undefined, to clear it) still overwrites it.
 */
export function optional<K extends string, T>(o: Obj, key: K, fn: (x: unknown) => T): { [P in K]?: T } {
  if (!(key in o)) return {};
  const value = o[key];
  return { [key]: value === null || value === undefined ? undefined : fn(value) } as { [P in K]?: T };
}

/** Run a parser; a rejected field becomes a Result the action can return as it is. */
export function parse<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (e) {
    if (e instanceof Invalid) return fail("msg.error", `invalid:${e.field}`);
    throw e;
  }
}
