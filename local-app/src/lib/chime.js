// A short two-tone chime for alerts when Windows notifications are not available. Browsers allow audio
// only after the page has had a click, so a first alert may be silent.
export function chime(ring = false) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = ring ? [659, 523] : [880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain(); const t = ctx.currentTime + i * 0.35;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.65);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* no audio */ }
}
