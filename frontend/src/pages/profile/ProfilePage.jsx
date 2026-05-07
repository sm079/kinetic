import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import {
  apiGetMe, apiUpdateMe, apiChangePassword, apiGetWorkouts,
  apiGetBiometrics, apiCreateBiometric, apiUpdateBiometric, apiDeleteBiometric,
  apiGetBiometricTrends, apiExportBiometrics, apiGetWorkoutStats,
} from '../../lib/api';
import { kgToDisplay, displayToKg, weightUnit, kgToDisplayStr, useUnits } from '../../lib/units';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v, decimals = 1) {
  return v != null ? Number(v).toFixed(decimals) : '—';
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function calcStreak(workouts) {
  if (!workouts.length) return 0;
  const dates = new Set(workouts.map(w => new Date(w.started_at).toDateString()));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (dates.has(d.toDateString())) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function findExerciseCount(workouts) {
  const names = new Set();
  for (const w of workouts) {
    for (const a of w.activities ?? []) {
      if (a.type === 'lift' && a.name) names.add(a.name);
    }
  }
  return names.size;
}

// ── Trend chart ──────────────────────────────────────────────────────────────

function TrendChart({ data, color = '#D1FF26' }) {
  if (!data || data.length < 2) return (
    <div className="h-28 flex items-center justify-center text-zinc-700 text-xs uppercase tracking-widest">
      Log at least 2 entries to see trend
    </div>
  );

  const W = 480, H = 110, PL = 36, PR = 8, PT = 8, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;

  function toX(i) { return PL + (i / (data.length - 1)) * cW; }
  function toY(v) { return PT + cH - ((v - min) / range) * cH; }

  const pts = data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');
  const labelIdxs = [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="#1e1e1e" strokeWidth="1" />
      {[min, (min + max) / 2, max].map((v, i) => (
        <text key={i} x={PL - 4} y={toY(v) + 3} textAnchor="end" fill="#444" fontSize="9">{Number(v).toFixed(1)}</text>
      ))}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d.value)} r="2.5" fill={color} />
      ))}
      {labelIdxs.map(idx => (
        <text key={idx} x={toX(idx)} y={H - 2} textAnchor="middle" fill="#444" fontSize="8">
          {new Date(data[idx].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </text>
      ))}
    </svg>
  );
}

// ── Metric groups (all 14 trackable biometrics) ───────────────────────────────

const METRIC_GROUPS = [
  {
    label: 'Body Composition',
    items: [
      { key: 'weight_kg',          label: 'Weight',      color: '#D1FF26', isWeight: true },
      { key: 'body_fat_pct',       label: 'Body Fat',    color: '#00e3fd' },
      { key: 'muscle_mass_kg',     label: 'Muscle Mass', color: '#c1ed00', isWeight: true },
      { key: 'visceral_fat_level', label: 'Visceral Fat',color: '#ffe56b' },
    ],
  },
  {
    label: 'Dimensions',
    items: [
      { key: 'chest_cm',  label: 'Chest',  color: '#a78bfa' },
      { key: 'waist_cm',  label: 'Waist',  color: '#fb923c' },
      { key: 'hips_cm',   label: 'Hips',   color: '#f472b6' },
      { key: 'thigh_cm',  label: 'Thigh',  color: '#34d399' },
      { key: 'bicep_cm',  label: 'Bicep',  color: '#60a5fa' },
      { key: 'calf_cm',   label: 'Calf',   color: '#a3e635' },
    ],
  },
  {
    label: 'Wellness',
    items: [
      { key: 'wellness_sleep',    label: 'Sleep Quality', color: '#00e3fd' },
      { key: 'wellness_recovery', label: 'Recovery',      color: '#D1FF26' },
      { key: 'wellness_stress',   label: 'Stress Level',  color: '#ffe56b' },
      { key: 'wellness_energy',   label: 'Energy',        color: '#c1ed00' },
    ],
  },
];

function findMetric(key) {
  for (const g of METRIC_GROUPS) {
    const m = g.items.find(i => i.key === key);
    if (m) return m;
  }
  return null;
}

// ── Metric dropdown ───────────────────────────────────────────────────────────

function MetricSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const selected = findMetric(value);
  const q = search.toLowerCase();
  const filtered = q
    ? METRIC_GROUPS.map(g => ({ ...g, items: g.items.filter(m => m.label.toLowerCase().includes(q)) })).filter(g => g.items.length)
    : METRIC_GROUPS;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-[#1a1a1a] border border-[#1e1e1e] rounded px-3 py-1.5 text-[10px] font-bold text-zinc-300 hover:border-[#2a2a2a] transition-colors"
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selected?.color ?? '#D1FF26' }} />
        <span className="uppercase tracking-wider">{selected?.label ?? 'Metric'}</span>
        <Icon name="expand_more" className="text-xs text-zinc-600 ml-0.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-[#111] border border-[#1e1e1e] rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 pt-3 pb-2">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full bg-[#1a1a1a] border border-[#1e1e1e] rounded px-2.5 py-1.5 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-[#D1FF26]/40"
            />
          </div>
          <div className="max-h-64 overflow-y-auto pb-2">
            {filtered.map(group => (
              <div key={group.label}>
                <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-700">{group.label}</p>
                {group.items.map(m => (
                  <button
                    key={m.key}
                    onClick={() => { onChange(m.key); setOpen(false); setSearch(''); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-[#1a1a1a] transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.color }} />
                    <span className={m.key === value ? 'text-white font-bold' : 'text-zinc-400'}>{m.label}</span>
                    {m.key === value && <Icon name="check" className="text-[10px] text-[#D1FF26] ml-auto" />}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-zinc-700 text-center">No metrics found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Log modal ─────────────────────────────────────────────────────────────────

const EMPTY_BIO_FORM = {
  weight_kg: '', body_fat_pct: '', muscle_mass_kg: '', visceral_fat_level: '',
  chest_cm: '', waist_cm: '', hips_cm: '', thigh_cm: '', bicep_cm: '', calf_cm: '',
  wellness_sleep: 7, wellness_recovery: 7, wellness_stress: 3, wellness_energy: 7,
};

const WEIGHT_FIELDS = new Set(['weight_kg', 'muscle_mass_kg']);

function LogModal({ onSave, onClose, saving, initialData, units = 'metric' }) {
  const isEdit = !!initialData;
  const wUnit = weightUnit(units);

  const [form, setForm] = useState(() => {
    if (!initialData) return EMPTY_BIO_FORM;
    const filled = { ...EMPTY_BIO_FORM };
    Object.keys(EMPTY_BIO_FORM).forEach(k => {
      if (initialData[k] != null) filled[k] = initialData[k];
    });
    if (units === 'imperial') {
      if (filled.weight_kg !== '') filled.weight_kg = kgToDisplayStr(Number(filled.weight_kg), 'imperial');
      if (filled.muscle_mass_kg !== '') filled.muscle_mass_kg = kgToDisplayStr(Number(filled.muscle_mass_kg), 'imperial');
    }
    return filled;
  });

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function handleSubmit(e) {
    e.preventDefault();
    const NUMERIC = ['weight_kg','body_fat_pct','muscle_mass_kg','visceral_fat_level','chest_cm','waist_cm','hips_cm','thigh_cm','bicep_cm','calf_cm'];
    for (const k of NUMERIC) {
      if (form[k] !== '' && form[k] != null && parseFloat(form[k]) < 0) {
        alert(`${k.replace(/_/g, ' ')} cannot be negative.`); return;
      }
    }
    const payload = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '' && v != null) {
        let val = typeof v === 'string' ? parseFloat(v) || v : v;
        if (WEIGHT_FIELDS.has(k)) val = displayToKg(val, units) ?? val;
        payload[k] = val;
      }
    });
    onSave(payload);
  }

  const F = ({ label, field, unit }) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">{label}</label>
        <span className="text-[9px] text-zinc-700">{unit}</span>
      </div>
      <input
        type="number" step="0.1"
        value={form[field]}
        onChange={e => set(field, e.target.value)}
        placeholder="—"
        className="w-full bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-[#D1FF26]/40 transition-colors placeholder:text-zinc-800"
      />
    </div>
  );

  const WELLNESS = [
    { label: 'Sleep',    field: 'wellness_sleep',    color: '#00e3fd' },
    { label: 'Recovery', field: 'wellness_recovery', color: '#D1FF26' },
    { label: 'Stress',   field: 'wellness_stress',   color: '#ffe56b' },
    { label: 'Energy',   field: 'wellness_energy',   color: '#c1ed00' },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={onClose}
    >
      <div
        className="bg-[#111] border border-[#1e1e1e] rounded-2xl w-full shadow-2xl"
        style={{ maxWidth: '780px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1e1e1e] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-headline font-bold text-white">
              {isEdit ? 'Edit Entry' : 'Log Measurement'}
            </h3>
            <p className="text-[10px] text-zinc-600 mt-0.5">All fields optional — log only what you have</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-600 hover:text-white hover:bg-[#1e1e1e] transition-colors"
          >
            <Icon name="close" className="text-base" />
          </button>
        </div>

        {/* 3-column body */}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-3 divide-x divide-[#1e1e1e]">

            {/* Col 1 — Body Composition */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Body Composition</p>
              <F label="Weight"      field="weight_kg"          unit={wUnit} />
              <F label="Body Fat"    field="body_fat_pct"        unit="%" />
              <F label="Muscle Mass" field="muscle_mass_kg"      unit={wUnit} />
              <F label="Visceral Fat"field="visceral_fat_level"  unit="lvl" />
            </div>

            {/* Col 2 — Dimensions */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Dimensions</p>
              <div className="grid grid-cols-2 gap-3">
                <F label="Chest"  field="chest_cm"  unit="cm" />
                <F label="Waist"  field="waist_cm"  unit="cm" />
                <F label="Hips"   field="hips_cm"   unit="cm" />
                <F label="Thigh"  field="thigh_cm"  unit="cm" />
                <F label="Bicep"  field="bicep_cm"  unit="cm" />
                <F label="Calf"   field="calf_cm"   unit="cm" />
              </div>
            </div>

            {/* Col 3 — Wellness */}
            <div className="px-6 py-5 space-y-5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Wellness</p>
              {WELLNESS.map(w => (
                <div key={w.field}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">{w.label}</label>
                    <span className="text-sm font-bold tabular-nums" style={{ color: w.color }}>
                      {form[w.field]}<span className="text-zinc-700 text-xs font-normal">/10</span>
                    </span>
                  </div>
                  <input
                    type="range" min="1" max="10"
                    value={form[w.field]}
                    onChange={e => set(w.field, parseInt(e.target.value))}
                    className="w-full h-1 accent-[#D1FF26] cursor-pointer"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[8px] text-zinc-800">1</span>
                    <span className="text-[8px] text-zinc-800">10</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#1e1e1e] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-zinc-500 text-xs font-bold uppercase tracking-widest rounded-lg hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-[#D1FF26] text-zinc-950 font-black text-xs uppercase tracking-widest rounded-lg hover:bg-[#f4ffc9] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Stats tab ─────────────────────────────────────────────────────────────────

const TREND_PERIODS = [
  { value: 7,     label: '7d'  },
  { value: 30,    label: '30d' },
  { value: 90,    label: '90d' },
  { value: 365,   label: '1y'  },
  { value: 'all', label: 'All' },
];

const DIMENSIONS = [
  { part: 'Chest', field: 'chest_cm' }, { part: 'Waist', field: 'waist_cm' },
  { part: 'Hips',  field: 'hips_cm'  }, { part: 'Thigh', field: 'thigh_cm' },
  { part: 'Bicep', field: 'bicep_cm' }, { part: 'Calf',  field: 'calf_cm'  },
];

const WELLNESS_ITEMS = [
  { label: 'Sleep Quality', field: 'wellness_sleep',    icon: 'bedtime',          color: '#00e3fd' },
  { label: 'Recovery',      field: 'wellness_recovery', icon: 'self_improvement', color: '#D1FF26' },
  { label: 'Stress Level',  field: 'wellness_stress',   icon: 'psychology',       color: '#ffe56b' },
  { label: 'Energy',        field: 'wellness_energy',   icon: 'bolt',             color: '#c1ed00' },
];

function StatsTab() {
  const { units } = useUnits();
  const wUnit = weightUnit(units);

  const BODY_STATS = [
    { label: 'Weight',      field: 'weight_kg',          unit: wUnit, color: '#D1FF26', isWeight: true },
    { label: 'Body Fat',    field: 'body_fat_pct',        unit: '%',   color: '#00e3fd' },
    { label: 'Muscle Mass', field: 'muscle_mass_kg',      unit: wUnit, color: '#c1ed00', isWeight: true },
    { label: 'Visceral Fat',field: 'visceral_fat_level',  unit: 'lvl', color: '#ffe56b' },
  ];

  const [entries, setEntries]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [editEntry, setEditEntry]       = useState(null);
  const [saving, setSaving]             = useState(false);
  const [trendMetric, setTrendMetric]   = useState('weight_kg');
  const [trendPeriod, setTrendPeriod]   = useState(90);
  const [trendData, setTrendData]       = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    apiGetBiometrics().then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setTrendLoading(true);
    const days = trendPeriod === 'all' ? 0 : trendPeriod;
    apiGetBiometricTrends(trendMetric, days)
      .then(setTrendData).catch(() => setTrendData([])).finally(() => setTrendLoading(false));
  }, [trendMetric, trendPeriod]);

  const displayTrendData = useMemo(() => {
    const metric = findMetric(trendMetric);
    if (!metric?.isWeight || units === 'metric') return trendData;
    return trendData.map(d => ({ ...d, value: kgToDisplay(d.value, units) ?? d.value }));
  }, [trendData, trendMetric, units]);

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
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(entry) {
    if (!confirm(`Delete entry from ${fmtDate(entry.recorded_at)}?`)) return;
    try {
      await apiDeleteBiometric(entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch (err) { alert(err.message); }
  }

  const latest = entries[0] ?? null;
  const prev   = entries[1] ?? null;
  const activeMetic = findMetric(trendMetric);

  return (
    <div className="space-y-5">
      {(showModal || editEntry) && (
        <LogModal
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditEntry(null); }}
          saving={saving}
          initialData={editEntry}
          units={units}
        />
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-600">
          {loading ? '' : latest ? `Last logged ${fmtDate(latest.recorded_at)}` : 'No entries yet'}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => apiExportBiometrics().catch(() => {})}
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded hover:bg-[#1e1e1e]"
            title="Export CSV"
          >
            <Icon name="download" className="text-base" />
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

      {loading && (
        <div className="py-16 flex items-center justify-center text-zinc-700 text-sm">Loading…</div>
      )}

      {!loading && entries.length === 0 && (
        <div className="py-20 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-[#1a1a1a] flex items-center justify-center">
            <Icon name="monitor_weight" className="text-2xl text-zinc-600" />
          </div>
          <div>
            <p className="text-zinc-400 text-sm font-medium">No measurements yet</p>
            <p className="text-zinc-700 text-xs mt-1">Log your first entry to start tracking progress</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-[#D1FF26] text-zinc-950 text-xs font-black uppercase tracking-widest rounded hover:bg-[#f4ffc9] transition-colors"
          >
            Log First Entry
          </button>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <>
          {/* Composition cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {BODY_STATS.map(s => {
              const rawVal   = latest[s.field];
              const dispVal  = s.isWeight ? kgToDisplay(rawVal, units) : rawVal;
              const prevRaw  = prev?.[s.field];
              const prevDisp = s.isWeight ? kgToDisplay(prevRaw, units) : prevRaw;
              const delta    = dispVal != null && prevDisp != null && dispVal !== prevDisp
                ? { value: Math.abs(dispVal - prevDisp).toFixed(1), dir: dispVal > prevDisp ? 'up' : 'down' }
                : null;
              return (
                <div key={s.label} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">{s.label}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-headline font-bold text-white">{fmt(dispVal)}</span>
                    <span className="text-xs text-zinc-600">{s.unit}</span>
                  </div>
                  {delta && (
                    <div className={`flex items-center gap-1 mt-2 text-[10px] font-bold ${delta.dir === 'down' ? 'text-[#D1FF26]' : 'text-[#ff7351]'}`}>
                      <Icon name={delta.dir === 'down' ? 'trending_down' : 'trending_up'} className="text-xs" />
                      {delta.value} {s.unit}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Trend chart */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Trend</p>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-0.5">
                  {TREND_PERIODS.map(p => (
                    <button key={p.value} onClick={() => setTrendPeriod(p.value)}
                      className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded transition-colors ${trendPeriod === p.value ? 'bg-[#D1FF26] text-zinc-950' : 'text-zinc-600 hover:text-zinc-400'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <MetricSelect value={trendMetric} onChange={setTrendMetric} />
              </div>
            </div>
            {trendLoading
              ? <div className="h-28 flex items-center justify-center text-zinc-700 text-xs">Loading…</div>
              : <TrendChart data={displayTrendData} color={activeMetic?.color ?? '#D1FF26'} />
            }
          </div>

          {/* Dimensions + Wellness */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-4">Dimensions</p>
              <div className="divide-y divide-[#1e1e1e]">
                {DIMENSIONS.map(d => (
                  <div key={d.part} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <span className="text-xs text-zinc-500">{d.part}</span>
                    <span className="text-sm font-bold text-white">
                      {fmt(latest[d.field])}<span className="text-xs text-zinc-600 ml-1">cm</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-4">Wellness</p>
              <div className="space-y-4">
                {WELLNESS_ITEMS.map(w => {
                  const val = latest[w.field];
                  const pct = val != null ? (val / 10) * 100 : 0;
                  return (
                    <div key={w.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Icon name={w.icon} className="text-xs" style={{ color: w.color }} />
                          <span className="text-xs text-zinc-500">{w.label}</span>
                        </div>
                        <span className="text-sm font-bold text-white">{val != null ? `${val}/10` : '—'}</span>
                      </div>
                      <div className="h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: w.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* History table */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e1e]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">History</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[9px] uppercase tracking-widest text-zinc-700 border-b border-[#1e1e1e]">
                    <th className="text-left px-5 py-3 font-bold">Date</th>
                    <th className="text-right px-4 py-3 font-bold">Weight</th>
                    <th className="text-right px-4 py-3 font-bold">Body Fat</th>
                    <th className="text-right px-4 py-3 font-bold">Muscle</th>
                    <th className="text-right px-4 py-3 font-bold">Waist</th>
                    <th className="text-right px-4 py-3 font-bold">Sleep</th>
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e1e]">
                  {entries.map((e, i) => (
                    <tr key={e.id} className="group hover:bg-[#171717] transition-colors">
                      <td className="px-5 py-3 text-zinc-400 font-medium whitespace-nowrap text-xs">
                        {fmtDate(e.recorded_at)}
                        {i === 0 && (
                          <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-[#D1FF26] bg-[#D1FF26]/10 px-1.5 py-0.5 rounded">
                            Latest
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-white text-xs">
                        {fmt(kgToDisplay(e.weight_kg, units))}<span className="text-zinc-600 ml-0.5">{wUnit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                        {fmt(e.body_fat_pct)}<span className="text-zinc-700">%</span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                        {fmt(kgToDisplay(e.muscle_mass_kg, units))}<span className="text-zinc-700">{wUnit}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                        {fmt(e.waist_cm)}<span className="text-zinc-700">cm</span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-500 text-xs">
                        {e.wellness_sleep != null ? `${e.wellness_sleep}/10` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditEntry(e)} className="text-zinc-600 hover:text-zinc-300 transition-colors" title="Edit">
                            <Icon name="edit" className="text-sm" />
                          </button>
                          <button onClick={() => handleDelete(e)} className="text-zinc-600 hover:text-[#d53d18] transition-colors" title="Delete">
                            <Icon name="delete" className="text-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Account tab ──────────────────────────────────────────────────────────────

function AccountTab({ profile, profileLoading, refreshUser }) {
  const { logout } = useAuth();

  const [form, setForm]         = useState({ display_name: '', email: '' });
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState(null);

  const [pwForm, setPwForm]     = useState({ current: '', next: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg]       = useState(null);

  const [units, setUnits]               = useState('metric');
  const [age, setAge]                   = useState('');
  const [gender, setGender]             = useState('male');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg]   = useState(null);

  useEffect(() => {
    if (profile) {
      setForm({ display_name: profile.display_name ?? '', email: profile.email });
      setUnits(profile.preferred_units ?? 'metric');
      setAge(profile.age != null ? String(profile.age) : '');
      setGender(profile.gender ?? 'male');
    }
  }, [profile]);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true); setSaveMsg(null);
    try {
      await apiUpdateMe({ display_name: form.display_name || null, email: form.email });
      refreshUser();
      setSaveMsg({ ok: true, text: 'Saved.' });
    } catch (err) { setSaveMsg({ ok: false, text: err.message }); }
    finally { setSaving(false); }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!pwForm.current || !pwForm.next) return;
    setPwSaving(true); setPwMsg(null);
    try {
      await apiChangePassword(pwForm.current, pwForm.next);
      setPwForm({ current: '', next: '' });
      setPwMsg({ ok: true, text: 'Password updated.' });
    } catch (err) { setPwMsg({ ok: false, text: err.message }); }
    finally { setPwSaving(false); }
  }

  async function handleSaveSettings() {
    setSettingsSaving(true); setSettingsMsg(null);
    try {
      await apiUpdateMe({
        preferred_units: units,
        age: age ? parseInt(age) : null,
        gender,
      });
      await refreshUser();
      setSettingsMsg({ ok: true, text: 'Saved.' });
    } catch (err) { setSettingsMsg({ ok: false, text: err.message }); }
    finally { setSettingsSaving(false); }
  }

  const inputCls = "w-full bg-transparent border-b-2 border-[#1e1e1e] focus:border-[#D1FF26] px-0 py-2.5 text-white text-sm font-medium focus:outline-none transition-colors disabled:opacity-50 placeholder:text-zinc-700";
  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5";

  return (
    <div className="space-y-5">

      {/* Profile + Password */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-5">Profile</p>
          <form onSubmit={handleSaveProfile} className="space-y-5">
            <div>
              <label className={labelCls}>Display Name</label>
              <input type="text" value={form.display_name}
                onChange={e => setForm(v => ({ ...v, display_name: e.target.value }))}
                placeholder="Your name" disabled={profileLoading} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email}
                onChange={e => setForm(v => ({ ...v, email: e.target.value }))}
                placeholder="your@email.com" disabled={profileLoading} className={inputCls} />
            </div>
            {saveMsg && (
              <p className={`text-xs ${saveMsg.ok ? 'text-[#D1FF26]' : 'text-[#d53d18]'}`}>{saveMsg.text}</p>
            )}
            <button type="submit" disabled={saving || profileLoading}
              className="w-full py-2.5 bg-[#D1FF26] text-zinc-950 font-black text-xs uppercase tracking-widest rounded hover:bg-[#f4ffc9] transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-5">Password</p>
          <form onSubmit={handleChangePassword} className="space-y-5">
            <div>
              <label className={labelCls}>Current Password</label>
              <input type="password" value={pwForm.current}
                onChange={e => setPwForm(v => ({ ...v, current: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>New Password</label>
              <input type="password" value={pwForm.next}
                onChange={e => setPwForm(v => ({ ...v, next: e.target.value }))} className={inputCls} />
            </div>
            {pwMsg && (
              <p className={`text-xs ${pwMsg.ok ? 'text-[#D1FF26]' : 'text-[#d53d18]'}`}>{pwMsg.text}</p>
            )}
            <button type="submit" disabled={pwSaving || !pwForm.current || !pwForm.next}
              className="w-full py-2.5 border border-[#1e1e1e] text-zinc-500 text-xs font-bold uppercase tracking-widest rounded hover:border-[#D1FF26]/30 hover:text-[#D1FF26] transition-colors flex items-center justify-center gap-2 disabled:opacity-40">
              <Icon name="lock" className="text-xs" />
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>

      {/* Preferences + Session */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 space-y-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Preferences</p>
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">Units</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'metric',   label: 'Metric',   hint: 'kg · km · cm' },
                { id: 'imperial', label: 'Imperial', hint: 'lbs · mi · in' },
              ].map(u => (
                <button key={u.id} onClick={() => setUnits(u.id)}
                  className={`text-left px-4 py-3 rounded-lg border transition-all ${
                    units === u.id
                      ? 'border-[#D1FF26]/30 bg-[#D1FF26]/8'
                      : 'border-[#1e1e1e] bg-[#1a1a1a] hover:border-[#2a2a2a]'
                  }`}>
                  <div className={`text-xs font-bold uppercase tracking-widest ${units === u.id ? 'text-[#D1FF26]' : 'text-zinc-400'}`}>
                    {u.label}
                  </div>
                  <div className="text-[9px] text-zinc-700 mt-0.5">{u.hint}</div>
                </button>
              ))}
            </div>
          </div>
          {/* Age + Gender */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Age</p>
              <input
                type="number" min="13" max="100"
                value={age}
                onChange={e => setAge(e.target.value)}
                placeholder="—"
                disabled={profileLoading}
                className="w-full bg-transparent border-b border-[#1e1e1e] focus:border-[#D1FF26] py-1.5 text-sm text-white font-medium focus:outline-none transition-colors placeholder:text-zinc-700 disabled:opacity-50"
              />
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Sex</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[{ id: 'male', label: 'Male' }, { id: 'female', label: 'Female' }].map(g => (
                  <button key={g.id} onClick={() => setGender(g.id)}
                    className={`py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all border ${
                      gender === g.id
                        ? 'border-[#D1FF26]/30 bg-[#D1FF26]/8 text-[#D1FF26]'
                        : 'border-[#1e1e1e] bg-[#1a1a1a] text-zinc-500 hover:text-white'
                    }`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {settingsMsg && (
            <p className={`text-xs ${settingsMsg.ok ? 'text-[#D1FF26]' : 'text-[#d53d18]'}`}>{settingsMsg.text}</p>
          )}
          <button onClick={handleSaveSettings} disabled={settingsSaving || profileLoading}
            className="w-full py-2.5 border border-[#1e1e1e] text-zinc-500 text-xs font-bold uppercase tracking-widest rounded hover:border-[#D1FF26]/30 hover:text-[#D1FF26] transition-colors disabled:opacity-40">
            {settingsSaving ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>

        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 flex flex-col justify-between gap-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-4">Session</p>
            <div className="divide-y divide-[#1e1e1e]">
              {[
                { icon: 'person', label: 'Name',  value: profile?.display_name || '—' },
                { icon: 'mail',   label: 'Email', value: profile?.email || '—' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Icon name={row.icon} className="text-xs text-zinc-600" />
                    <span className="text-xs text-zinc-600">{row.label}</span>
                  </div>
                  <span className="text-xs font-medium text-zinc-400 truncate max-w-[160px]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={logout}
            className="w-full py-2.5 border border-[#d53d18]/20 text-[#d53d18] text-xs font-bold uppercase tracking-widest rounded hover:bg-[#d53d18]/10 transition-colors flex items-center justify-center gap-2">
            <Icon name="logout" className="text-xs" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'stats',   label: 'Stats',   icon: 'monitor_heart' },
  { key: 'account', label: 'Account', icon: 'manage_accounts' },
];

export default function ProfilePage() {
  const { refreshUser } = useAuth();
  const [tab, setTab] = useState('stats');

  const [profile, setProfile]               = useState(null);
  const [workouts, setWorkouts]             = useState([]);
  const [stats, setStats]                   = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGetMe(),
      apiGetWorkouts({ limit: 200 }),
      apiGetWorkoutStats().catch(() => null),
    ])
      .then(([me, ws, st]) => { setProfile(me); setWorkouts(ws); setStats(st); })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, []);

  const streak        = stats?.current_streak_days ?? calcStreak(workouts);
  const totalSessions = stats?.total_sessions      ?? workouts.length;
  const exerciseCount = findExerciseCount(workouts);
  const displayName   = profile?.display_name || profile?.email?.split('@')[0] || '—';
  const initial       = displayName !== '—' ? displayName[0].toUpperCase() : '?';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center flex-shrink-0">
            <span className="text-base font-headline font-bold text-zinc-300">
              {profileLoading ? '…' : initial}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-headline font-black tracking-tight text-white leading-tight">
              {profileLoading ? '…' : displayName}
            </h1>
            <p className="text-xs text-zinc-600 mt-0.5">{profileLoading ? '' : profile?.email}</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-8">
          {[
            { label: 'Sessions',  value: totalSessions,   color: '#D1FF26' },
            { label: 'Streak',    value: `${streak}d`,    color: '#00e3fd' },
            { label: 'Exercises', value: exerciseCount,   color: '#c1ed00' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-xl font-headline font-bold" style={{ color: s.color }}>
                {profileLoading ? '—' : s.value}
              </p>
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-[#1e1e1e]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-all border-b-2 -mb-px ${
              tab === t.key
                ? 'border-[#D1FF26] text-white'
                : 'border-transparent text-zinc-600 hover:text-zinc-300'
            }`}
          >
            <Icon name={t.icon} className="text-sm" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stats'   && <StatsTab />}
      {tab === 'account' && (
        <AccountTab
          profile={profile}
          profileLoading={profileLoading}
          refreshUser={refreshUser}
        />
      )}

      <div className="h-6" />
    </div>
  );
}
