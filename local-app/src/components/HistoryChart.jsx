import { useEffect, useRef, useState } from 'react';

const H = 150, PAD = { l: 44, r: 12, t: 12, b: 26 };
const stamp = t => new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayLabel = t => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });

// One measure over time: a 2px ink line on a recessive grid, with a crosshair and tooltip on hover or
// touch, and the readings as a table for screen readers and exact values.
export function HistoryChart({ title, unit, axisUnit = unit, samples, field, domain }) {
  const box = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const points = samples.filter(s => s[field] !== null && s[field] !== undefined);
  const latest = points.at(-1);
  if (points.length < 2) {
    return (
      <div className="chart" ref={box}>
        <div className="chart-head"><strong>{title}</strong><span>{latest ? `${latest[field]}${unit}` : '—'}</span></div>
        <p className="chart-empty">{latest ? 'One reading so far.' : 'No readings yet.'} The line appears as the device reports more, about every 15 minutes while the monitor is signed in.</p>
      </div>
    );
  }
  const t0 = points[0].t, t1 = Math.max(points.at(-1).t, t0 + 3600000);
  const values = points.map(p => p[field]);
  const [lo, hi] = domain || [Math.floor((Math.min(...values) - 5) / 10) * 10, Math.ceil((Math.max(...values) + 5) / 10) * 10];
  const x = t => PAD.l + ((t - t0) / (t1 - t0)) * (width - PAD.l - PAD.r);
  const y = v => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[field]).toFixed(1)}`).join('');
  const ticks = [lo, (lo + hi) / 2, hi];
  const days = Math.max(1, Math.round((t1 - t0) / 86400000));
  const xTicks = [t0, t0 + (t1 - t0) / 2, t1];
  const pick = clientX => {
    const r = box.current.getBoundingClientRect(); const px = clientX - r.left;
    let best = points[0]; for (const p of points) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p;
    setHover(best);
  };

  return (
    <div className="chart" ref={box}>
      <div className="chart-head"><strong>{title}</strong><span>{latest[field]}{unit} now</span></div>
      <svg width={width} height={H} role="img" aria-label={`${title}, ${points.length} readings over ${days} day${days > 1 ? 's' : ''}, now ${latest[field]}${unit}`}
        onPointerMove={e => pick(e.clientX)} onPointerDown={e => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
        {ticks.map(v => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="axis" x={PAD.l - 8} y={y(v) + 4} textAnchor="end">{Math.round(v)}{axisUnit}</text>
          </g>
        ))}
        {xTicks.map((t, i) => <text key={i} className="axis" x={x(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{dayLabel(t)}</text>)}
        <path className="line" d={path} />
        {hover && (
          <g>
            <line className="crosshair" x1={x(hover.t)} x2={x(hover.t)} y1={PAD.t} y2={H - PAD.b} />
            <circle className="marker" cx={x(hover.t)} cy={y(hover[field])} r="4" />
          </g>
        )}
        <rect x={PAD.l} y={0} width={width - PAD.l - PAD.r} height={H} fill="transparent" />
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover.t), 70), width - 70) }}>
          <strong>{hover[field]}{unit}</strong><span>{stamp(hover.t)}</span>
        </div>
      )}
      <details className="chart-table">
        <summary>Show readings</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>{title}</th></tr></thead>
            <tbody>{[...points].reverse().map(p => <tr key={p.t}><td>{stamp(p.t)}</td><td>{p[field]}{unit}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
