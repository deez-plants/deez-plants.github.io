/**
 * The icon set.
 *
 * These paths are the owner's own icons, lifted from the `ICONS` table in
 * `Deez Plants.dc.html`. `CLAUDE.md` says never to port the mock's code —
 * this is the one thing in that file that isn't code. The paths are artwork,
 * and they are the only copy of it that exists.
 *
 * Every icon draws on a 24x24 grid and takes its colour from `currentColor`,
 * so an icon inherits whatever the surrounding text is using and never needs
 * a colour prop. Some are a filled shape, some a stroked line, some both.
 */

interface IconDef {
  /** Filled path. */
  f?: string;
  /** Stroked path. */
  s?: string;
  /** Stroke width, when there is a stroked path. */
  sw?: number;
}

const ICONS = {
  water: { f: 'M12 2.5S5.2 10.1 5.2 14.5a6.8 6.8 0 0 0 13.6 0c0-4.4-6.8-12-6.8-12zm-3.1 9.9a1.5 1.5 0 0 1 1.5 1.5v3.4a1.5 1.5 0 0 1-3 0v-3.4a1.5 1.5 0 0 1 1.5-1.5z' },
  feed: { f: 'M20.5 3C10 3 3.5 8.4 3.5 15.4c0 1.8.5 3.4 1.4 4.7l2-2.4c1.9-3.4 5.2-6 9.1-7.1-3.6 1.9-6.3 4.7-7.7 8 1.1.6 2.4.9 3.8.9C18.6 19.5 20.5 11.5 20.5 3z' },
  light: {
    f: 'M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6z',
    s: 'M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19',
    sw: 2.4,
  },
  pot: { f: 'M3.5 6.5h17L18.4 20H5.6zM4 9.6h16l-.35 2.2H4.35z' },
  prune: { s: 'M6 3l7.2 10.6M18 3l-7.2 10.6M8.4 15.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM15.6 15.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z', sw: 2.4 },
  photo: { f: 'M9 3h6l1.3 2.4H20a2.2 2.2 0 0 1 2.2 2.2v11A2.2 2.2 0 0 1 20 20.8H4A2.2 2.2 0 0 1 1.8 18.6v-11A2.2 2.2 0 0 1 4 5.4h3.7zm3 5.6a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zm0 2.4a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z' },
  inspect: { s: 'M10.6 4.2a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8zM15.4 15.4L21 21', sw: 2.4 },
  support: { f: 'M12 2.5a1.4 1.4 0 0 1 1.4 1.4v16.2a1.4 1.4 0 0 1-2.8 0V3.9A1.4 1.4 0 0 1 12 2.5zM5.2 10.6l13.4-3.3.6 2.6-13.4 3.3z' },
  pest: {
    f: 'M12 7.8c2.65 0 4.8 2.78 4.8 6.2s-2.15 6.2-4.8 6.2-4.8-2.78-4.8-6.2 2.15-6.2 4.8-6.2zM12 3.8a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z',
    s: 'M7.2 10.4L3.4 8.2M7.2 14.4H3.2M7.2 18.4L3.4 20.6M16.8 10.4l3.8-2.2M16.8 14.4h4M16.8 18.4l3.8 2.2M10.2 4.6L8.4 2M13.8 4.6L15.6 2',
    sw: 2,
  },
  trend: { s: 'M3 17.5l5.4-5.4 3.4 3.4L20.4 7M15.4 7H21v5.6', sw: 2.6 },
  environment: { f: 'M12 2.2a2 2 0 0 1 2 2v9.5a4.6 4.6 0 1 1-4 0V4.2a2 2 0 0 1 2-2zm0 12.9a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM15.2 5.4h3.2v1.6h-3.2zM15.2 9.4h3.2v1.6h-3.2z' },
  reminder: { f: 'M12 2.4a5.9 5.9 0 0 0-5.9 5.9c0 5.4-2.2 7-2.2 7h16.2s-2.2-1.6-2.2-7A5.9 5.9 0 0 0 12 2.4z', s: 'M9.6 18a2.4 2.4 0 0 0 4.8 0', sw: 2.2 },
  repot: { f: 'M3.5 6.5h17L18.4 20H5.6zM4 9.6h16l-.35 2.2H4.35z', s: 'M12 6V2.6M12 2.6c-2 0-3.2 1.2-3.2 2.6M12 2.6c2 0 3.2 1.2 3.2 2.6', sw: 2 },
  home: { f: 'M11.1 2.9a1.4 1.4 0 0 1 1.8 0l8 6.8a1.4 1.4 0 0 1 .5 1.1v9a1.6 1.6 0 0 1-1.6 1.6h-4.4v-6.2H8.6v6.2H4.2A1.6 1.6 0 0 1 2.6 19.8v-9a1.4 1.4 0 0 1 .5-1.1z' },
  list: { f: 'M3.4 4.6h17.2v2.9H3.4zM3.4 10.6h17.2v2.9H3.4zM3.4 16.6h17.2v2.9H3.4z' },
  recdot: { f: 'M12 4.6a7.4 7.4 0 1 1 0 14.8 7.4 7.4 0 0 1 0-14.8z' },
  add: { f: 'M12 3a1.6 1.6 0 0 1 1.6 1.6v5.8h5.8a1.6 1.6 0 0 1 0 3.2h-5.8v5.8a1.6 1.6 0 0 1-3.2 0v-5.8H4.6a1.6 1.6 0 0 1 0-3.2h5.8V4.6A1.6 1.6 0 0 1 12 3z' },
  pkg: { f: 'M12 2.2l8.6 4.4v10.8L12 21.8 3.4 17.4V6.6zM12 5.1L6.6 7.8 12 10.6l5.4-2.8zM5.4 9.5v6.7l5.6 2.9v-6.7zm13.2 0l-5.6 2.9v6.7l5.6-2.9z' },
  apply: { f: 'M12 2.6a1.6 1.6 0 0 1 1.6 1.6v8.1l2.5-2.5a1.6 1.6 0 1 1 2.3 2.3l-5.3 5.2a1.6 1.6 0 0 1-2.2 0l-5.3-5.2a1.6 1.6 0 1 1 2.3-2.3l2.5 2.5V4.2A1.6 1.6 0 0 1 12 2.6z', s: 'M4.4 19.8h15.2', sw: 2.6 },
  mic: { f: 'M12 2.4a3.2 3.2 0 0 1 3.2 3.2v5.6a3.2 3.2 0 0 1-6.4 0V5.6A3.2 3.2 0 0 1 12 2.4z', s: 'M5.6 10.8a6.4 6.4 0 0 0 12.8 0M12 17.4V21.4M8.6 21.4h6.8', sw: 2.4 },
  history: { f: 'M12 3.4a8.6 8.6 0 1 0 8.6 8.6h-2.6A6 6 0 1 1 12 6z', s: 'M12 7.6v4.8l3.4 2M20.6 3.4v5.2h-5.2', sw: 2.2 },
  other: { f: 'M12 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM4.6 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8zM19.4 9.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z' },

  /**
   * The one icon here that is NOT the owner's.
   *
   * Drawn 2026-09-11 for the tab-bar comparison page, in this set's language —
   * 24x24, stroked at 2, the same weights as `note` and `reminder`. The owner
   * was told it was not theirs before choosing it for Log, and chose it
   * anyway: their own `history` turned out to collapse at tab-bar size, which
   * they had suspected.
   */
  checklist: {
    s: 'M8.8 4.8H6.4a1.6 1.6 0 0 0-1.6 1.6v13a1.6 1.6 0 0 0 1.6 1.6h11.2a1.6 1.6 0 0 0 1.6-1.6v-13a1.6 1.6 0 0 0-1.6-1.6h-2.4M9.6 2.8h4.8a1 1 0 0 1 1 1v1.6a1 1 0 0 1-1 1H9.6a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1zM8.6 13.2l2.4 2.4 4.4-4.4',
    sw: 2,
  },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Both edges. Defaults to 20, which sits with the app's 22–24px text. */
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className }: IconProps) {
  const def: IconDef = ICONS[name];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      // Decorative throughout: every icon in this app sits beside its own
      // label, so announcing it again would only repeat the text.
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      {def.f && <path d={def.f} fill="currentColor" fillRule="evenodd" />}
      {def.s && (
        <path
          d={def.s}
          fill="none"
          stroke="currentColor"
          strokeWidth={def.sw ?? 2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
