import './Placeholder.css';

export interface PlaceholderProps {
  title: string;
  subtitle?: string;
  /** Omit (or pass "") for a tab-bar root, which shows no back button — tabs
      clear the stack rather than returning to somewhere. */
  backLabel?: string;
  onBack: () => void;
}

/** Stands in for any of the 25 mock screens the build hasn't reached yet, so
    every nav target in DESIGN_REFERENCE.md's screen map resolves to
    something real rather than a dead tap. Swap out per screen as it's built. */
export default function Placeholder({ title, subtitle, backLabel, onBack }: PlaceholderProps) {
  return (
    <main className="placeholder">
      {backLabel && (
        <button type="button" className="placeholder-back" onClick={onBack}>‹ {backLabel}</button>
      )}
      <h1 className="placeholder-title">{title}</h1>
      <p className="placeholder-note">{subtitle ?? 'Not built yet.'}</p>
      <p className="placeholder-note dim">This screen is coming in a later session.</p>
    </main>
  );
}
