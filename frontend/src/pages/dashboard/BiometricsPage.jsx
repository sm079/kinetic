import { useState, useEffect, useRef } from 'react';
import Icon from '../../components/ui/Icon';
import {
  apiGetBiometrics,
  apiCreateBiometric,
  apiUpdateBiometric,
  apiDeleteBiometric,
  apiGetBiometricTrends,
  apiExportBiometrics,
} from '../../lib/api';
import { useUnits } from '../../lib/units';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(v, decimals = 1) {
  return v != null ? Number(v).toFixed(decimals) : '—';
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Metric definitions ─────────────────────────────────────────────────────

const METRIC_GROUPS = [
  {
    label: 'Body Composition',
    metrics: [
      { key: 'weight_kg',         label: 'Weight',       suffix: null,  color: '#D1FF26', isWeight: true  },
      { key: 'body_fat_pct',      label: 'Body Fat',     suffix: '%',   color: '#00e3fd', isWeight: false },
      { key: 'muscle_mass_kg',    label: 'Muscle Mass',  suffix: null,  color: '#c1ed00', isWeight: true  },
      { key: 'visceral_fat_level',label: 'Visceral Fat', suffix: 'lvl', color: '#ffe56b', isWeight: false },
    ],
  },
  {
    label: 'Dimensions',
    metrics: [
      { key: 'chest_cm',  label: 'Chest',  suffix: 'cm', color: '#f472b6', isWeight: false },
      { key: 'waist_cm',  label: 'Waist',  suffix: 'cm', color: '#fb923c', isWeight: false },
      { key: 'hips_cm',   label: 'Hips',   suffix: 'cm', color: '#a78bfa', isWeight: false },
      { key: 'thigh_cm',  label: 'Thigh',  suffix: 'cm', color: '#34d399', isWeight: false },
      { key: 'bicep_cm',  label: 'Bicep',  suffix: 'cm', color: '#60a5fa', isWeight: false },
      { key: 'calf_cm',   label: 'Calf',   suffix: 'cm', color: '#e879f9', isWeight: false },
    ],
  },
  {
    label: 'Wellness',
    metrics: [
      { key: 'wellness_sleep',    label: 'Sleep Quality', suffix: '/10', color: '#00e3fd', isWeight: false },
      { key: 'wellness_recovery', label: 'Recovery',      suffix: '/10', color: '#D1FF26', isWeight: false },
      { key: 'wellness_stress',   label: 'Stress',        suffix: '/10', color: '#ffe56b', isWeight: false },
      { key: 'wellness_energy',   label: 'Energy',        suffix: '/10', color: '#c1ed00', isWeight: false },
    ],
  },
];

const ALL_METRICS = METRIC_GROUPS.flatMap(g => g.metrics);

function metricDef(key) {
  return ALL_METRICS.find(m => m.key === key) ?? ALL_METRICS[0];
}

// ── Metric dropdown ────────────────────────────────────────────────────────

function MetricSelect({ value, onChange }) {
  const m = metricDef(value);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  function select(key) { onChange(key); setOpen(false); }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#1e1e1e] bg-[#0e0e0e] hover:border-[#2a2a2a] transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{m.label}</span>
        <Icon name="expand_more" className="text-[11px] text-zinc-600" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-[#111] border border-[#1e1e1e] rounded-xl shadow-xl z-50 overflow-hidden">
          {METRIC_GROUPS.map(g => (
            <div key={g.label}>
              <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-700">{g.label}</p>
              {g.metrics.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => select(opt.key)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 transition-colors ${
                    value === opt.key ? 'bg-[#1a1a1a]' : 'hover:bg-[#181818]'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                  <span className="text-xs text-zinc-300">{opt.label}</span>
                  {value === opt.key && <Icon name="check" className="text-[10px] text-zinc-500 ml-auto" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trend chart ────────────────────────────────────────────────────────────

function TrendChart({ data, color, isWeight, kgToDisplay }) {
  const displayData = isWeight
    ? data.map(d => ({ ...d, value: kgToDisplay(d.value) }))
    : data;

  if (!displayData || displayData.length < 2) return (
    <div className="h-32 flex items-center justify-center text-zinc-700 text-xs uppercase tracking-widest">
      Log at least 2 entries to see trend
    </div>
  );

  const W = 480, H = 120, PL = 38, PR = 8, PT = 8, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const vals = displayData.map(d => d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;

  const toX = i => PL + (i / (displayData.length - 1)) * cW;
  const toY = v => PT + cH - ((v - min) / range) * cH;

  const pts = displayData.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');

  // Fill polygon
  const fillPts = [
    `${toX(0)},${H - PB}`,
    ...displayData.map((d, i) => `${toX(i)},${toY(d.value)}`),
    `${toX(displayData.length - 1)},${H - PB}`,
  ].join(' ');

  const labelIdxs = [0, Math.floor(displayData.length / 2), displayData.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="#1e1e1e" strokeWidth="1" />
      {[min, (min + max) / 2, max].map((v, i) => (
        <text key={i} x={PL - 4} y={toY(v) + 3} textAnchor="end" fill="#444" fontSize="9">{Number(v).toFixed(1)}</text>
      ))}
      <polygon points={fillPts} fill="url(#chartFill)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {displayData.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d.value)} r="2" fill={color} />
      ))}
      {labelIdxs.map(idx => (
        <text key={idx} x={toX(idx)} y={H - 2} textAnchor="middle" fill="#444" fontSize="8">
          {new Date(displayData[idx].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </text>
      ))}
    </svg>
  );
}

// ── Log Entry Modal ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  weight_kg: '', body_fat_pct: '', muscle_mass_kg: '', visceral_fat_level: '',
  chest_cm: '', waist_cm: '', hips_cm: '', thigh_cm: '', bicep_cm: '', calf_cm: '',
  wellness_sleep: 7, wellness_recovery: 7, wellness_stress: 3, wellness_energy: 7,
};

const WEIGHT_FIELDS = new Set(['weight_kg', 'muscle_mass_kg']);

function LogModal({ onSave, onClose, saving, initialData }) {
  const { unit, kgToDisplayStr, displayToKg } = useUnits();
  const isEdit = !!initialData;

  const [form, setForm] = useState(() => {
    if (!initialData) return EMPTY_FORM;
    const filled = { ...EMPTY_FORM };
    Object.keys(EMPTY_FORM).forEach(k => {
      if (initialData[k] != null) {
        filled[k] = WEIGHT_FIELDS.has(k) ? kgToDisplayStr(initialData[k]) : initialData[k];
      }
    });
    return filled;
  });

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '' && v != null) {
        payload[k] = WEIGHT_FIELDS.has(k) ? displayToKg(v) : parseFloat(v);
      }
    });
    onSave(payload);
  }

  const field = (label, key, suffix) => (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5">{label}</label>
      <div className="flex items-baseline gap-1.5">
        <input
          type="number"
          step="0.1"
          value={form[key]}
          onChange={e => set(key, e.target.value)}
          placeholder="—"
          className="w-20 bg-transparent border-b border-[#1e1e1e] focus:border-[#D1FF26]/40 py-1.5 text-white text-sm font-bold focus:outline-none transition-colors"
        />
        <span className="text-[10px] text-zinc-700">{suffix}</span>
      </div>
    </div>
  );

  const slider = (label, key, color) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">{label}</label>
        <span className="text-sm font-headline font-bold tabular-nums" style={{ color }}>{form[key]}<span className="text-zinc-700 text-xs">/10</span></span>
      </div>
      <input
        type="range" min="1" max="10"
        value={form[key]}
        onChange={e => set(key, parseInt(e.target.value))}
        className="w-full h-1 appearance-none bg-[#1e1e1e] rounded-full cursor-pointer accent-[#D1FF26]"
        style={{ accentColor: color }}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl w-full max-w-md my-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#1e1e1e]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            {isEdit ? 'Edit Entry' : 'Log Measurement'}
          </p>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <Icon name="close" className="text-sm" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-6">

            {/* Body Composition */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 mb-4">Body Composition</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {field('Weight', 'weight_kg', unit)}
                {field('Body Fat', 'body_fat_pct', '%')}
                {field('Muscle Mass', 'muscle_mass_kg', unit)}
                {field('Visceral Fat', 'visceral_fat_level', 'lvl')}
              </div>
            </div>

            <div className="border-t border-[#1e1e1e]" />

            {/* Dimensions */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 mb-4">Dimensions (cm)</p>
              <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                {field('Chest', 'chest_cm', 'cm')}
                {field('Waist', 'waist_cm', 'cm')}
                {field('Hips', 'hips_cm', 'cm')}
                {field('Thigh', 'thigh_cm', 'cm')}
                {field('Bicep', 'bicep_cm', 'cm')}
                {field('Calf', 'calf_cm', 'cm')}
              </div>
            </div>

            <div className="border-t border-[#1e1e1e]" />

            {/* Wellness */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 mb-4">Today's Wellness</p>
              <div className="space-y-5">
                {slider('Sleep Quality', 'wellness_sleep', '#00e3fd')}
                {slider('Recovery', 'wellness_recovery', '#D1FF26')}
                {slider('Stress', 'wellness_stress', '#ffe56b')}
                {slider('Energy', 'wellness_energy', '#c1ed00')}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-[#1e1e1e]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-[#1e1e1e] text-zinc-500 text-xs font-bold uppercase tracking-widest rounded-lg hover:text-white hover:border-[#2a2a2a] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-[#D1FF26] text-zinc-950 font-black text-xs uppercase tracking-widest rounded-lg hover:bg-[#f4ffc9] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

const TREND_DAYS = [30, 90, 180];

const BODY_STATS = [
  { label: 'Body Weight',  field: 'weight_kg',          color: '#D1FF26', isWeight: true  },
  { label: 'Body Fat',     field: 'body_fat_pct',        color: '#00e3fd', isWeight: false, suffix: '%'   },
  { label: 'Muscle Mass',  field: 'muscle_mass_kg',      color: '#c1ed00', isWeight: true  },
  { label: 'Visceral Fat', field: 'visceral_fat_level',  color: '#ffe56b', isWeight: false, suffix: 'lvl' },
];

export default function BiometricsPage() {
  const { unit, fmtWeight, kgToDisplay } = useUnits();

  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editEntry, setEditEntry]     = useState(null);
  const [saving, setSaving]           = useState(false);
  const [trendMetric, setTrendMetric] = useState('weight_kg');
  const [trendDays, setTrendDays]     = useState(90);
  const [trendData, setTrendData]     = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    apiGetBiometrics().then(setEntries).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setTrendLoading(true);
    apiGetBiometricTrends(trendMetric, trendDays)
      .then(setTrendData)
      .catch(() => setTrendData([]))
      .finally(() => setTrendLoading(false));
  }, [trendMetric, trendDays]);

  async function handleSave(payload) {
    setSaving(true);
    try {
      if (editEntry) {
        const updated = await apiUpdateBiometric(editEntry.id, payload);
        setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
        setEditEntry(null);
      } else {
        const entry = await apiCreateBiometric(payload);
        setEntries(prev => [entry, ...prev]);
        setShowModal(false);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry) {
    if (!confirm(`Delete entry from ${fmtDate(entry.recorded_at)}?`)) return;
    try {
      await apiDeleteBiometric(entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch {}
  }

  const latest = entries[0] ?? null;
  const prev   = entries[1] ?? null;

  const activeMeta = metricDef(trendMetric);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5 animate-in fade-in duration-500">

      {(showModal || editEntry) && (
        <LogModal
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditEntry(null); }}
          saving={saving}
          initialData={editEntry}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-headline font-black tracking-tight text-white">Biometrics</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => apiExportBiometrics().catch(() => {})}
            className="p-2 text-zinc-600 hover:text-zinc-400 transition-colors"
            title="Export CSV"
          >
            <Icon name="download" className="text-sm" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D1FF26] text-zinc-950 text-xs font-black uppercase tracking-widest rounded hover:bg-[#f4ffc9] transition-colors"
          >
            <Icon name="add" className="text-xs" />
            Log Entry
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-zinc-700 text-xs uppercase tracking-widest">
          Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl py-16 flex flex-col items-center gap-4">
          <Icon name="monitor_weight" className="text-3xl text-zinc-700" />
          <p className="text-zinc-600 text-xs uppercase tracking-widest font-bold">No entries yet</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs text-[#D1FF26] font-bold uppercase tracking-widest hover:text-[#f4ffc9] transition-colors"
          >
            Log first measurement →
          </button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {BODY_STATS.map(s => {
              const displayVal = s.isWeight ? fmtWeight(latest?.[s.field]) : fmt(latest?.[s.field]);
              let diffText = null, diffDir = 'flat';
              if (prev && latest?.[s.field] != null && prev[s.field] != null) {
                const rawDiff = latest[s.field] - prev[s.field];
                const displayDiff = s.isWeight ? Math.abs(kgToDisplay(rawDiff)) : Math.abs(rawDiff);
                diffText = displayDiff.toFixed(1);
                diffDir = rawDiff > 0 ? 'up' : rawDiff < 0 ? 'down' : 'flat';
              }
              const suffix = s.isWeight ? unit : (s.suffix ?? '');
              return (
                <div key={s.label} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 relative overflow-hidden">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">{s.label}</p>
                  <div className="flex items-end gap-1.5">
                    <span className="text-2xl font-headline font-bold text-white">{displayVal}</span>
                    <span className="text-xs text-zinc-600 mb-0.5">{suffix}</span>
                  </div>
                  {diffText && (
                    <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-bold ${
                      diffDir === 'down' ? 'text-[#D1FF26]' : diffDir === 'up' ? 'text-[#ff7351]' : 'text-zinc-600'
                    }`}>
                      <Icon name={diffDir === 'down' ? 'trending_down' : diffDir === 'up' ? 'trending_up' : 'trending_flat'} className="text-xs" />
                      {diffText}{suffix}
                    </div>
                  )}
                  <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full blur-2xl" style={{ background: `${s.color}15` }} />
                </div>
              );
            })}
          </div>

          {/* Trend chart */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Trend</p>
                {trendData.length > 0 && (
                  <p className="text-xs text-zinc-500 mt-0.5">{trendData.length} entries</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Metric dropdown */}
                <MetricSelect value={trendMetric} onChange={setTrendMetric} />
                {/* Day range */}
                <div className="flex gap-0.5">
                  {TREND_DAYS.map(d => (
                    <button
                      key={d}
                      onClick={() => setTrendDays(d)}
                      className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-colors ${
                        trendDays === d ? 'bg-[#D1FF26] text-zinc-950' : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {trendLoading ? (
              <div className="h-32 flex items-center justify-center">
                <Icon name="autorenew" className="text-zinc-700 animate-spin text-xl" />
              </div>
            ) : (
              <TrendChart
                data={trendData}
                color={activeMeta.color}
                isWeight={activeMeta.isWeight}
                kgToDisplay={kgToDisplay}
                unit={activeMeta.isWeight ? unit : (activeMeta.suffix ?? '')}
              />
            )}
          </div>

          {/* History */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#1e1e1e]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Log History</p>
            </div>
            <div className="divide-y divide-[#1e1e1e]">
              {entries.map((e, i) => (
                <div key={e.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#171717] transition-colors group">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="text-right flex-shrink-0 w-10">
                      <p className="text-[9px] text-zinc-600 uppercase">{fmtDate(e.recorded_at).split(' ')[0]}</p>
                      <p className="text-base font-headline font-bold text-white leading-none">{fmtDate(e.recorded_at).split(' ')[1]?.replace(',','')}</p>
                    </div>
                    <div className="w-px h-8 bg-[#1e1e1e] flex-shrink-0" />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 min-w-0">
                      {e.weight_kg != null && (
                        <span className="text-xs text-zinc-400">
                          <span className="font-bold text-white">{fmtWeight(e.weight_kg)}</span> {unit}
                        </span>
                      )}
                      {e.body_fat_pct != null && (
                        <span className="text-xs text-zinc-400">
                          <span className="font-bold text-white">{fmt(e.body_fat_pct)}</span>% fat
                        </span>
                      )}
                      {e.muscle_mass_kg != null && (
                        <span className="text-xs text-zinc-400">
                          <span className="font-bold text-white">{fmtWeight(e.muscle_mass_kg)}</span> muscle
                        </span>
                      )}
                      {e.waist_cm != null && (
                        <span className="text-xs text-zinc-400">
                          <span className="font-bold text-white">{fmt(e.waist_cm)}</span> cm waist
                        </span>
                      )}
                    </div>
                    {i === 0 && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#D1FF26] bg-[#D1FF26]/10 px-1.5 py-0.5 rounded flex-shrink-0">
                        Latest
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-4">
                    <button onClick={() => setEditEntry(e)} className="text-zinc-600 hover:text-[#D1FF26] transition-colors">
                      <Icon name="edit" className="text-sm" />
                    </button>
                    <button onClick={() => handleDelete(e)} className="text-zinc-600 hover:text-[#ff7351] transition-colors">
                      <Icon name="delete" className="text-sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
