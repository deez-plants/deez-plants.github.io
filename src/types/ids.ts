/**
 * Branded scalars. FIELD_DEFINITIONS.md section 2.
 *
 * Dates are branded because the spec mixes three formats and they must never be
 * compared to each other: `YYYY-MM-DD` is the stored form and the only one that
 * sorts; `MMM DD`, `MMM DD YYYY` and `MMM YYYY` are render-edge output. A bare
 * `string` type would let a display date reach a comparison and silently lose.
 */

declare const brand: unique symbol;
type Brand<T, K extends string> = T & { readonly [brand]: K };

/** `NNN-XXX`. Assigned once, permanent, never reused — not even after archiving. */
export type PlantId = Brand<string, 'PlantId'>;
/** `PKG-YYYY-MM-DD-N`. */
export type PackageId = Brand<string, 'PackageId'>;
/** `SES-YYYY-MM-DD-N`. */
export type SessionId = Brand<string, 'SessionId'>;
/** `INS-YYYY-MM-DD-N`. */
export type InstructionId = Brand<string, 'InstructionId'>;
/** Unique across devices — the merge key (section 8). See DECISION 5 below. */
export type EventId = Brand<string, 'EventId'>;
/** `NNN-XXX_YYYY-MM-DD_HHMM_NN.jpg` — the filename is the identity (section 6b). */
export type MediaId = Brand<string, 'MediaId'>;
/** Generated once per install. Not in the spec; needed by section 8. */
export type DeviceId = Brand<string, 'DeviceId'>;

/** `YYYY-MM-DD`, a local civil date with no time zone. The only comparable form. */
export type ISODate = Brand<string, 'ISODate'>;
/** `HH:MM`, 24h, local. */
export type ClockTime = Brand<string, 'ClockTime'>;
/**
 * Days since 1970-01-01, computed from the calendar fields by integer
 * arithmetic — never via `new Date('2026-09-02')`, which parses as UTC midnight
 * and shifts the day for anyone west of Greenwich. All interval maths runs here.
 */
export type DayNumber = Brand<number, 'DayNumber'>;

export const PLANT_ID_RE = /^\d{3}-[A-Z]{3}$/;
export const PACKAGE_ID_RE = /^PKG-\d{4}-\d{2}-\d{2}-\d+$/;
export const SESSION_ID_RE = /^SES-\d{4}-\d{2}-\d{2}-\d+$/;
export const INSTRUCTION_ID_RE = /^INS-\d{4}-\d{2}-\d{2}-\d+$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const CLOCK_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MEDIA_ID_RE = /^\d{3}-[A-Z]{3}_\d{4}-\d{2}-\d{2}_\d{4}_\d{2}\.jpg$/;
