import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon.jsx';
import { DevicesPanel } from './components/DevicesPanel.jsx';
import { AccountCard } from './components/AccountCard.jsx';
import { MonitorPage } from './components/MonitorPage.jsx';
import { Findings } from './components/Findings.jsx';
import { EventsPage } from './components/EventsPage.jsx';
import { SettingsPage } from './components/SettingsPage.jsx';
import { useMonitor } from './hooks/useMonitor.js';
import { safeStorage } from './lib/format.js';
import { chime } from './lib/chime.js';

const PAGES = {
  monitor: { title: d => d?.name || 'Doorbell monitor', lead: 'A clear view, from your own computer.' },
  events: { title: () => 'Events', lead: 'Rings and detections received while the monitor runs.' },
  settings: { title: d => (d ? `${d.name} settings` : 'Settings'), lead: 'What the selected device reports, with battery and signal over time.' },
  findings: { title: () => 'What the APK reveals', lead: 'Recovered interfaces and capability declarations from version 6.1.10_30612.' },
};

export function App() {
  const { state, error, setError, busy, api, act } = useMonitor();
  const [page, setPage] = useState(() => (location.hash === '#events' ? 'events' : 'monitor'));
  const [selected, setSelected] = useState('');
  const [active, setActive] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState('eufy');
  const [evidence, setEvidence] = useState(null);
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(safeStorage.get('remember') === '1');
  const [country, setCountry] = useState(safeStorage.get('country') || 'NL');
  const [answer, setAnswer] = useState('');
  const [rtsp, setRtsp] = useState('');
  const videoRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const seenEvent = useRef(undefined);

  const account = state?.account || { status: 'signed-out', devices: [] };
  const connected = account.status === 'connected';
  const device = account.devices.find(d => d.sn === selected);
  const devices = account.devices.filter(d => `${d.name} ${d.sn} ${d.model}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const list = state?.account.devices || [];
    if (!list.some(d => d.sn === selected)) setSelected(list.find(d => d.canLive)?.sn || list[0]?.sn || '');
  }, [state?.account.devices.map(d => d.sn).join('|')]);

  useEffect(() => {
    if (state?.stream && active && state.stream.id === active.id && ['error', 'stopped'].includes(state.stream.state)) {
      if (state.stream.error) setError(state.stream.error);
      setActive(null);
      setPlaying(false);
    }
  }, [state?.stream?.state, active?.id]);

  // A new ring or detection while the page is open: show it once, even on another page.
  useEffect(() => {
    const latest = state?.latestEvent;
    if (seenEvent.current === undefined) { if (state) seenEvent.current = latest?.id || null; return; }
    if (latest && latest.id !== seenEvent.current) {
      seenEvent.current = latest.id; setNotice(latest);
      // Without Windows notifications the page itself sounds the alert.
      const a = state.alerts;
      if (a && !a.available && a.desktop && a.sound && a.kinds[latest.kind]) chime(latest.kind === 'doorbellPress');
    }
  }, [state?.latestEvent?.id, !!state]);

  const start = kind => act('stream', async () => {
    setActive(null);
    setPlaying(false);
    const session = await api('streams', { kind, sn: kind === 'eufy' ? selected : undefined, url: kind === 'rtsp' ? rtsp : undefined });
    setSource(kind);
    setActive(session);
    setPage('monitor');
  });
  const stop = () => act('stop', async () => { setActive(null); setPlaying(false); await api('streams/stop'); });
  const refreshDevices = () => act('refresh', () => api('refresh'));
  const login = event => {
    event.preventDefault();
    const secret = password;
    setPassword('');
    void act('login', () => api('login', { email, password: secret, countryCode: country, remember }));
    safeStorage.set('country', country);
    safeStorage.set('remember', remember ? '1' : '0');
  };
  const challenge = event => { event.preventDefault(); void act('challenge', async () => { await api('challenge', { answer }); setAnswer(''); }); };
  const signout = () => act('logout', async () => { setActive(null); setPlaying(false); await api('logout'); setAnswer(''); });
  const selectDevice = sn => { if (active?.sn && active.sn !== sn) void stop(); setSelected(sn); if (page === 'findings') setPage('monitor'); };
  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!playing || !video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${source === 'test' ? 'test-signal' : 'camera'}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  };
  const showEvidence = () => {
    setPage('findings');
    if (!evidence) fetch('/api/evidence').then(r => r.json()).then(setEvidence).catch(() => setError('Could not load the APK findings.'));
  };

  const tabs = (className, size) => (
    <nav className={className} aria-label={className === 'tabbar' ? 'Mobile navigation' : 'Main navigation'}>
      <button className={page === 'monitor' ? 'tab active' : 'tab'} onClick={() => setPage('monitor')} aria-current={page === 'monitor' ? 'page' : undefined}>
        <Icon name="devices" size={size} /><span>Cameras</span>{className !== 'tabbar' && <small className="count">{account.devices.filter(d => d.canLive).length}</small>}
      </button>
      <button className={page === 'events' ? 'tab active' : 'tab'} onClick={() => setPage('events')} aria-current={page === 'events' ? 'page' : undefined}>
        <Icon name="bell" size={size} /><span>Events</span>{className !== 'tabbar' && !!state?.eventCount && <small className="count">{state.eventCount}</small>}
      </button>
      <button className={page === 'settings' ? 'tab active' : 'tab'} onClick={() => setPage('settings')} aria-current={page === 'settings' ? 'page' : undefined}>
        <Icon name="sliders" size={size} /><span>Settings</span>
      </button>
      <button className={page === 'findings' ? 'tab active' : 'tab'} onClick={showEvidence} aria-current={page === 'findings' ? 'page' : undefined}>
        <Icon name="findings" size={size} /><span>APK findings</span>
      </button>
    </nav>
  );

  return (
    <div className="app">
      <header className="topbar">
        <a href="/" className="brand"><Icon name="doorbell" size={22} /><span>eufy <strong>Local Monitor</strong></span></a>
        <span className="topbar-note">Running on this PC</span>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          {tabs('sidenav', 20)}
          <DevicesPanel devices={devices} allCount={account.devices.length} selected={selected} connected={connected} busy={busy} query={query} onQuery={setQuery} onSelect={selectDevice} onRefresh={refreshDevices} />
          <AccountCard account={account} sdkReady={!!state?.tools.sdk} stateLoaded={!!state} busy={busy}
            form={{ email, setEmail, password, setPassword, country, setCountry, answer, setAnswer, remember, setRemember }}
            onLogin={login} onChallenge={challenge} onSignout={signout} />
          <footer className="fine-print sidebar-footer">Independent local client · unaffiliated with Anker eufy.</footer>
        </aside>
        <main className="main">
          <div className="page-title">
            <h1>{PAGES[page].title(device)}</h1>
            <p>{PAGES[page].lead}</p>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <Icon name="info" />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError('')}>Dismiss</button>
            </div>
          )}
          {notice && (
            <div className="event-banner" role="status">
              <Icon name={notice.kind === 'doorbellPress' ? 'doorbell' : 'bell'} />
              <span><strong>{notice.label}</strong> · {notice.deviceName}</span>
              <button onClick={() => { setNotice(null); setPage('events'); }}>View</button>
              <button aria-label="Dismiss event" onClick={() => setNotice(null)}>Dismiss</button>
            </div>
          )}
          {page === 'events' && <EventsPage state={state} device={device} api={api} busy={busy} act={act} setError={setError} />}
          {page === 'settings' && <SettingsPage device={device} connected={connected} api={api} />}
          {page === 'monitor'
            ? <MonitorPage state={state} device={device} connected={connected} busy={busy} active={active} playing={playing} source={source} rtsp={rtsp} setRtsp={setRtsp}
                videoRef={videoRef} onStart={start} onStop={stop} onRefresh={refreshDevices} onPlaying={() => setPlaying(true)} onSnapshot={takeSnapshot} setError={setError}
                onVideoError={message => { setPlaying(false); setError(message); setActive(null); void api('streams/stop').catch(() => {}); }} />
            : page === 'findings' && <Findings data={evidence} />}
        </main>
      </div>
      {tabs('tabbar', 22)}
    </div>
  );
}
