'use client';

export type DateRangeValue = {
  from: string;
  to: string;
};

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function defaultTodayRange(): DateRangeValue {
  return { from: startOfTodayIso(), to: endOfTodayIso() };
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
}) {
  const fromLocal = value.from.slice(0, 10);
  const toLocal = value.to.slice(0, 10);

  return (
    <div className="date-range-picker">
      <label className="date-range-field">
        <span className="label">From</span>
        <input
          type="date"
          className="input"
          value={fromLocal}
          onChange={(e) => {
            const d = new Date(`${e.target.value}T00:00:00`);
            onChange({ ...value, from: d.toISOString() });
          }}
        />
      </label>
      <label className="date-range-field">
        <span className="label">To</span>
        <input
          type="date"
          className="input"
          value={toLocal}
          onChange={(e) => {
            const d = new Date(`${e.target.value}T23:59:59`);
            onChange({ ...value, to: d.toISOString() });
          }}
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChange(defaultTodayRange())}
      >
        Today
      </button>
    </div>
  );
}
