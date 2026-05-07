import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { Skeleton } from '../../components/ui/Skeleton';
import MetricDropdown from '../../components/ui/MetricDropdown';
import { apiGetWorkouts, apiGetWorkoutStats, apiGetWorkoutPRs, apiGetLatestBiometric, apiGetWorkoutHeatmap, apiGetWorkoutExercises, apiGetSessionMuscles } from '../../lib/api';
import MuscleMap from '../../components/ui/MuscleMap';
import { useAuth } from '../../context/AuthContext';
import { useUnits } from '../../lib/units';

// ── Helpers ────────────────────────────────────────────────────────────────

function calcVolume(activities) {
  let total = 0;
  for (const a of activities ?? []) {
    if (a.type !== 'lift') continue;
    for (const s of a.sets ?? []) {
      const w = s.current_performance?.weight_kg ?? s.target_performance?.weight_kg ?? 0;
      const r = s.current_performance?.reps ?? s.target_performance?.reps ?? 0;
      total += w * r;
    }
  }
  return total;
}

function calcCardioMinutes(activities) {
  let total = 0;
  for (const a of activities ?? []) {
    if (a.type === 'cardio' && a.duration_seconds) {
      total += Math.round(a.duration_seconds / 60);
    }
  }
  return total;
}

function fmtVolume(kg, units = 'metric') {
  if (!kg || kg === 0) return '—';
  if (units === 'imperial') {
    const lbs = kg * 2.20462;
    return lbs >= 1000 ? `${(lbs / 1000).toFixed(1)}k lbs` : `${Math.round(lbs)} lbs`;
  }
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)}k kg` : `${Math.round(kg)} kg`;
}

function calcReadiness(bio) {
  if (!bio) return null;
  const { wellness_sleep: s, wellness_recovery: r, wellness_stress: st, wellness_energy: e } = bio;
  const vals = [];
  if (s  != null) vals.push(s);
  if (r  != null) vals.push(r);
  if (st != null) vals.push(10 - st);
  if (e  != null) vals.push(e);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / (vals.length * 10)) * 100);
}

function fmtDuration(startedAt, completedAt) {
  if (!completedAt) return '—';
  const mins = Math.round((new Date(completedAt) - new Date(startedAt)) / 60000);
  return `${mins}m`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

function localDateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Exercise metric value from a workout ───────────────────────────────────

function exerciseValueFromWorkout(w, exName) {
  let total = 0;
  for (const a of w.activities ?? []) {
    if (a.name !== exName) continue;
    if (a.type === 'lift') {
      for (const s of a.sets ?? []) {
        const wkg = s.current_performance?.weight_kg ?? s.target_performance?.weight_kg ?? 0;
        const r   = s.current_performance?.reps ?? s.target_performance?.reps ?? 0;
        total += wkg * r;
      }
    } else if (a.type === 'cardio' && a.duration_seconds) {
      total += Math.round(a.duration_seconds / 60);
    }
  }
  return total;
}

// ── Bar chart ──────────────────────────────────────────────────────────────

function buildChart(workouts, period, metric, recoveryMap, anchorDate = null) {
  const anchor = anchorDate ?? new Date();
  const buckets = [];

  if (period === 7) {
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      buckets.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), days: [d.toDateString()] });
    }
  } else if (period === 30 || period === 90) {
    const weekCount = period === 30 ? 5 : 13;
    for (let i = weekCount - 1; i >= 0; i--) {
      const end = new Date(anchor);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const days = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d).toDateString());
      }
      buckets.push({ label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), days });
    }
  } else if (period === 365) {
    const yr = anchor.getFullYear();
    for (let m = 0; m < 12; m++) {
      const startM = new Date(yr, m, 1);
      const endM   = new Date(yr, m + 1, 0);
      const days = [];
      for (let d = new Date(startM); d <= endM; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d).toDateString());
      }
      buckets.push({ label: startM.toLocaleDateString('en-US', { month: 'short' }), days });
    }
  } else {
    // all — monthly from first workout to today
    if (!workouts.length) return { labels: [], values: [], pcts: [], total: 0, shiftNote: null };
    const first = new Date(workouts[workouts.length - 1].started_at);
    const startM = new Date(first.getFullYear(), first.getMonth(), 1);
    const endM   = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    for (let cur = new Date(startM); cur <= endM; cur.setMonth(cur.getMonth() + 1)) {
      const m   = cur.getMonth();
      const yr2 = cur.getFullYear();
      const eom = new Date(yr2, m + 1, 0);
      const days = [];
      for (let d = new Date(cur); d <= eom; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d).toDateString());
      }
      buckets.push({ label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), days });
    }
  }

  const isExercise = typeof metric === 'string' && metric.startsWith('ex:');
  const exName = isExercise ? metric.slice(3) : null;

  const values = buckets.map(bucket => {
    const ws = workouts.filter(w => bucket.days.includes(new Date(w.started_at).toDateString()));
    if (metric === 'volume')   return ws.reduce((s, w) => s + calcVolume(w.activities), 0);
    if (metric === 'sessions') return ws.length;
    if (metric === 'cardio')   return ws.reduce((s, w) => s + calcCardioMinutes(w.activities), 0);
    if (metric === 'duration') {
      const durs = ws.filter(w => w.completed_at)
        .map(w => Math.round((new Date(w.completed_at) - new Date(w.started_at)) / 60000));
      return durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
    }
    if (metric === 'recovery') {
      const vals = ws.map(w => recoveryMap?.[localDateKey(w.started_at)] ?? 0).filter(Boolean);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    }
    if (isExercise) return ws.reduce((s, w) => s + exerciseValueFromWorkout(w, exName), 0);
    return 0;
  });

  // Last-active window shift for short periods when all buckets are zero
  if (!anchorDate && period !== 'all' && period !== 365 && values.every(v => v === 0) && workouts.length > 0) {
    const lastDate = new Date(workouts[0].started_at);
    const daysDiff = Math.floor((new Date() - lastDate) / 86400000);
    if (daysDiff > period) {
      const result = buildChart(workouts, period, metric, recoveryMap, lastDate);
      return { ...result, shiftNote: 'No recent activity — showing last active period' };
    }
  }

  const maxVal = Math.max(...values, 1);
  const pcts   = values.map(v => Math.round((v / maxVal) * 100));
  const nonZero = values.filter(Boolean);
  const total = metric === 'duration' || metric === 'recovery'
    ? (nonZero.length ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length) : 0)
    : values.reduce((a, b) => a + b, 0);

  return { labels: buckets.map(b => b.label), values, pcts, total, shiftNote: null };
}

function chartColor(metric) {
  if (metric === 'volume')             return '#D1FF26';
  if (metric === 'sessions')           return '#ffe56b';
  if (metric === 'cardio')             return '#00e3fd';
  if (metric === 'duration')           return '#ffe56b';
  if (metric === 'recovery')           return '#34d399';
  if (metric?.startsWith('ex:'))       return exercisePalette(metric.slice(3))[4];
  return '#D1FF26';
}

function fmtChartTotal(total, metric, units) {
  if (metric === 'volume')   return fmtVolume(total, units);
  if (metric === 'sessions') return `${total}`;
  if (metric === 'duration') return total > 0 ? `${total}m avg` : '—';
  if (metric === 'cardio')   return total > 0 ? `${total}m` : '—';
  if (metric === 'recovery') return total > 0 ? `${total}%` : '—';
  if (metric?.startsWith('ex:')) return fmtVolume(total, units);
  return String(total);
}

function fmtChartLabel(metric, period) {
  const periodLabel = period === 7 ? 'this week'
    : period === 30 ? 'last 30 days'
    : period === 90 ? 'last 90 days'
    : period === 365 ? 'this year'
    : 'all time';
  if (metric === 'volume')   return `Total Volume · ${periodLabel}`;
  if (metric === 'sessions') return `Sessions · ${periodLabel}`;
  if (metric === 'duration') return `Avg Duration · ${periodLabel}`;
  if (metric === 'cardio')   return `Cardio Duration · ${periodLabel}`;
  if (metric === 'recovery') return `Avg Recovery · ${periodLabel}`;
  if (metric?.startsWith('ex:')) return `${metric.slice(3)} · ${periodLabel}`;
  return periodLabel;
}

// ── Activity heatmap ───────────────────────────────────────────────────────

const HMAP_CELL  = 11;
const HMAP_GAP   = 2;
const HMAP_STEP  = HMAP_CELL + HMAP_GAP;
const HMAP_L     = 16;
const HMAP_T     = 14;
const HMAP_H     = HMAP_T + 7 * HMAP_STEP;

const HMAP_BUILTIN_SCALES = {
  volume:   ['#1e1e1e', '#263800', '#446500', '#80a000', '#D1FF26'],
  cardio:   ['#1e1e1e', '#002530', '#004455', '#007080', '#00e3fd'],
  sessions: ['#1e1e1e', '#281e00', '#4a3800', '#7a5e00', '#ffe56b'],
  recovery: ['#1e1e1e', '#001a12', '#00472e', '#008a5a', '#34d399'],
};

const EXERCISE_PALETTES = [
  ['#1e1e1e', '#002530', '#004455', '#007080', '#00e3fd'],
  ['#1e1e1e', '#1a0030', '#3d0060', '#7a00c0', '#c084fc'],
  ['#1e1e1e', '#200800', '#5c2000', '#b04000', '#f97316'],
  ['#1e1e1e', '#001800', '#003800', '#006800', '#22c55e'],
  ['#1e1e1e', '#1e1020', '#4a2060', '#8040b0', '#e879f9'],
];

function exercisePalette(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return EXERCISE_PALETTES[Math.abs(h) % EXERCISE_PALETTES.length];
}

function getScale(metric) {
  if (HMAP_BUILTIN_SCALES[metric]) return HMAP_BUILTIN_SCALES[metric];
  if (metric?.startsWith('ex:')) return exercisePalette(metric.slice(3));
  return HMAP_BUILTIN_SCALES.volume;
}

function getCellValue(entry, metric, recoveryMap, key) {
  if (metric === 'recovery')  return recoveryMap?.[key] ?? 0;
  if (metric === 'volume')    return entry?.volume ?? 0;
  if (metric === 'cardio')    return entry?.cardio_minutes ?? 0;
  if (metric === 'sessions')  return entry?.sessions ?? 0;
  if (metric?.startsWith('ex:')) return entry?.exercises?.[metric.slice(3)] ?? 0;
  return 0;
}

function fmtHmapVal(val, metric, units) {
  if (metric === 'volume')    return fmtVolume(val, units);
  if (metric === 'cardio')    return `${val}m`;
  if (metric === 'sessions')  return `${val} session${val !== 1 ? 's' : ''}`;
  if (metric === 'recovery')  return `${val}% recovery`;
  if (metric?.startsWith('ex:')) return fmtVolume(val, units);
  return String(val);
}

function lvl(val, maxVal) {
  if (!val || maxVal <= 0) return 0;
  const p = val / maxVal;
  if (p < 0.25) return 1;
  if (p < 0.50) return 2;
  if (p < 0.75) return 3;
  return 4;
}

function ActivityHeatmap({ hmapData, hmapLoading, recoveryMap, metric, onMetricChange,
                           hmapYear, onYearChange, yearOptions, exercises, units }) {
  const days    = hmapData?.days ?? {};
  const rolling = hmapData?.rolling ?? true;

  const { cells, monthLabels, totalCols } = useMemo(() => {
    const today = new Date();

    if (rolling || !hmapData?.year) {
      // Rolling 52-week window
      const isoDay = (today.getDay() + 6) % 7;
      const monday = new Date(today);
      monday.setDate(today.getDate() - isoDay);
      const WEEKS = 52;
      const cells = [];
      for (let col = 0; col < WEEKS; col++) {
        for (let row = 0; row < 7; row++) {
          const d = new Date(monday);
          d.setDate(monday.getDate() - (WEEKS - 1 - col) * 7 + row);
          const key = localDateKey(d.toISOString());
          cells.push({ col, row, key, entry: days[key] ?? null, isFuture: d > today });
        }
      }
      const labels = [];
      let lastMonth = -1;
      for (let col = 0; col < WEEKS; col++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() - (WEEKS - 1 - col) * 7);
        const m = d.getMonth();
        if (m !== lastMonth) {
          labels.push({ col, text: d.toLocaleDateString('en-US', { month: 'short' }) });
          lastMonth = m;
        }
      }
      return { cells, monthLabels: labels, totalCols: WEEKS };
    } else {
      // Fixed calendar year grid
      const yr = hmapData.year;
      const jan1 = new Date(yr, 0, 1);
      const dec31 = new Date(yr, 11, 31);
      const startOffset = (jan1.getDay() + 6) % 7; // Mon=0 padding
      const totalDays = Math.round((dec31 - jan1) / 86400000) + 1;
      const totalWeeks = Math.ceil((startOffset + totalDays) / 7);
      const cells = [];
      for (let col = 0; col < totalWeeks; col++) {
        for (let row = 0; row < 7; row++) {
          const cellIndex = col * 7 + row - startOffset;
          if (cellIndex < 0 || cellIndex >= totalDays) {
            cells.push({ col, row, key: null, entry: null, isFuture: false, blank: true });
            continue;
          }
          const d = new Date(yr, 0, 1 + cellIndex);
          const key = localDateKey(d.toISOString());
          cells.push({ col, row, key, entry: days[key] ?? null, isFuture: d > today, blank: false });
        }
      }
      const labels = [];
      let lastMonth2 = -1;
      for (let col = 0; col < totalWeeks; col++) {
        const cellIndex = col * 7 - startOffset;
        if (cellIndex < 0) continue;
        const d = new Date(yr, 0, 1 + cellIndex);
        const m = d.getMonth();
        if (m !== lastMonth2) {
          labels.push({ col, text: d.toLocaleDateString('en-US', { month: 'short' }) });
          lastMonth2 = m;
        }
      }
      return { cells, monthLabels: labels, totalCols: totalWeeks };
    }
  }, [hmapData, rolling, days]);

  const maxVal = useMemo(() =>
    Math.max(1, ...cells.filter(c => !c.isFuture && !c.blank).map(c => getCellValue(c.entry, metric, recoveryMap, c.key)))
  , [cells, metric, recoveryMap]);

  const scale     = getScale(metric);
  const activeDays = cells.filter(c => !c.isFuture && !c.blank && getCellValue(c.entry, metric, recoveryMap, c.key) > 0).length;
  const HMAP_W    = HMAP_L + totalCols * HMAP_STEP;

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Activity</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {activeDays} active days
            {hmapData?.rolling ? ' · last 12 months' : hmapData?.year ? ` · ${hmapData.year}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year selector */}
          {yearOptions.length > 1 && (
            <select
              value={hmapYear ?? ''}
              onChange={e => onYearChange(e.target.value === '' ? null : parseInt(e.target.value))}
              className="bg-[#1a1a1a] border border-[#1e1e1e] text-zinc-400 text-[10px] font-bold rounded px-2 py-1 focus:outline-none cursor-pointer"
            >
              {yearOptions.map(opt => (
                <option key={opt.label} value={opt.value ?? ''}>{opt.label}</option>
              ))}
            </select>
          )}
          {/* Metric dropdown */}
          <MetricDropdown value={metric} onChange={onMetricChange} exercises={exercises} />
        </div>
      </div>

      <div className="relative overflow-x-auto">
        {hmapLoading && (
          <div className="absolute inset-0 bg-[#111]/70 rounded flex items-center justify-center z-10">
            <Icon name="autorenew" className="text-zinc-600 animate-spin text-lg" />
          </div>
        )}
        <svg
          viewBox={`0 0 ${HMAP_W} ${HMAP_H}`}
          style={{ display: 'block', minWidth: Math.min(HMAP_W, 520) }}
          width="100%"
          preserveAspectRatio="xMinYMin meet"
        >
          {/* Month labels */}
          {monthLabels.map((ml, i) => (
            <text key={i} x={HMAP_L + ml.col * HMAP_STEP} y={HMAP_T - 4} fill="#555" fontSize="8">
              {ml.text}
            </text>
          ))}
          {/* Day labels: M / W / F */}
          {[[0, 'M'], [2, 'W'], [4, 'F']].map(([row, lbl]) => (
            <text key={lbl} x={0} y={HMAP_T + row * HMAP_STEP + HMAP_CELL - 1} fill="#555" fontSize="8">
              {lbl}
            </text>
          ))}
          {/* Cells */}
          {cells.map((c, i) => {
            if (c.blank) return null;
            const val = getCellValue(c.entry, metric, recoveryMap, c.key);
            return (
              <rect key={i}
                x={HMAP_L + c.col * HMAP_STEP}
                y={HMAP_T  + c.row * HMAP_STEP}
                width={HMAP_CELL} height={HMAP_CELL}
                rx="2"
                fill={scale[c.isFuture ? 0 : lvl(val, maxVal)]}
                opacity={c.isFuture ? 0.35 : 1}
              >
                {!c.isFuture && c.key && (
                  <title>{c.key}{val ? ` · ${fmtHmapVal(val, metric, units)}` : ''}</title>
                )}
              </rect>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-end gap-1 mt-3">
        <span className="text-[9px] text-zinc-700 mr-0.5">Less</span>
        {scale.map((bg, i) => (
          <div key={i} style={{ background: bg, width: 9, height: 9, borderRadius: 2, flexShrink: 0 }} />
        ))}
        <span className="text-[9px] text-zinc-700 ml-0.5">More</span>
      </div>
    </div>
  );
}

// ── Page constants ─────────────────────────────────────────────────────────

const R_CIRC  = 2 * Math.PI * 44;
const PERIODS = [
  { value: 7,     label: '7d' },
  { value: 30,    label: '30d' },
  { value: 90,    label: '90d' },
  { value: 365,   label: '1y' },
  { value: 'all', label: 'All' },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function PerformanceDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { units } = useUnits();

  const [workouts, setWorkouts]   = useState([]);
  const [stats, setStats]         = useState(null);
  const [prs, setPrs]             = useState([]);
  const [latestBio, setLatestBio] = useState(undefined);
  const [loading, setLoading]     = useState(true);
  const [period, setPeriod]       = useState(7);
  const [chartMetric, setChartMetric] = useState('volume');

  // Heatmap state
  const [hmapData, setHmapData]       = useState(null);
  const [hmapLoading, setHmapLoading] = useState(false);
  const [hmapYear, setHmapYear]       = useState(null);
  const [hmapMetric, setHmapMetric]   = useState('volume');
  const [exercises, setExercises]     = useState([]);

  // All-time workouts (lazy)
  const [allWorkouts, setAllWorkouts] = useState(null);

  // Last session muscle activation
  const [sessionMuscles, setSessionMuscles] = useState({ primary: [], secondary: [] });

  useEffect(() => {
    Promise.all([
      apiGetWorkouts({ limit: 200 }),
      apiGetWorkoutStats().catch(() => null),
      apiGetWorkoutPRs().catch(() => []),
      apiGetLatestBiometric().catch(() => null),
      apiGetWorkoutHeatmap().catch(() => null),
      apiGetWorkoutExercises().catch(() => []),
    ]).then(([ws, st, prList, bio, hmap, exNames]) => {
      setWorkouts(ws);
      setStats(st);
      setPrs((prList ?? []).slice(0, 3).map(pr => ({
        exercise: pr.name,
        value: units === 'imperial'
          ? `${+(pr.weight_kg * 2.20462).toFixed(1)} lbs`
          : `${+Number(pr.weight_kg).toFixed(1)} kg`,
        date: pr.date,
      })));
      setLatestBio(bio);
      if (hmap) setHmapData(hmap);
      setExercises(exNames ?? []);

      // Fetch muscle activation for last session
      if (ws.length > 0) {
        const lastWorkout = ws[0];
        const liftNames = [...new Set(
          (lastWorkout.activities ?? [])
            .filter(a => a.type === 'lift')
            .map(a => a.name)
        )];
        if (liftNames.length > 0) {
          apiGetSessionMuscles(liftNames)
            .then(m => setSessionMuscles(m))
            .catch(() => {});
        }
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [units]);

  // Lazy fetch all workouts when longer periods selected
  useEffect(() => {
    if ((period === 365 || period === 'all') && allWorkouts === null) {
      apiGetWorkouts({ limit: 1000 }).then(setAllWorkouts).catch(() => setAllWorkouts([]));
    }
  }, [period]);

  // Recovery map — EMA of training load from recent workouts
  const recoveryMap = useMemo(() => {
    if (!workouts.length) return {};
    const loadMap = {};
    for (const w of workouts) {
      const key = localDateKey(w.started_at);
      loadMap[key] = (loadMap[key] ?? 0) + calcVolume(w.activities);
    }
    const alpha = 0.25;
    let ema = 0;
    const emaMap = {};
    for (const d of Object.keys(loadMap).sort()) {
      ema = alpha * loadMap[d] + (1 - alpha) * ema;
      emaMap[d] = ema;
    }
    const maxEma = Math.max(...Object.values(emaMap), 1);
    const result = {};
    for (const [d, e] of Object.entries(emaMap)) {
      result[d] = Math.round((1 - e / maxEma) * 100);
    }
    return result;
  }, [workouts]);

  // Year options for heatmap
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const memberYear = user?.created_at ? new Date(user.created_at).getFullYear() : current;
    const opts = [{ value: null, label: 'Past Year' }];
    for (let y = current; y >= memberYear; y--) opts.push({ value: y, label: String(y) });
    return opts;
  }, [user?.created_at]);

  async function handleHmapYearChange(year) {
    setHmapYear(year);
    setHmapLoading(true);
    try {
      const data = await apiGetWorkoutHeatmap(year);
      setHmapData(data);
    } catch {}
    finally { setHmapLoading(false); }
  }

  const chartWorkouts = period <= 90 ? workouts : (allWorkouts ?? workouts);
  const chart = useMemo(
    () => buildChart(chartWorkouts, period, chartMetric, recoveryMap),
    [chartWorkouts, period, chartMetric, recoveryMap]
  );

  const recentWorkouts = workouts.slice(0, 5);

  // ── Training summary stats ─────────────────────────────────────────────
  const now = new Date();
  const thisMonthWorkouts = workouts.filter(w => {
    const d = new Date(w.started_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const streak         = stats?.current_streak_days  ?? (loading ? 0 : calcStreak(workouts));
  const totalSessions  = stats?.total_sessions        ?? workouts.length;
  const thisMonthCount = stats?.this_month_sessions   ?? thisMonthWorkouts.length;
  const thisMonthVolKg = stats?.this_month_volume_kg  ?? thisMonthWorkouts.reduce((s, w) => s + calcVolume(w.activities), 0);
  const monthVolume    = fmtVolume(thisMonthVolKg, units);
  const monthName      = now.toLocaleDateString('en-US', { month: 'short' });

  // ── Readiness ring ─────────────────────────────────────────────────────
  const readinessPct   = latestBio !== undefined ? calcReadiness(latestBio) : undefined;
  const readinessLabel = readinessPct == null ? null
    : readinessPct >= 80 ? 'Primed' : readinessPct >= 65 ? 'Ready' : 'Rest';
  const readinessColor = readinessPct == null ? '#adaaaa'
    : readinessPct >= 80 ? '#D1FF26' : readinessPct >= 65 ? '#ffe56b' : '#d53d18';
  const readinessMsg   = readinessPct == null ? 'No wellness data logged today.'
    : readinessPct >= 80 ? 'Well-recovered — push hard today.'
    : readinessPct >= 65 ? 'Moderate readiness. Listen to your body.'
    : 'Consider active recovery today.';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5 animate-in fade-in duration-500">

      {/* Header */}
      <h1 className="text-xl font-headline font-black tracking-tight text-white">Dashboard</h1>

      {/* Row 1: Muscles Worked (left) + Readiness & Training combined (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Left — Readiness + Training stacked in one card */}
        <div className={`bg-[#111] border border-[#1e1e1e] rounded-xl p-6 flex flex-col gap-6 ${(!loading && workouts.length > 0) ? '' : 'lg:col-span-2'}`}>

          {/* Readiness ring */}
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="transparent" stroke="#1e1e1e" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="44" fill="transparent"
                  stroke={readinessColor}
                  strokeWidth="8"
                  strokeDasharray={R_CIRC}
                  strokeDashoffset={R_CIRC - ((readinessPct ?? 0) / 100) * R_CIRC}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-headline font-bold text-white">{readinessPct ?? '—'}</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Readiness</p>
              <p className="text-lg font-bold" style={{ color: readinessColor }}>{readinessLabel ?? '—'}</p>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">{readinessMsg}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#1e1e1e]" />

          {/* Training stats */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-4">Training</p>
            <div className="divide-y divide-[#1e1e1e]">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))
              ) : [
                { label: 'Total sessions',           value: totalSessions,                               icon: 'fitness_center',        color: '#D1FF26' },
                { label: `Sessions in ${monthName}`,  value: thisMonthCount,                             icon: 'calendar_month',        color: '#00e3fd' },
                { label: 'Current streak',            value: `${streak} day${streak !== 1 ? 's' : ''}`,  icon: 'local_fire_department', color: '#ff7351' },
                { label: `Volume in ${monthName}`,    value: monthVolume || '—',                         icon: 'show_chart',            color: '#ffe56b' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Icon name={s.icon} className="text-sm" style={{ color: s.color }} />
                    <span className="text-xs text-zinc-500">{s.label}</span>
                  </div>
                  <span className="text-sm font-bold text-white">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — last session muscles */}
        {!loading && workouts.length > 0 && (
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Last Session · Muscles Worked</p>
              <span className="text-[10px] text-zinc-700">{workouts[0].name}</span>
            </div>
            <MuscleMap
              primary={sessionMuscles.primary}
              secondary={sessionMuscles.secondary}
              gender={user?.gender ?? 'male'}
            />
          </div>
        )}
      </div>

      {/* Bar chart */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-2xl font-headline font-bold text-white">
              {loading ? '—' : fmtChartTotal(chart.total, chartMetric, units)}
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">{fmtChartLabel(chartMetric, period)}</p>
            {chart.shiftNote && (
              <p className="text-[9px] text-[#ffe56b] mt-1">{chart.shiftNote}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period buttons */}
            <div className="flex gap-0.5">
              {PERIODS.map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-colors ${
                    period === p.value ? 'bg-[#D1FF26] text-zinc-950' : 'text-zinc-600 hover:text-zinc-400'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Metric dropdown */}
            <MetricDropdown value={chartMetric} onChange={setChartMetric} exercises={exercises} />
          </div>
        </div>
        {(period === 365 || period === 'all') && allWorkouts === null ? (
          <div className="h-32 flex items-center justify-center">
            <Icon name="autorenew" className="text-zinc-700 animate-spin text-xl" />
          </div>
        ) : (
          <div className="flex items-end justify-between gap-1.5 h-32 overflow-x-auto pb-1">
            {chart.labels.map((label, i) => {
              const barH = Math.max(Math.round((chart.pcts[i] / 100) * 104), 3);
              const isCurrentBucket = i === chart.labels.length - 1 && !chart.shiftNote;
              const color = chartColor(chartMetric);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 min-w-0" style={{ minWidth: period === 'all' ? 20 : undefined }}>
                  <div
                    className="w-full rounded-t transition-all duration-500"
                    style={{
                      height: barH,
                      backgroundColor: chart.pcts[i] > 0 ? color : '#171717',
                      opacity: chart.pcts[i] > 0 ? (isCurrentBucket ? 1 : 0.3) : 1,
                    }}
                    title={fmtChartTotal(chart.values[i], chartMetric, units)}
                  />
                  <span className="text-[8px] text-zinc-700 font-bold uppercase truncate w-full text-center">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity heatmap */}
      <ActivityHeatmap
        hmapData={hmapData}
        hmapLoading={hmapLoading}
        recoveryMap={recoveryMap}
        metric={hmapMetric}
        onMetricChange={setHmapMetric}
        hmapYear={hmapYear}
        onYearChange={handleHmapYearChange}
        yearOptions={yearOptions}
        exercises={exercises}
        units={units}
      />

      {/* Recent Activity + Top Lifts */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">

        {/* Recent activity */}
        <div className="md:col-span-3 bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Recent Activity</p>
            <button
              onClick={() => navigate('/history')}
              className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              See all →
            </button>
          </div>

          {loading ? (
            <div className="divide-y divide-[#1e1e1e]">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <Skeleton className="h-8 w-8 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentWorkouts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-zinc-600 text-sm mb-3">No workouts yet.</p>
              <button
                onClick={() => navigate('/track')}
                className="text-xs text-[#D1FF26] font-bold uppercase tracking-widest hover:text-[#f4ffc9] transition-colors"
              >
                Track first workout →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#1e1e1e]">
              {recentWorkouts.map(w => (
                <div
                  key={w.id}
                  onClick={() => navigate(`/history/${w.id}`)}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-[#171717] -mx-5 px-5 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-right flex-shrink-0 w-9">
                      <p className="text-[9px] text-zinc-600 uppercase">{fmtDate(w.started_at).split(' ')[0]}</p>
                      <p className="text-base font-headline font-bold text-white leading-none">{fmtDate(w.started_at).split(' ')[1]}</p>
                    </div>
                    <div className="w-px h-8 bg-[#1e1e1e] flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate group-hover:text-[#D1FF26] transition-colors">{w.name}</p>
                      <p className="text-xs text-zinc-600">{fmtDuration(w.started_at, w.completed_at)} · {fmtVolume(calcVolume(w.activities), units)}</p>
                    </div>
                  </div>
                  <Icon name="chevron_right" className="text-zinc-700 group-hover:text-zinc-400 text-sm flex-shrink-0 ml-2" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top lifts */}
        <div className="md:col-span-2 bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-4">Top Lifts</p>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : prs.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-zinc-700 text-xs">Log some lifts to see your bests.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#1e1e1e]">
              {prs.map((pr, i) => (
                <button
                  key={i}
                  onClick={() => navigate('/ai-coach', { state: { prompt: `Show me my ${pr.exercise} progress over time` } })}
                  className="w-full text-left py-3 first:pt-0 last:pb-0 hover:bg-[#171717] -mx-5 px-5 transition-colors group"
                >
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">{pr.exercise}</p>
                  <div className="flex items-end justify-between">
                    <span className="text-lg font-headline font-bold text-[#D1FF26]">{pr.value}</span>
                    <span className="text-[9px] text-zinc-700 group-hover:text-zinc-500 transition-colors">{pr.date}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}
