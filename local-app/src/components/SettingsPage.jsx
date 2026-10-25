import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';

// Read-only device settings, grouped like the app's settings screens. Values are what the device last
// reported to the eufy cloud; nothing here writes to the device.
export function SettingsPage({ device, connected, api }) {
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!device || !connected) return;
    setLoading(true); setFailure('');
    try { setData(await api('settings', { sn: device.sn })); } catch (e) { setData(null); setFailure(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { setData(null); void load(); }, [device?.sn, connected]);

  if (!connected || !device) {
    return (
      <div className="group empty-card">
        <Icon name="sliders" size={28} />
        <p>{connected ? 'Select a device' : 'Sign in to read settings'}</p>
        <small>{connected ? 'Choose a device in the list to see what it reports.' : 'Settings are read from your eufy account after sign-in.'}</small>
      </div>
    );
  }
  return (
    <div className="settings">
      <section className="group padded settings-intro">
        <span className="device-symbol"><Icon name={/doorbell/i.test(`${device.name} ${data?.modelName || ''}`) ? 'doorbell' : 'camera'} size={22} /></span>
        <span className="cell-copy">
          <strong>{data?.modelName || device.name}</strong>
          <small>{[device.model, data ? `${data.reported} reported values` : null].filter(Boolean).join(' · ')}</small>
        </span>
        <button className="icon-button" title="Reload settings" aria-label="Reload settings" disabled={loading} onClick={load}><Icon name="refresh" size={18} /></button>
      </section>
      <p className="fine-print">Read only. These are the values the device last reported; change settings in the eufy app.</p>

      {loading && !data && <div className="group empty-card"><span className="spinner dark" /><p>Reading settings</p></div>}
      {failure && <div className="group empty-card"><Icon name="info" size={28} /><p>Settings unavailable</p><small>{failure}</small></div>}
      {data && !data.groups.length && <div className="group empty-card"><Icon name="sliders" size={28} /><p>No settings reported yet</p><small>Battery devices report their settings when they wake. Try again after a ring or a motion event.</small></div>}

      {data?.groups.map(g => (
        <section key={g.name} className="panel" aria-label={g.name}>
          <div className="panel-heading"><h2>{g.name}</h2></div>
          <div className="group">
            {g.rows.map(r => (
              <div key={r.name} className="cell static">
                <span className="cell-copy"><strong>{r.label}</strong></span>
                <span className="cell-value">{r.value}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!!data?.capabilities.length && <p className="fine-print">Capabilities: {data.capabilities.join(', ')}</p>}
    </div>
  );
}
