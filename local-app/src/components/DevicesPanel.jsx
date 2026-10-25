import { Icon } from './Icon.jsx';

// Device list styled after the eufy device cards: one rounded group, a 60 dp row per device.
export function DevicesPanel({ devices, allCount, selected, connected, busy, query, onQuery, onSelect, onRefresh }) {
  return (
    <section className="panel" aria-label="Your devices">
      <div className="panel-heading">
        <h2>Your devices</h2>
        <button className="icon-button" title="Refresh devices" aria-label="Refresh devices" disabled={!connected || !!busy} onClick={onRefresh}>
          <Icon name="refresh" size={18} />
        </button>
      </div>
      {allCount > 4 && <input className="search" aria-label="Search devices" placeholder="Search devices" value={query} onChange={e => onQuery(e.target.value)} />}
      {devices.length ? (
        <div className="group">
          {devices.map(d => (
            <button key={d.sn} className={`cell device${d.sn === selected ? ' selected' : ''}`} onClick={() => onSelect(d.sn)} aria-pressed={d.sn === selected}>
              <span className="device-symbol"><Icon name={/doorbell/i.test(d.name) ? 'doorbell' : d.canLive ? 'camera' : 'home'} size={22} /></span>
              <span className="cell-copy">
                <strong>{d.name}</strong>
                <small>{d.canLive ? 'Live view available' : d.model || 'Account device'}</small>
              </span>
              {d.sn === selected ? <Icon name="check" size={18} className="cell-end" /> : <Icon name="chevron" size={16} className="cell-end muted" />}
            </button>
          ))}
        </div>
      ) : (
        <div className="group empty-card">
          <Icon name="home" size={28} />
          <p>{connected ? 'No devices found' : 'Your doorbell starts here'}</p>
          <small>{connected ? 'Refresh the list or check the signed-in account.' : 'Sign in to see your doorbell and HomeBase.'}</small>
        </div>
      )}
    </section>
  );
}
