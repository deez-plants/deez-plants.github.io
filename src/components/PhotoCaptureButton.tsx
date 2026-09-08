import { useEffect, useRef, useState } from 'react';
import type { ISODate, MediaId, PlantId } from '../types/ids';
import type { MediaLabel } from '../types/plant';
import { openDeezPlants } from '../db/schema';
import { capturePhoto } from '../capture/photos';
import { CapturePhotoSheet } from './CapturePhotoSheet';

/**
 * A button that opens the device's camera/library (`<input type="file">` with
 * `capture="environment">`, which iOS Safari and desktop browsers both honour
 * — the camera opens directly on a phone, a file picker on a laptop) and,
 * once a file is chosen, the one-tap label step. Self-contained so both
 * Plant Detail and the Photos gallery can drop it in without duplicating the
 * pick → label → save wiring.
 */

export interface PhotoCaptureButtonProps {
  plant_id: PlantId;
  plant_name: string;
  as_of: ISODate;
  className: string;
  label: string;
  onSaved: (media_id: MediaId) => void;
}

export function PhotoCaptureButton({ plant_id, plant_name, as_of, className, label, onSaved }: PhotoCaptureButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const onPick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError(null);
  };

  const cancel = () => {
    if (busy) return;
    setFile(null);
    setPreviewUrl(null);
    setError(null);
  };

  const save = async (mediaLabel: MediaLabel) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const db = await openDeezPlants();
      const media_id = await capturePhoto(db, plant_id, file, mediaLabel, as_of);
      setFile(null);
      setPreviewUrl(null);
      onSaved(media_id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }}
      />
      {previewUrl && (
        <CapturePhotoSheet
          plantName={plant_name}
          previewUrl={previewUrl}
          busy={busy}
          error={error}
          onLabel={(l) => void save(l)}
          onClose={cancel}
        />
      )}
    </>
  );
}
