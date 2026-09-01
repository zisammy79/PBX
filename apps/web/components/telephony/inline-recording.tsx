'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchRecordingBlobUrl } from '@/lib/recording-playback';

export function InlineRecordingPlayer({
  tenantId,
  recordingId,
}: {
  tenantId: string;
  recordingId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  async function play() {
    if (blobUrl) {
      audioRef.current?.play();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = await fetchRecordingBlobUrl(
        `tenants/${tenantId}/recordings/${recordingId}/content`,
        tenantId,
      );
      setBlobUrl(url);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-recording">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => void play()}
        disabled={loading}
        aria-label="Play recording"
      >
        {loading ? '…' : '▶'}
      </button>
      <audio ref={audioRef} className="inline-recording-audio" preload="none" />
      {error ? <span className="field-error">{error}</span> : null}
    </span>
  );
}
