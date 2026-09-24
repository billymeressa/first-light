import { useEffect, useRef, useState } from 'react';
import {
  deleteRecording,
  getRecording,
  playBlob,
  recordingSupported,
  saveRecording,
  useRecordedIds,
} from '../audio/recordings';

interface Props {
  entryId: string;
}

function formatDuration(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

/** Record, preview, and manage a saved voice take for one affirmation. */
export function VoiceRecorder({ entryId }: Props) {
  const recordedIds = useRecordedIds();
  const hasRecording = recordedIds.has(entryId);

  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const tickId = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (hasRecording) {
      void getRecording(entryId).then((rec) => {
        if (!cancelled) setDuration(rec?.duration ?? null);
      });
    } else {
      setDuration(null);
    }
    return () => {
      cancelled = true;
    };
  }, [entryId, hasRecording]);

  // A take in progress must stop its mic stream and timer if the editor
  // closes mid-recording, not just on explicit Stop.
  useEffect(() => {
    return () => {
      if (tickId.current) clearInterval(tickId.current);
      mediaRecorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
        const elapsed = Date.now() - startedAt.current;
        setBusy(true);
        void saveRecording(entryId, blob, elapsed).finally(() => {
          setDuration(elapsed);
          setBusy(false);
        });
      };
      mediaRecorder.current = mr;
      startedAt.current = Date.now();
      mr.start();
      setRecording(true);
      setElapsedMs(0);
      tickId.current = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 200);
    } catch {
      setError('Microphone access was denied or unavailable.');
    }
  };

  const stopRecording = () => {
    if (tickId.current) clearInterval(tickId.current);
    setRecording(false);
    mediaRecorder.current?.stop();
  };

  const play = async () => {
    const rec = await getRecording(entryId);
    if (!rec) return;
    setPlaying(true);
    await playBlob(rec.blob, 1);
    setPlaying(false);
  };

  const remove = async () => {
    setBusy(true);
    await deleteRecording(entryId);
    setBusy(false);
  };

  if (!recordingSupported) {
    return (
      <p className="note" style={{ marginTop: '0.75rem' }}>
        Voice recording isn't available in this browser.
      </p>
    );
  }

  return (
    <div className="voice-recorder">
      {error && (
        <p className="note" style={{ marginBottom: '0.6rem' }}>
          {error}
        </p>
      )}

      {recording ? (
        <div className="row-control">
          <span className="rec-dot" aria-hidden="true" />
          <span className="faint">Recording… {formatDuration(elapsedMs)}</span>
          <button className="btn-quiet" onClick={stopRecording}>
            Stop
          </button>
        </div>
      ) : hasRecording ? (
        <div className="row-control">
          <span className="faint">Your voice{duration ? ` · ${formatDuration(duration)}` : ''}</span>
          <button className="btn-quiet" onClick={() => void play()} disabled={playing || busy}>
            {playing ? 'Playing…' : 'Play'}
          </button>
          <button className="btn-quiet" onClick={() => void startRecording()} disabled={busy}>
            Re-record
          </button>
          <button className="btn-quiet" onClick={() => void remove()} disabled={busy}>
            Remove
          </button>
        </div>
      ) : (
        <button className="btn-quiet" onClick={() => void startRecording()} disabled={busy}>
          Record my voice
        </button>
      )}
    </div>
  );
}
