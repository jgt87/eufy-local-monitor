import { Icon } from './Icon.jsx';

export function Findings({ data }) {
  if (!data) return <p className="note">Loading APK evidence…</p>;
  const rtsp = data.capabilities?.modules?.media?.scenarios?.media_live_rtsp;
  return (
    <div className="findings">
      <section className="group intro">
        <Icon name="info" size={26} />
        <div>
          <h2>Evidence you can inspect</h2>
          <p>The APK provided these command IDs and model declarations. Account connection and live playback use the community Eufy SDK. Android native libraries have not been ported to Windows.</p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2>Recovered command IDs</h2></div>
        <p className="note">Definitions recovered from the shared SDK module. They are reference data; this app does not send undocumented raw commands.</p>
        <div className="group table-wrap">
          <table>
            <thead><tr><th>Command</th><th>ID</th><th>Byte offset</th></tr></thead>
            <tbody>{data.commands.map(command => <tr key={command.command}><td><code>{command.command}</code></td><td>{command.value}</td><td>{command.offset}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2>HomeBase RTSP declaration</h2></div>
        <div className="group padded">
          {!rtsp ? <p>The capability file was not found. Extract it from the APK (see analysis/FINDINGS.md) to show the RTSP declaration.</p> : <>
          <p>Listed station models: <strong>{rtsp.supportedStations.join(', ')}</strong>. Excluded: <strong>{rtsp.excludedStations.join(', ')}</strong>.</p>
          <p>These packaged declarations do not guarantee that your doorbell has an RTSP endpoint. Its exact model and device configuration still matter.</p>
          </>}
        </div>
      </section>
    </div>
  );
}
