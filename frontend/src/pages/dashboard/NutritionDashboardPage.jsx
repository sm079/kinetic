import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '../../components/ui/Icon';
import { apiGetNutritionLog, apiUpdateNutritionLog, apiGetNutritionHistory, apiExportNutrition, apiAnalyzeFood } from '../../lib/api';

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function shiftDate(str, days) {
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function fmtDateLabel(str) {
  if (str === todayStr()) return 'Today';
  if (str === yesterdayStr()) return 'Yesterday';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function totals(meals) {
  let cal = 0, pro = 0, carb = 0, fat = 0;
  for (const meal of meals ?? []) {
    for (const item of meal.items ?? []) {
      cal += item.calories ?? 0;
      pro += item.protein_g ?? 0;
      carb += item.carbs_g ?? 0;
      fat += item.fat_g ?? 0;
    }
  }
  return { cal: Math.round(cal), pro: Math.round(pro), carb: Math.round(carb), fat: Math.round(fat) };
}

function flatItems(log) {
  return (log?.meals ?? []).flatMap(m => m.items ?? []);
}

function singleMeal(items) {
  return [{ name: 'entries', time: null, items }];
}

const CIRC = 2 * Math.PI * 54;

// ── Compliance chart ───────────────────────────────────────────────────────

const CHART_METRICS = [
  { key: 'calories', label: 'Cal',     goalField: 'calorie_goal',   dataFn: t => t.cal },
  { key: 'protein',  label: 'Protein', goalField: 'protein_goal_g', dataFn: t => t.pro },
  { key: 'carbs',    label: 'Carbs',   goalField: 'carbs_goal_g',   dataFn: t => t.carb },
  { key: 'fat',      label: 'Fat',     goalField: 'fat_goal_g',     dataFn: t => t.fat },
];

function ComplianceChart({ history, metric = 'calories', days = 7 }) {
  const m = CHART_METRICS.find(x => x.key === metric) ?? CHART_METRICS[0];
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftDate(todayStr(), -i);
    const log = history.find(h => h.date === d);
    const t = log ? totals(log.meals) : null;
    const goal = log?.[m.goalField];
    const actual = t ? m.dataFn(t) : 0;
    const pct = (actual && goal) ? Math.min(100, Math.round((actual / goal) * 100)) : 0;
    const label = days === 7
      ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })
      : i % 5 === 0 ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    buckets.push({ date: d, pct, isToday: i === 0, label });
  }
  const hitDays = buckets.filter(b => b.pct >= 90).length;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-16">
        {buckets.map((d, i) => {
          const barH = Math.max(Math.round((d.pct / 100) * 56), 3);
          return (
            <div key={i} className="flex-1">
              <div
                className={`w-full rounded-t transition-all ${d.pct > 0 ? (d.isToday ? 'bg-[#D1FF26]' : 'bg-[#2a2a2a]') : 'bg-[#1a1a1a]'}`}
                style={{ height: barH }}
                title={`${d.pct}% of goal`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[8px] text-zinc-700 uppercase">
        {buckets.map((d, i) => <span key={i}>{d.label}</span>)}
      </div>
      {buckets.some(b => b.pct > 0) && (
        <p className="text-[10px] text-zinc-600">
          <span className="text-[#D1FF26] font-bold">{hitDays}/{days}</span> days hit goal
        </p>
      )}
    </div>
  );
}

// ── Scan Modal ─────────────────────────────────────────────────────────────

function ScanModal({ onResult, onClose }) {
  const [preview, setPreview] = useState(null);
  const [file, setFile]       = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError]     = useState(null);
  const inputRef = useRef(null);

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setError(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(f);
  }

  function onInputChange(e) { handleFile(e.target.files[0]); }
  function onDrop(e) { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }

  async function handleAnalyze() {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    try {
      const result = await apiAnalyzeFood(file);
      onResult(result);
    } catch (err) {
      setError(err.message);
      setAnalyzing(false);
    }
  }

  return (
    <div className="fixed inset-0 h-full bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#111] border border-[#262626] rounded-2xl p-6 w-full max-w-sm space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-headline font-bold text-white">Scan Food</h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-white transition-colors">
            <Icon name="close" />
          </button>
        </div>

        <div
          className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer overflow-hidden ${preview ? 'border-[#D1FF26]/30' : 'border-[#2a2a2a] hover:border-[#444]'}`}
          style={{ minHeight: 160 }}
          onClick={() => !preview && inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
        >
          {preview ? (
            <>
              <img src={preview} alt="food preview" className="w-full h-44 object-cover" />
              <button
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1 text-white hover:bg-black/80 transition-colors"
                onClick={e => { e.stopPropagation(); setPreview(null); setFile(null); }}
              >
                <Icon name="close" className="text-sm" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
              <Icon name="photo_camera" className="text-3xl text-zinc-700" />
              <p className="text-zinc-600 text-sm">Tap to upload or drag & drop</p>
            </div>
          )}
        </div>

        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onInputChange} />

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-[#2a2a2a] text-zinc-500 text-xs font-bold uppercase rounded hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={!preview ? () => inputRef.current?.click() : handleAnalyze}
            disabled={analyzing}
            className="flex-1 py-2.5 bg-[#D1FF26] text-zinc-950 font-black text-xs uppercase rounded disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {analyzing ? (
              <><span className="w-3.5 h-3.5 border-2 border-zinc-950/40 border-t-zinc-950 rounded-full animate-spin" />Analysing…</>
            ) : preview ? 'Analyse' : 'Choose Photo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Food Modal ─────────────────────────────────────────────────────────────

function FoodModal({ editItem, isScan, onSave, onClose }) {
  const isEdit = !!editItem && !isScan;
  const [form, setForm] = useState(() => editItem ? {
    name:       editItem.name       != null ? String(editItem.name)       : '',
    note:       editItem.note       != null ? String(editItem.note)       : '',
    calories:   editItem.calories   != null ? String(editItem.calories)   : '',
    protein_g:  editItem.protein_g  != null ? String(editItem.protein_g)  : '',
    carbs_g:    editItem.carbs_g    != null ? String(editItem.carbs_g)    : '',
    fat_g:      editItem.fat_g      != null ? String(editItem.fat_g)      : '',
    quantity_g: editItem.quantity_g != null ? String(editItem.quantity_g) : '',
  } : { name: '', note: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', quantity_g: '' });

  function set(f) { return e => setForm(v => ({ ...v, [f]: e.target.value })); }

  const calVal  = parseFloat(form.calories);
  const canSave = form.name.trim() && form.calories !== '' && !isNaN(calVal) && calVal > 0;

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      name:       form.name.trim(),
      note:       form.note.trim() || null,
      calories:   calVal,
      protein_g:  form.protein_g  ? parseFloat(form.protein_g)  : null,
      carbs_g:    form.carbs_g    ? parseFloat(form.carbs_g)    : null,
      fat_g:      form.fat_g      ? parseFloat(form.fat_g)      : null,
      quantity_g: form.quantity_g ? parseFloat(form.quantity_g) : null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#111] border border-[#262626] rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-headline font-bold text-white mb-5">
          {isScan ? 'Review Scan' : isEdit ? 'Edit Entry' : 'Add Food'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Food Name *</label>
            <input
              type="text" value={form.name} onChange={set('name')} required
              placeholder="e.g. Chicken Breast"
              className="w-full bg-[#1a1a1a] border-b-2 border-[#2a2a2a] focus:border-[#D1FF26] px-3 py-2 text-white font-medium focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Note</label>
            <input
              type="text" value={form.note} onChange={set('note')}
              placeholder="e.g. Pre-workout, Cheat meal…"
              className="w-full bg-[#1a1a1a] border-b-2 border-[#2a2a2a] focus:border-[#D1FF26] px-3 py-2 text-white font-medium focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Calories *', field: 'calories',   unit: 'kcal' },
              { label: 'Quantity',   field: 'quantity_g', unit: 'g'    },
              { label: 'Protein',    field: 'protein_g',  unit: 'g'    },
              { label: 'Carbs',      field: 'carbs_g',    unit: 'g'    },
              { label: 'Fat',        field: 'fat_g',      unit: 'g'    },
            ].map(({ label, field, unit }) => (
              <div key={field}>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">{label}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number" step="0.1" value={form[field]} onChange={set(field)} placeholder="0"
                    className="w-full bg-[#1a1a1a] border-b-2 border-[#2a2a2a] focus:border-[#D1FF26] px-2 py-2 text-white font-bold text-sm focus:outline-none"
                  />
                  <span className="text-[10px] text-zinc-700">{unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#2a2a2a] text-zinc-500 text-xs font-bold uppercase rounded hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!canSave} className="flex-1 py-2.5 bg-[#D1FF26] text-zinc-950 font-black text-xs uppercase rounded disabled:opacity-40">
              {isEdit ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Goals Editor ───────────────────────────────────────────────────────────

function GoalsEditor({ log, onSave }) {
  const [form, setForm] = useState({
    calorie_goal:   log.calorie_goal   ?? '',
    protein_goal_g: log.protein_goal_g ?? '',
    carbs_goal_g:   log.carbs_goal_g   ?? '',
    fat_goal_g:     log.fat_goal_g     ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      calorie_goal:   form.calorie_goal   ? parseInt(form.calorie_goal)   : null,
      protein_goal_g: form.protein_goal_g ? parseInt(form.protein_goal_g) : null,
      carbs_goal_g:   form.carbs_goal_g   ? parseInt(form.carbs_goal_g)   : null,
      fat_goal_g:     form.fat_goal_g     ? parseInt(form.fat_goal_g)     : null,
    });
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Calories', field: 'calorie_goal',   unit: 'kcal' },
          { label: 'Protein',  field: 'protein_goal_g', unit: 'g'    },
          { label: 'Carbs',    field: 'carbs_goal_g',   unit: 'g'    },
          { label: 'Fat',      field: 'fat_goal_g',     unit: 'g'    },
        ].map(({ label, field, unit }) => (
          <div key={field}>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">{label}</label>
            <div className="flex items-center gap-1">
              <input
                type="number" value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                placeholder="—"
                className="w-full bg-[#1a1a1a] border-b border-[#2a2a2a] focus:border-[#D1FF26] px-2 py-1.5 text-white font-bold text-sm focus:outline-none"
              />
              <span className="text-[10px] text-zinc-700">{unit}</span>
            </div>
          </div>
        ))}
      </div>
      <button type="submit" disabled={saving} className="w-full py-2 bg-[#1e1e1e] text-[#D1FF26] font-bold text-xs uppercase tracking-widest rounded hover:bg-[#2a2a2a] transition-colors disabled:opacity-50">
        {saving ? 'Saving…' : 'Update Goals'}
      </button>
    </form>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function NutritionDashboardPage() {
  const [logs, setLogs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [foodModal, setFoodModal] = useState(null);
  const [scanOpen, setScanOpen]   = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [chartMetric, setChartMetric] = useState('calories');
  const [chartDays, setChartDays]     = useState(7);

  useEffect(() => {
    const today = todayStr();
    Promise.all([
      apiGetNutritionLog(today),
      apiGetNutritionHistory(90),
    ]).then(([todayLog, hist]) => {
      const merged = [todayLog, ...hist.filter(h => h.date !== today)];
      setLogs(merged);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const todayLog = logs.find(l => l.date === todayStr()) ?? null;

  function patchLog(updated) {
    setLogs(prev => prev.map(l => l.id === updated.id ? updated : l));
  }

  async function saveLogMeals(logId, items) {
    const updated = await apiUpdateNutritionLog(logId, { meals: singleMeal(items) });
    patchLog(updated);
  }

  async function saveLogGoals(patch) {
    if (!todayLog) return;
    const updated = await apiUpdateNutritionLog(todayLog.id, patch);
    patchLog(updated);
  }

  async function handleSaveFood(item) {
    if (foodModal?.logId && foodModal?.flatIdx != null) {
      const log = logs.find(l => l.id === foodModal.logId);
      const items = flatItems(log).map((it, i) => i === foodModal.flatIdx ? item : it);
      await saveLogMeals(log.id, items);
    } else {
      if (!todayLog) return;
      const items = [...flatItems(todayLog), item];
      await saveLogMeals(todayLog.id, items);
    }
    setFoodModal(null);
  }

  async function handleDeleteFood(logId, flatIdx) {
    const log = logs.find(l => l.id === logId);
    const items = flatItems(log).filter((_, i) => i !== flatIdx);
    await saveLogMeals(log.id, items);
  }

  function handleScanResult(result) {
    setScanOpen(false);
    let note = null;
    if (result.micros?.length) note = result.micros.map(m => `${m.name} ${m.amount}`).join(', ');
    if (result.note) note = note ? `${result.note} | ${note}` : result.note;
    setFoodModal({
      prefill: {
        name:       result.name       ?? '',
        calories:   result.calories   ?? '',
        protein_g:  result.protein_g  ?? '',
        carbs_g:    result.carbs_g    ?? '',
        fat_g:      result.fat_g      ?? '',
        quantity_g: result.quantity_g ?? '',
        note:       note ?? '',
      }
    });
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const t       = totals(todayLog?.meals);
  const calGoal = todayLog?.calorie_goal ?? 0;
  const calPct  = calGoal > 0 ? Math.min(100, Math.round((t.cal / calGoal) * 100)) : 0;
  const INITIAL_VISIBLE = 3;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const MACROS = [
    { label: 'Protein', value: t.pro,  goal: todayLog?.protein_goal_g, color: '#00e3fd' },
    { label: 'Carbs',   value: t.carb, goal: todayLog?.carbs_goal_g,   color: '#D1FF26' },
    { label: 'Fat',     value: t.fat,  goal: todayLog?.fat_goal_g,     color: '#ffe56b' },
  ];

  const timeline = logs
    .map(log => ({ log, items: flatItems(log).map((item, flatIdx) => ({ ...item, flatIdx })) }))
    .filter(entry => entry.items.length > 0);

  const editTarget = foodModal?.logId && foodModal?.flatIdx != null
    ? flatItems(logs.find(l => l.id === foodModal.logId))[foodModal.flatIdx]
    : foodModal?.prefill ?? null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {scanOpen && <ScanModal onResult={handleScanResult} onClose={() => setScanOpen(false)} />}
      {foodModal !== null && (
        <FoodModal
          editItem={editTarget}
          isScan={!!foodModal?.prefill}
          onSave={handleSaveFood}
          onClose={() => setFoodModal(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-headline font-black tracking-tight text-white">Nutrition</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#1e1e1e] text-zinc-500 text-xs font-bold uppercase tracking-widest rounded hover:border-[#00e3fd]/30 hover:text-[#00e3fd] transition-colors"
          >
            <Icon name="photo_camera" className="text-xs" />
            Scan
          </button>
          <button
            onClick={() => setFoodModal({})}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D1FF26] text-zinc-950 text-xs font-black uppercase tracking-widest rounded hover:bg-[#f4ffc9] transition-colors"
          >
            <Icon name="add" className="text-xs" />
            Add Food
          </button>
          <button
            onClick={() => apiExportNutrition().catch(() => {})}
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded hover:bg-[#1e1e1e]"
            title="Export CSV"
          >
            <Icon name="download" className="text-base" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-zinc-700 text-sm">Loading…</div>
      ) : (
        <>
          {/* Today's overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Calorie ring */}
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 flex items-center gap-6">
              <div className="relative w-28 h-28 flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" fill="transparent" stroke="#1e1e1e" strokeWidth="10" />
                  <circle
                    cx="60" cy="60" r="54" fill="transparent"
                    stroke="url(#calGrad)" strokeWidth="10"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC - (calPct / 100) * CIRC}
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="calGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#c1ed00" />
                      <stop offset="100%" stopColor="#D1FF26" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-headline font-bold text-white">{t.cal.toLocaleString()}</span>
                  <span className="text-[9px] text-zinc-600">kcal</span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Today's Calories</p>
                {calGoal > 0 ? (
                  <>
                    <p className="text-sm text-zinc-500">
                      of <span className="text-white font-bold">{calGoal.toLocaleString()}</span> goal
                    </p>
                    <p className="text-xs text-[#D1FF26] font-bold mt-1">
                      {Math.max(0, calGoal - t.cal).toLocaleString()} remaining
                    </p>
                  </>
                ) : (
                  <button onClick={() => setShowGoals(true)} className="text-xs text-[#D1FF26] font-bold hover:text-[#f4ffc9] transition-colors">
                    Set goals →
                  </button>
                )}
              </div>
            </div>

            {/* Macros */}
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Today's Macros</p>
              {MACROS.map(m => {
                const pct = m.goal ? Math.min(100, Math.round((m.value / m.goal) * 100)) : 0;
                return (
                  <div key={m.label}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs text-zinc-500">{m.label}</span>
                      <span className="text-sm font-bold text-white">
                        {m.value}g{m.goal && <span className="text-zinc-600 font-normal text-xs"> / {m.goal}g</span>}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#1e1e1e] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: m.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Compliance + goals */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Compliance</p>
                <div className="flex gap-0.5">
                  {[7, 30].map(d => (
                    <button key={d} onClick={() => setChartDays(d)}
                      className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${chartDays === d ? 'bg-[#D1FF26] text-zinc-950' : 'text-zinc-600 hover:text-zinc-400'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
                <div className="flex gap-0.5">
                  {CHART_METRICS.map(m => (
                    <button key={m.key} onClick={() => setChartMetric(m.key)}
                      className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${chartMetric === m.key ? 'bg-[#1e1e1e] text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setShowGoals(v => !v)}
                className="flex items-center gap-1.5 text-[10px] text-zinc-600 font-bold uppercase tracking-widest hover:text-zinc-300 transition-colors"
              >
                <Icon name="tune" className="text-xs" />
                {showGoals ? 'Hide Goals' : 'Edit Goals'}
              </button>
            </div>

            <ComplianceChart history={logs} metric={chartMetric} days={chartDays} />

            {showGoals && todayLog && (
              <div className="pt-2 border-t border-[#1e1e1e]">
                <GoalsEditor log={todayLog} onSave={saveLogGoals} />
              </div>
            )}
          </div>

          {/* Food log / timeline */}
          <div className="space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 px-1">Food Log</p>

            {timeline.length === 0 ? (
              <div className="py-14 flex flex-col items-center gap-3 border border-dashed border-[#1e1e1e] rounded-xl">
                <Icon name="restaurant" className="text-2xl text-zinc-700" />
                <p className="text-zinc-600 text-xs uppercase tracking-widest font-bold">Nothing logged yet</p>
                <button
                  onClick={() => setFoodModal({})}
                  className="text-xs text-[#D1FF26] font-bold uppercase tracking-widest hover:text-[#f4ffc9] transition-colors"
                >
                  + Add your first entry
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {timeline.slice(0, visibleCount).map(({ log, items }) => (
                  <div key={log.id}>
                    {/* Date row */}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        {fmtDateLabel(log.date)}
                      </span>
                      <div className="flex-1 h-px bg-[#1e1e1e]" />
                      <span className="text-[10px] text-zinc-700">
                        {Math.round(items.reduce((s, i) => s + (i.calories ?? 0), 0))} kcal
                      </span>
                    </div>

                    {/* Items */}
                    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl divide-y divide-[#1e1e1e] overflow-hidden">
                      {items.map((item) => (
                        <div key={item.flatIdx} className="flex items-center justify-between px-5 py-3 group hover:bg-[#171717] transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{item.name}</p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">
                              {item.note && <span className="text-zinc-500 mr-2 italic">{item.note}</span>}
                              {item.quantity_g ? `${item.quantity_g}g · ` : ''}
                              {item.protein_g  ? `P ${item.protein_g}g · ` : ''}
                              {item.carbs_g    ? `C ${item.carbs_g}g · `   : ''}
                              {item.fat_g      ? `F ${item.fat_g}g`         : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 ml-4">
                            <span className="text-sm font-bold text-white">{Math.round(item.calories)} kcal</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setFoodModal({ logId: log.id, flatIdx: item.flatIdx })}
                                className="text-zinc-600 hover:text-zinc-300 transition-colors"
                                title="Edit"
                              >
                                <Icon name="edit" className="text-sm" />
                              </button>
                              <button
                                onClick={() => handleDeleteFood(log.id, item.flatIdx)}
                                className="text-zinc-600 hover:text-[#d53d18] transition-colors"
                                title="Delete"
                              >
                                <Icon name="close" className="text-sm" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      {log.date === todayStr() && (
                        <div className="px-5 py-3">
                          <button
                            onClick={() => setFoodModal({})}
                            className="flex items-center gap-1.5 text-xs font-bold text-zinc-600 uppercase tracking-widest hover:text-[#D1FF26] transition-colors"
                          >
                            <Icon name="add" className="text-sm" />
                            Add Food
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {timeline.length > INITIAL_VISIBLE && (
                  <div className="flex justify-center pt-1">
                    {visibleCount < timeline.length ? (
                      <button
                        onClick={() => setVisibleCount(prev => Math.min(prev + 5, timeline.length))}
                        className="px-5 py-2 border border-[#1e1e1e] rounded-full text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-white hover:border-zinc-600 transition-all"
                      >
                        Show More ({timeline.length - visibleCount} remaining)
                      </button>
                    ) : (
                      <button
                        onClick={() => setVisibleCount(INITIAL_VISIBLE)}
                        className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 hover:text-zinc-400 transition-colors"
                      >
                        Show Less
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-6" />
    </div>
  );
}
