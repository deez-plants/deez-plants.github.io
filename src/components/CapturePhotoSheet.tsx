import type { MediaLabel } from '../types/plant';
import './CapturePhotoSheet.css';

/**
 * The one-tap label step after a photo is picked. Section 6b: "Never a text
 * field" — tapping a label is the save action, there is no separate confirm.
 */

export interface CapturePhotoSheetProps {
  plantName: string;
  previewUrl: string;
  busy: boolean;
  error: string | null;
  onLabel: (label: MediaLabel) => void;
  onClose: () => void;
}

const LABELS: { value: MediaLabel; text: string }[] = [
  { value: 'whole', text: 'Whole plant' },
  { value: 'leaf', text: 'Leaf' },
  { value: 'soil', text: 'Soil' },
  { value: 'roots', text: 'Roots' },
];

export function CapturePhotoSheet({ plantName, previewUrl, busy, error, onLabel, onClose }: CapturePhotoSheetProps) {
  return (
    <div className="capshot-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="capshot-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Label photo of ${plantName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="capshot-head">
          <span className="capshot-title">Label this photo</span>
          <button type="button" className="capshot-close" onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
        </div>

        <img className="capshot-preview" src={previewUrl} alt="" />

        <p className="capshot-sub">What does it show?</p>
        <div className="capshot-grid">
          {LABELS.map((l) => (
            <button
              key={l.value}
              type="button"
              className="capshot-label"
              disabled={busy}
              onClick={() => onLabel(l.value)}
            >
              {l.text}
            </button>
          ))}
        </div>

        {error && <p className="capshot-error">{error}</p>}
      </div>
    </div>
  );
}
