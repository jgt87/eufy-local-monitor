import { useRef } from 'react';
import { Icon } from './Icon.jsx';
import { LiveVideo } from './LiveVideo.jsx';
import { bytes, time } from '../lib/format.js';

// Live view laid out like the eufy live screen: dark stage, round controls below, grouped info cards.
export function MonitorPage({ state, device, connected, busy, active, playing, source, rtsp, setRtsp, videoRef, onStart, onStop, onRefresh, onPlaying, onVideoError, onSnapshot, setError }) {
  const viewerRef = useRef(null);
  const ffmpeg = !!state?.tools.ffmpeg;
  const title = active ? (source === 'test' ? 'Synthetic test signal' : source === 'rtsp' ? 'RTSP source' : device?.name || 'Camera') : device?.name || 'Live view';
  return (
    <>
      <section className="live" ref={viewerRef} aria-label="Camera viewer">
        <div className="stage">
          {active ? (
            <>
              <LiveVideo stream={active} videoRef={videoRef} onPlaying={onPlaying} onError={onVideoError} />
              {!playing && (
                <div className="stage-overlay">
                  <span className="spinner" />
                  <p>Opening video connection…</p>
                  <small>The first frame can take a few moments.</small>
                </div>
              )}
              {source === 'test' && <span className="test-stamp">TEST SIGNAL · NOT A CAMERA</span>}
            </>
          ) : (
            <div className="stage-empty">
              <Icon name="doorbell" size={56} />
              <h2>{device?.canLive ? 'Your camera is ready to connect' : connected ? 'Live view is unavailable' : 'Bring your doorbell into view'}</h2>
              <p>{device?.canLive ? 'Start live view to open a connection to this camera.' : connected ? 'Select a camera with live-view support. If none is available, this model is not supported by the current SDK.' : 'Sign in with your Eufy account, choose your doorbell, and start a live view.'}</p>
              {device?.canLive
                ? <button className="pill light" disabled={!!busy} onClick={() => onStart('eufy')}><Icon name="play" size={16} />Start live view</button>
                : connected
                  ? <button className="pill ghost" disabled={!!busy} onClick={onRefresh}>Refresh devices<Icon name="refresh" size={16} /></button>
                  : <button className="pill ghost" onClick={() => document.getElementById('email')?.focus()}>Sign in to get started<Icon name="arrow" size={16} /></button>}
            </div>
          )}
          <div className="stage-top">
            <span>{title}</span>
            <span>{active ? (playing ? 'Live' : 'Connecting…') : 'Ready when you are'}</span>
          </div>
        </div>
        <div className="controls">
          <div className="control">
            <button className="round" aria-label="Save current frame" title="Save current frame" disabled={!playing} onClick={onSnapshot}><Icon name="snapshot" /></button>
            <span>Snapshot</span>
          </div>
          <div className="control center">
            {active
              ? <button className="pill primary" disabled={!!busy} onClick={onStop}><Icon name="stop" size={16} />Stop live view</button>
              : <button className="pill primary" disabled={!device?.canLive || !!busy || !ffmpeg} onClick={() => onStart('eufy')}><Icon name="play" size={16} />Start live view</button>}
            <span>{active ? `${source === 'test' ? 'Local test' : 'Live video'} · ${bytes(state?.stream?.bytes || 0)} received` : 'Video only · starts on demand'}</span>
          </div>
          <div className="control">
            <button className="round" aria-label="Full screen" title="Full screen" onClick={() => viewerRef.current?.requestFullscreen?.().catch(() => setError('Full screen is unavailable in this browser.'))}><Icon name="expand" /></button>
            <span>Full screen</span>
          </div>
        </div>
      </section>

      <div className="cards">
        <section className="panel" aria-label="Connection">
          <div className="panel-heading"><h2>Connection</h2></div>
          <div className="group">
            <div className="cell static">
              <span className="device-symbol"><Icon name="home" size={22} /></span>
              <span className="cell-copy">
                <strong>{device?.stationSn ? 'HomeBase association' : device ? 'Connection managed by Eufy SDK' : 'No device selected'}</strong>
                <small>{device?.stationSn || (device ? 'The SDK resolves the camera’s standalone or HomeBase route.' : 'Your doorbell’s connection details appear after sign-in.')}</small>
              </span>
              <span className="cell-value">{device?.model || 'Awaiting device'}</span>
            </div>
            {device && <div className="cell static"><span className="cell-copy"><strong>Serial</strong></span><span className="cell-value">{device.sn}</span></div>}
            {device && <div className="cell static"><span className="cell-copy"><strong>Live interface</strong></span><span className="cell-value">{device.canLive ? 'Available' : 'Not exposed by SDK'}</span></div>}
          </div>
          <p className="fine-print">Viewing stops after five minutes. Start again to continue. Device support is verified when real frames arrive.</p>
        </section>

        <section className="panel" aria-label="Activity">
          <div className="panel-heading"><h2>Activity</h2></div>
          <ol className="group activity">
            {(state?.logs || []).slice(0, 5).map((event, i) => <li key={event.time + i} className="cell static"><time>{time(event.time)}</time><span>{event.message}</span></li>)}
          </ol>
        </section>
      </div>

      <details className="group tools">
        <summary className="cell"><span className="device-symbol"><Icon name="link" size={20} /></span><span className="cell-copy"><strong>Other ways to test</strong></span><Icon name="chevron" size={16} className="cell-end muted chevron" /></summary>
        <div className="tools-body">
          <section>
            <h3>Check local playback</h3>
            <p>Generate a labelled test pattern with FFmpeg to check this PC’s video pipeline.</p>
            <button className="pill secondary" disabled={!!busy || !ffmpeg} onClick={() => onStart('test')}><Icon name="play" size={16} />Run test signal</button>
          </section>
          <section>
            <h3>Open an RTSP source</h3>
            <p>If your camera exposes RTSP, paste its full address here.</p>
            <form onSubmit={e => { e.preventDefault(); onStart('rtsp'); }}>
              <label className="sr-only" htmlFor="rtsp">RTSP URL</label>
              <input id="rtsp" type="password" value={rtsp} onChange={e => setRtsp(e.target.value)} placeholder="rtsp://camera-address/stream" autoComplete="off" required />
              <button className="pill secondary" disabled={!!busy || !ffmpeg}>Open stream</button>
            </form>
          </section>
          {state && !ffmpeg && <p className="notice">Install FFmpeg or set FFMPEG_PATH, then restart the app.</p>}
        </div>
      </details>
    </>
  );
}
