import { useEffect, useRef, useState } from 'react';
import {
  deletePicture,
  downscaleImage,
  getPicture,
  pictureSupported,
  savePicture,
  usePictureIds,
} from '../state/pictures';

interface Props {
  entryId: string;
}

/** Attach, preview, replace, or remove a personal photo for one affirmation. */
export function PictureUploader({ entryId }: Props) {
  const pictureIds = usePictureIds();
  const hasPicture = pictureIds.has(entryId);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    if (hasPicture) {
      void getPicture(entryId).then((pic) => {
        if (cancelled || !pic) return;
        url = URL.createObjectURL(pic.blob);
        setPreviewUrl(url);
      });
    } else {
      setPreviewUrl(null);
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [entryId, hasPicture]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const blob = await downscaleImage(file);
      await savePicture(entryId, blob);
    } catch {
      setError("Couldn't use that image. Try a different photo.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    await deletePicture(entryId);
    setBusy(false);
  };

  if (!pictureSupported) return null;

  return (
    <div className="picture-uploader">
      {error && (
        <p className="note" style={{ marginBottom: '0.6rem' }}>
          {error}
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {hasPicture && previewUrl ? (
        <div className="stack gap-sm">
          <img src={previewUrl} alt="" className="picture-preview" />
          <div className="row-control">
            <button className="btn-quiet" onClick={() => fileInput.current?.click()} disabled={busy}>
              Replace
            </button>
            <button className="btn-quiet" onClick={() => void remove()} disabled={busy}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-quiet" onClick={() => fileInput.current?.click()} disabled={busy}>
          {busy ? 'Adding…' : 'Add a picture'}
        </button>
      )}
    </div>
  );
}
