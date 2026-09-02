type ChartPoint = {
  hour: number;
  inbound: number;
  outbound: number;
  internal: number;
};

export function CallsHourlyChart({ data }: { data: ChartPoint[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.inbound, d.outbound, d.internal]));
  const totalToday = data.reduce((sum, d) => sum + d.inbound + d.outbound + d.internal, 0);

  return (
    <div className="calls-chart-panel" role="img" aria-label="Hourly call volume chart for today">
      <div className="calls-chart-header">
        <div className="calls-chart-legend">
          <span className="calls-chart-key inbound">Inbound</span>
          <span className="calls-chart-key outbound">Outbound</span>
          <span className="calls-chart-key internal">Local</span>
        </div>
        <span className="calls-chart-total muted">{totalToday} calls today</span>
      </div>
      <div className="calls-chart-bars">
        {data.map((point) => {
          const total = point.inbound + point.outbound + point.internal;
          return (
            <div key={point.hour} className="calls-chart-column" title={`${point.hour}:00 — ${total} calls`}>
              <div className="calls-chart-stack">
                <div
                  className="calls-chart-bar inbound"
                  style={{ height: `${(point.inbound / max) * 100}%` }}
                />
                <div
                  className="calls-chart-bar outbound"
                  style={{ height: `${(point.outbound / max) * 100}%` }}
                />
                <div
                  className="calls-chart-bar internal"
                  style={{ height: `${(point.internal / max) * 100}%` }}
                />
              </div>
              <span className="calls-chart-hour">{point.hour}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
