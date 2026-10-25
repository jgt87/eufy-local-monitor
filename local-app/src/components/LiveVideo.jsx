import { useEffect } from 'react';

const MIME = 'video/mp4; codecs="avc1.42C01F"';

async function append(buffer, data) {
  await new Promise((resolve, reject) => {
    const cleanup = () => { buffer.removeEventListener('updateend', done); buffer.removeEventListener('error', fail); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('The browser could not decode this video.')); };
    buffer.addEventListener('updateend', done);
    buffer.addEventListener('error', fail);
    try { buffer.appendBuffer(data); } catch (e) { cleanup(); reject(e); }
  });
}

// Streams fragmented MP4 from /api/video/<id> into a MediaSource, keeping playback near the live edge.
export function LiveVideo({ stream, onPlaying, onError, videoRef }) {
  useEffect(() => {
    if (!stream?.id) return undefined;
    const abort = new AbortController();
    const video = videoRef.current;
    let objectUrl;
    let source;
    const run = async () => {
      if (!window.MediaSource?.isTypeSupported(MIME)) throw new Error('This browser cannot play the stream. Open the app in current Edge or Chrome.');
      source = new MediaSource();
      objectUrl = URL.createObjectURL(source);
      video.src = objectUrl;
      await new Promise((resolve, reject) => {
        source.addEventListener('sourceopen', resolve, { once: true });
        abort.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
      });
      if (abort.signal.aborted) return;
      const response = await fetch(`/api/video/${stream.id}`, { signal: abort.signal });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'The video source could not open.'); }
      const buffer = source.addSourceBuffer(MIME);
      const reader = response.body.getReader();
      while (!abort.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        await append(buffer, value);
        if (buffer.buffered.length) {
          const end = buffer.buffered.end(buffer.buffered.length - 1);
          if (end - video.currentTime > 5) video.currentTime = Math.max(0, end - 1);
        }
        if (video.paused) void video.play().catch(() => {});
        if (video.currentTime > 30 && buffer.buffered.length && buffer.buffered.start(0) < video.currentTime - 20) {
          await new Promise(resolve => { buffer.addEventListener('updateend', resolve, { once: true }); buffer.remove(0, video.currentTime - 15); });
        }
      }
      if (source.readyState === 'open' && !buffer.updating) source.endOfStream();
    };
    run().catch(error => { if (!abort.signal.aborted) onError(error.message || 'Video playback failed.'); });
    return () => { abort.abort(); video.pause(); video.removeAttribute('src'); video.load(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [stream?.id]);

  return (
    <video ref={videoRef} muted autoPlay playsInline onPlaying={onPlaying}
      onError={() => onError('The browser could not play this video. Restart live view.')}
      aria-label={stream?.kind === 'test' ? 'Synthetic local test signal' : 'Live camera video'} />
  );
}
