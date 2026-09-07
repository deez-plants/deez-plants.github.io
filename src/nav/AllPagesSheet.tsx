import './AllPagesSheet.css';

export interface AllPagesItem {
  label: string;
  subtitle: string;
  go: () => void;
}

export interface AllPagesSheetProps {
  items: readonly AllPagesItem[];
  onClose: () => void;
}

/** The `More` tab's overlay — a bottom sheet, not a screen on the stack
    (DESIGN_REFERENCE.md section 1). */
export function AllPagesSheet({ items, onClose }: AllPagesSheetProps) {
  return (
    <div className="sheet-scrim">
      <button type="button" className="sheet-scrim-dismiss" aria-label="Close" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="All pages">
        <div className="sheet-head">
          <span className="sheet-title">ALL PAGES</span>
          <button type="button" className="sheet-close" onClick={onClose}>Close</button>
        </div>
        <div className="sheet-items">
          {items.map((item) => (
            <button key={item.label + item.subtitle} type="button" className="sheet-row" onClick={item.go}>
              <span className="sheet-row-body">
                <span className="sheet-row-label">{item.label}</span>
                <span className="sheet-row-sub">{item.subtitle}</span>
              </span>
              <span className="sheet-row-chev" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
