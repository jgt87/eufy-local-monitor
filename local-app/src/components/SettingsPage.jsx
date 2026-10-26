import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';
import { Switch } from './Switch.jsx';
import { HistoryChart } from './HistoryChart.jsx';

// Device settings, grouped like the app's settings screens. Values are what the device last reported to
// the eufy cloud. A few switches and choices can be changed; every change is confirmed first.
export function SettingsPage({ device, connected, api }) {
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null);
  const [writing, setWriting] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(null);

  const load = async () => {
    if (!device || !connected) return;
    setLoading(true); setFailure('');
    try { setData(await api('settings', { sn: device.sn })); } catch (e) { setData(null); setFailure(e.message); } finally { setLoading(false); }
    fetch(`/api/history?key=${device.key}`).then(r => r.json()).then(d => setHistory(d.samples || [])).catch(() => setHistory([]));
  };
  useEffect(() => { setData(null); setHistory(null); setPending(null); setResult(null); void load(); }, [device?.sn, connected]);

  const apply = async () => {
    setWriting(true); setResult(null);
    try {
      const r = await api('settings/set', { sn: device.sn, name: pending.row.name, value: pending.value });
      setResult({ name: pending.row.name, text: `${r.label} set to ${r.shown}. The device confirms it when it next reports.` });
      setPending(null);
      setTimeout(() => void load(), 2500);
    } catch (e) { setResult({ name: pending.row.name, text: e.message, error: true }); setPending(null); } finally { setWriting(false); }
  };
  const shown = (row, value) => (row.control.type === 'switch' ? (value ? 'On' : 'Off') : row.control.options.find(([v]) => v === value)?.[1]);

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
      <p className="fine-print">{data?.ownerGated
        ? 'Values the device last reported. This eufy account is not the owner of these devices, so settings are read-only here — only the owner can change them, in the eufy app.'
        : 'Values the device last reported. Settings with a switch or a list can be changed here; change everything else in the eufy app.'}</p>

      {history && (
        <section className="panel" aria-label="Battery and signal">
          <div className="panel-heading"><h2>Battery and signal</h2></div>
          <div className="group padded charts">
            <HistoryChart title="Battery" unit="%" field="battery" samples={history} domain={[0, 100]} />
            <HistoryChart title="Wi-Fi signal (dBm)" unit=" dBm" axisUnit="" field="rssi" samples={history} />
          </div>
        </section>
      )}

      {loading && !data && <div className="group empty-card"><span className="spinner dark" /><p>Reading settings</p></div>}
      {failure && <div className="group empty-card"><Icon name="info" size={28} /><p>Settings unavailable</p><small>{failure}</small></div>}
      {data && !data.groups.length && <div className="group empty-card"><Icon name="sliders" size={28} /><p>No settings reported yet</p><small>Battery devices report their settings when they wake. Try again after a ring or a motion event.</small></div>}

      {data?.groups.map(g => (
        <section key={g.name} className="panel" aria-label={g.name}>
          <div className="panel-heading"><h2>{g.name}</h2></div>
          <div className="group">
            {g.rows.map(r => (
              <div key={r.name} className="setting-row">
                <div className="cell static">
                  <span className="cell-copy"><strong>{r.label}</strong>{result?.name === r.name && <small role="status" className={result.error ? 'error-text' : undefined}>{result.text}</small>}</span>
                  {data.ownerGated || !r.control ? <span className="cell-value">{r.value}</span> : r.control.type === 'switch' ? (
                    <Switch label={r.label} checked={pending?.row.name === r.name ? pending.value : r.raw} disabled={writing} onChange={value => { setResult(null); setPending({ row: r, value }); }} />
                  ) : r.control?.type === 'select' ? (
                    <select className="cell-select" aria-label={r.label} value={pending?.row.name === r.name ? pending.value : r.raw} disabled={writing}
                      onChange={e => { setResult(null); setPending({ row: r, value: Number(e.target.value) }); }}>
                      {r.control.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  ) : <span className="cell-value">{r.value}</span>}
                </div>
                {pending?.row.name === r.name && (
                  <div className="confirm-row" role="group" aria-label={`Confirm ${r.label}`}>
                    <span>Set {r.label} to {shown(r, pending.value)} on {device.name}?</span>
                    <button className="pill primary small" disabled={writing} onClick={apply}>{writing ? 'Sending…' : 'Change'}</button>
                    <button className="pill secondary small" disabled={writing} onClick={() => setPending(null)}>Cancel</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      {!!data?.capabilities.length && <p className="fine-print">Capabilities: {data.capabilities.join(', ')}</p>}
    </div>
  );
}
