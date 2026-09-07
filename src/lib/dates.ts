import type { DayNumber, ISODate } from '../types/ids';
import { ISO_DATE_RE } from '../types/ids';
import type { Season } from '../types/plant';

/**
 * Civil-date arithmetic. Everything here is pure and none of it constructs a
 * `Date`, deliberately.
 *
 * `new Date('2026-09-02')` parses as UTC midnight, so west of Greenwich it is
 * still Sep 1 locally — every interval, due date and 90-day staleness check
 * would be a day out for half the year. The conversions below (Howard Hinnant's
 * days-from-civil) work on the calendar fields directly and are exact for any
 * date the app will ever see.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function isISODate(s: string): s is ISODate {
  return ISO_DATE_RE.test(s);
}

function parts(d: ISODate): [number, number, number] {
  return [
    Number(d.slice(0, 4)),
    Number(d.slice(5, 7)),
    Number(d.slice(8, 10)),
  ];
}

/** Days since 1970-01-01. */
export function toDay(d: ISODate): DayNumber {
  let [y, m, day] = parts(d);
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return (era * 146097 + doe - 719468) as DayNumber;
}

export function fromDay(n: DayNumber): ISODate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}` as ISODate;
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromDay((toDay(d) + n) as DayNumber);
}

/** `b - a`, in whole days. Positive when `b` is later. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toDay(b) - toDay(a);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return toDay(a) <= toDay(b) ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return toDay(a) >= toDay(b) ? a : b;
}

/**
 * Section 4: the summer figure is in force March to October, the winter figure
 * November to February.
 */
export function seasonOf(d: ISODate): Season {
  const m = Number(d.slice(5, 7));
  return m >= 3 && m <= 10 ? 'summer' : 'winter';
}

/* -------------------------------------------------------------------------- */
/* Render-edge formatting. Output is display-only and never compared or sorted. */
/* -------------------------------------------------------------------------- */

/** `MMM DD` — health_confirmed, health_changed, last_checked. */
export function formatDayMonth(d: ISODate): string {
  const [, m, day] = parts(d);
  return `${MONTHS[m - 1]} ${String(day).padStart(2, '0')}`;
}

/** `MMM DD YYYY` — archived_date. */
export function formatDayMonthYear(d: ISODate): string {
  const [y] = parts(d);
  return `${formatDayMonth(d)} ${y}`;
}

/** `MMM YYYY` — acquired. */
export function formatMonthYear(d: ISODate): string {
  const [y, m] = parts(d);
  return `${MONTHS[m - 1]} ${y}`;
}

/** `MMM` alone — the adherence-history bar chart's month axis (screen 07),
    where the year is given once in the subtitle rather than per bar. */
export function monthAbbr(d: ISODate): string {
  const [, m] = parts(d);
  return MONTHS[m - 1];
}

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** `Month YYYY` — the care-calendar's month-section headers (screens 26/27). */
export function formatMonthFull(d: ISODate): string {
  const [y, m] = parts(d);
  return `${FULL_MONTHS[m - 1]} ${y}`;
}

/** The 1st of `d`'s own month. */
export function monthStart(d: ISODate): ISODate {
  const [y, m] = parts(d);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01` as ISODate;
}

/** The 1st of the month `n` months from `d`'s month (`n` may be negative).
    Always normalises to day 1 — this is month arithmetic, not date arithmetic. */
export function shiftMonths(d: ISODate, n: number): ISODate {
  const [y, m] = parts(d);
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = total - yy * 12 + 1;
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-01` as ISODate;
}

/** How many days are in `d`'s own month. */
export function daysInMonth(d: ISODate): number {
  const start = monthStart(d);
  return daysBetween(start, shiftMonths(start, 1));
}

/** 0 (Sun) - 6 (Sat) for the 1st of `d`'s own month. 1970-01-01 (day 0 in
    `toDay`'s epoch) was a Thursday, index 4. */
export function weekdayOfMonthStart(d: ISODate): number {
  const day0 = toDay(monthStart(d));
  return ((day0 % 7) + 7 + 4) % 7;
}

/**
 * Section 3b: "the shortest honest unit: 6d, 3wk, 4mo". A delta without its
 * interval is misleading, so the score block always pairs the two.
 */
export function formatElapsed(days: number): string {
  const n = Math.abs(days);
  if (n < 14) return `${n}d`;
  if (n < 70) return `${Math.round(n / 7)}wk`;
  return `${Math.round(n / 30.44)}mo`;
}

/** `5 days ago` / `Yesterday` / `Today` — the History screen's entry rows
    (DESIGN_REFERENCE.md screen 24), always paired with `formatDayMonth` so
    the absolute date is never lost. */
export function formatRelativeDays(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/**
 * The only impure function in this module, and the only place the app reads the
 * clock. Callers pass the result into `derive` as `as_of`; `derive` itself never
 * calls this.
 */
export function todayISO(): ISODate {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` as ISODate;
}
