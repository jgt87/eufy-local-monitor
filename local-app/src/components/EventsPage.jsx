import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';
import { day, time } from '../lib/format.js';

const ICONS = { doorbellPress: 'doorbell', motion: 'motion', personDetected: 'user', strangerDetected: 'user' };

// Event history in the style of the eufy event list: grouped by day, thumbnail on the left.
export function EventsPage({ state, device, api, busy, act, setError }) {
  const [events, setEvents] = useState(null);
  const [scope, setScope] = useState('all');
  const [open, setOpen] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [picture, setPicture] = useState(null);

  const load = () => fetch('/api/events').then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => setError('Could not load the event history.'));
  useEffect(() => { void load(); }, [state?.latestEvent?.id, state?.eventCount]);
  useEffect(() => { setPicture(null); }, [device?.sn]);

  const shown = (events || []).filter(e => scope === 'all' || e.deviceKey === device?.key);
  const days = [];
  for (const e of shown) { const label = day(e.time); let g = days.find(d => d.label === label); if (!g) days.push(g = { label, items: [] }); g.items.push(e); }
  const clear = () => act('clear', async () => { await api('events/clear'); setConfirmClear(false); await load(); });
  const latest = () => act('picture', async () => { setPicture((await api('picture', { sn: device.sn })).image); });

  return (
    <div className="events">
      <div className="segmented" role="group" aria-label="Which events">
        <button className={scope === 'all' ? 'active' : ''} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>All devices</button>
        <button className={scope === 'device' ? 'active' : ''} aria-pressed={scope === 'device'} disabled={!device} onClick={() => setScope('device')}>{device?.name || 'Selected device'}</button>
      </div>

      {device && state?.account.status === 'connected' && (
        <section className="panel" aria-label="Latest picture">
          <div className="panel-heading">
            <h2>Latest picture</h2>
            <button className="pill secondary small" disabled={!!busy} onClick={latest}><Icon name="snapshot" size={16} />{picture ? 'Reload' : 'Show'}</button>
          </div>
          {picture
            ? <button className="group picture" onClick={() => setOpen({ image: picture, label: 'Latest picture', deviceName: device.name })}><img src={picture} alt={`Latest picture from ${device.name}`} /></button>
            : <p className="fine-print panel-note">The most recent picture {device.name} sent with an event. It is not a fresh capture.</p>}
        </section>
      )}

      {events === null ? (
        <div className="group empty-card"><span className="spinner dark" /><p>Loading events</p></div>
      ) : days.length ? days.map(g => (
        <section key={g.label} className="panel" aria-label={g.label}>
          <div className="panel-heading"><h2>{g.label}</h2></div>
          <ol className="group event-list">
            {g.items.map(e => (
              <li key={e.id}>
                <button className="cell" onClick={() => e.image && setOpen(e)} disabled={!e.image} aria-label={`${e.label}, ${e.deviceName}, ${time(e.time)}${e.image ? ', open picture' : ''}`}>
                  {e.image ? <img className="thumb" src={e.image} alt="" loading="lazy" /> : <span className="thumb empty"><Icon name={ICONS[e.kind] || 'bell'} size={22} /></span>}
                  <span className="cell-copy"><strong>{e.label}</strong><small>{e.deviceName}</small></span>
                  <time className="cell-value">{time(e.time)}</time>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )) : (
        <div className="group empty-card">
          <Icon name="bell" size={28} />
          <p>No events yet</p>
          <small>{state?.account.status === 'connected' ? 'Rings and detections appear here while the monitor is running.' : 'Sign in and keep the monitor running to collect rings and detections.'}</small>
        </div>
      )}

      {!!events?.length && (
        <div className="clear-row">
          {confirmClear
            ? <><span>Delete all {events.length} events and their pictures from this PC?</span><button className="pill primary small" disabled={!!busy} onClick={clear}>Delete</button><button className="pill secondary small" onClick={() => setConfirmClear(false)}>Keep</button></>
            : <button className="text-button" onClick={() => setConfirmClear(true)}>Clear event history</button>}
        </div>
      )}
      <p className="fine-print">Events are stored only on this PC, in the monitor’s .runtime folder. The eufy app keeps its own history.</p>

      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={open.label} onClick={() => setOpen(null)} onKeyDown={e => e.key === 'Escape' && setOpen(null)}>
          <figure onClick={e => e.stopPropagation()}>
            <img src={open.image} alt={`${open.label}, ${open.deviceName}`} />
            <figcaption><span>{open.label} · {open.deviceName}{open.time ? ` · ${time(open.time)}` : ''}</span><button className="pill light small" autoFocus onClick={() => setOpen(null)}>Close</button></figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
