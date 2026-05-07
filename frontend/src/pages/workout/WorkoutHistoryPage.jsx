import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiGetWorkouts, apiDeleteWorkout, apiExportWorkouts } from '../../lib/api';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeRange(startedAt, completedAt) {
  const fmt = dt => new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (!completedAt) return `${fmt(startedAt)} – in progress`;
  return `${fmt(startedAt)} – ${fmt(completedAt)}`;
}

function formatDuration(startedAt, completedAt) {
  if (!completedAt) return '—';
  const mins = Math.round((new Date(completedAt) - new Date(startedAt)) / 60000);
  return `${mins}m`;
}

function calcVolume(activities) {
  let total = 0;
  for (const a of activities) {
    if (a.type !== 'lift') continue;
    for (const s of a.sets ?? []) {
      const w = s.current_performance?.weight_kg ?? s.target_performance?.weight_kg ?? 0;
      const r = s.current_performance?.reps ?? s.target_performance?.reps ?? 0;
      total += w * r;
    }
  }
  if (total === 0) return '—';
  return total >= 1000
    ? `${(total / 1000).toFixed(1)}k KG`
    : `${Math.round(total)} KG`;
}

function calcMonthlyStats(workouts) {
  const now = new Date();
  const thisMonth = workouts.filter(w => {
    const d = new Date(w.started_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  let totalVolume = 0;
  let totalDuration = 0;
  let durationCount = 0;

  for (const w of thisMonth) {
    for (const a of w.activities ?? []) {
      if (a.type !== 'lift') continue;
      for (const s of a.sets ?? []) {
        const wt = s.current_performance?.weight_kg ?? s.target_performance?.weight_kg ?? 0;
        const r = s.current_performance?.reps ?? s.target_performance?.reps ?? 0;
        totalVolume += wt * r;
      }
    }
    if (w.completed_at) {
      totalDuration += (new Date(w.completed_at) - new Date(w.started_at)) / 60000;
      durationCount++;
    }
  }

  const volumeDisplay = totalVolume >= 1000
    ? `${(totalVolume / 1000).toFixed(1)}k`
    : `${Math.round(totalVolume)}`;
  const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;

  return {
    volume: volumeDisplay,
    count: thisMonth.length,
    avgDuration,
  };
}

const SORT_MODES = ['newest', 'oldest', 'volume'];

export default function WorkoutHistoryPage() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [sortMode, setSortMode] = useState('newest');
  const [filterOpen, setFilterOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [completedOnly, setCompletedOnly] = useState(false);

  useEffect(() => {
    apiGetWorkouts({ limit: 200 })
      .then(setWorkouts)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      await apiDeleteWorkout(id);
      setWorkouts(ws => ws.filter(w => w.id !== id));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('kinetic:toast', { detail: { message: err.message, type: 'error' } }));
    } finally {
      setDeletingId(null);
    }
  }

  function cycleSortMode() {
    setSortMode(cur => {
      const idx = SORT_MODES.indexOf(cur);
      return SORT_MODES[(idx + 1) % SORT_MODES.length];
    });
  }

  const inProgressWorkouts = workouts.filter(w => w.started_at && !w.completed_at);

  let filtered = workouts.filter(w => {
    const q = query.toLowerCase();
    if (q) {
      const nameMatch = w.name.toLowerCase().includes(q);
      const dateMatch = formatDate(w.started_at).toLowerCase().includes(q);
      const actMatch = (w.activities ?? []).some(a => a.name?.toLowerCase().includes(q));
      if (!nameMatch && !dateMatch && !actMatch) return false;
    }
    if (startDate && w.started_at.slice(0, 10) < startDate) return false;
    if (endDate && w.started_at.slice(0, 10) > endDate) return false;
    if (completedOnly && !w.completed_at) return false;
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    if (sortMode === 'newest') return new Date(b.started_at) - new Date(a.started_at);
    if (sortMode === 'oldest') return new Date(a.started_at) - new Date(b.started_at);
    if (sortMode === 'volume') return calcVolume(b.activities ?? []) - calcVolume(a.activities ?? []);
    return 0;
  });

  const stats = calcMonthlyStats(workouts);

  return (
    <div className="flex-1 min-h-screen bg-[#0e0e0e]">
      {/* In-progress banner */}
      {!loading && inProgressWorkouts.length > 0 && (
        <div className="px-8 pt-4">
          <div className="bg-[#00e3fd]/10 border border-[#00e3fd]/20 rounded-lg px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#00e3fd] animate-pulse" />
              <span className="text-sm text-[#00e3fd] font-bold">Workout in progress</span>
              <span className="text-xs text-zinc-400">{inProgressWorkouts[0].name}</span>
            </div>
            <button onClick={() => navigate('/track')} className="text-xs font-bold text-[#00e3fd] uppercase tracking-widest hover:text-[#f4ffc9] transition-colors flex items-center gap-1">
              Resume <Icon name="arrow_forward" className="text-sm" />
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="px-8 pt-4 pb-2 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#131313] px-4 py-2 rounded-full border border-[#484847]/15 flex-1 max-w-md">
            <Icon name="search" className="text-zinc-500 text-sm mr-2" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter by name, exercise, or date..."
              className="bg-transparent border-none focus:ring-0 text-sm text-[#adaaaa] w-full placeholder-zinc-600"
            />
          </div>
          <button
            onClick={() => setCompletedOnly(v => !v)}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded transition-colors ${completedOnly ? 'bg-[#D1FF26] text-zinc-950' : 'bg-[#131313] text-zinc-500 hover:text-white'}`}
          >
            Completed
          </button>
          <button
            onClick={() => apiExportWorkouts().catch(() => {})}
            className="p-2 bg-[#131313] rounded text-zinc-400 hover:text-[#D1FF26] transition-colors"
            title="Export CSV"
          >
            <Icon name="download" />
          </button>
        </div>
        {filterOpen && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="bg-[#131313] border border-[#262626] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#484847]" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">To</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="bg-[#131313] border border-[#262626] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#484847]" />
            </div>
            {(startDate || endDate) && (
              <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-xs text-zinc-600 hover:text-[#d53d18] transition-colors">
                Clear dates
              </button>
            )}
          </div>
        )}
      </div>

      <section className="p-8 space-y-12">
        {/* Stats Bento */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-2 bg-[#131313] p-8 rounded-xl flex flex-col justify-between pulse-shadow-lime relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-zinc-500 font-headline text-xs uppercase tracking-[0.2em] mb-2">Monthly Volume</p>
              <h3 className="text-5xl font-bold font-headline text-[#D1FF26] tracking-tighter leading-none">
                {loading ? '—' : stats.volume} <span className="text-sm font-medium tracking-normal text-zinc-600">KG</span>
              </h3>
            </div>
            <div className="mt-8 flex items-end gap-2 relative z-10">
              <span className="text-[#f4ffc9] font-bold text-sm">{loading ? '' : `${stats.count} sessions`}</span>
              <span className="text-zinc-600 text-xs uppercase tracking-widest">this month</span>
            </div>
            <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-[#D1FF26]/5 rounded-full blur-3xl group-hover:bg-[#D1FF26]/10 transition-colors" />
          </div>

          <div className="bg-[#131313] p-8 rounded-xl flex flex-col justify-between border-b-2 border-transparent hover:border-[#00e3fd] transition-all duration-500">
            <div>
              <p className="text-zinc-500 font-headline text-xs uppercase tracking-[0.2em] mb-2">Workouts</p>
              <h3 className="text-4xl font-bold font-headline text-white">{loading ? '—' : workouts.length}</h3>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <div className="w-full bg-[#262626] h-1 rounded-full overflow-hidden">
                <div className="bg-[#00e3fd] h-full" style={{ width: `${Math.min(100, (stats.count / 30) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-[#00e3fd] font-bold">{stats.count}/mo</span>
            </div>
          </div>

          <div className="bg-[#131313] p-8 rounded-xl flex flex-col justify-between">
            <div>
              <p className="text-zinc-500 font-headline text-xs uppercase tracking-[0.2em] mb-2">Avg. Duration</p>
              <h3 className="text-4xl font-bold font-headline text-white">
                {loading ? '—' : stats.avgDuration || '—'}
                {!loading && stats.avgDuration > 0 && <span className="text-lg text-zinc-500 lowercase ml-1">min</span>}
              </h3>
            </div>
            <div className="mt-4 flex items-center gap-1 text-zinc-500">
              <Icon name="timer" className="text-xs" />
              <span className="text-[10px] uppercase tracking-widest">Per Session</span>
            </div>
          </div>
        </div>

        {/* Workout List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h4 className="text-lg font-bold font-headline tracking-widest uppercase text-zinc-400">Past Sessions</h4>
              {!loading && (
                <span className="px-2 py-0.5 bg-zinc-900 text-zinc-500 text-[10px] font-bold rounded">
                  {workouts.length} TOTAL
                </span>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={cycleSortMode}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#20201f] text-zinc-400 rounded hover:text-[#D1FF26] transition-colors text-[10px] font-bold uppercase tracking-widest"
                title="Cycle sort order"
              >
                <Icon name="sort" className="text-sm" />
                {sortMode}
              </button>
              <button
                onClick={() => setFilterOpen(v => !v)}
                className={`p-2 rounded transition-colors ${filterOpen ? 'bg-[#D1FF26]/20 text-[#D1FF26]' : 'bg-[#20201f] text-zinc-400 hover:text-[#D1FF26]'}`}
                title="Date filter"
              >
                <Icon name="calendar_month" />
              </button>
            </div>
          </div>

          {loading && (
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={`grid grid-cols-12 items-center p-6 ${i % 2 === 0 ? 'bg-[#131313]' : 'bg-[#000000]'}`}>
                  <div className="col-span-4 space-y-2">
                    <Skeleton className="h-2.5 w-20" />
                    <Skeleton className="h-5 w-44" />
                  </div>
                  <div className="col-span-3 space-y-2">
                    <Skeleton className="h-2.5 w-32" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                  <div className="col-span-3 flex gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="py-16 text-center text-[#d53d18] text-sm">{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="py-16 text-center text-zinc-600 text-sm">
              {workouts.length === 0 ? 'No workouts yet. Track your first session!' : 'No results for your search.'}
            </div>
          )}

          <div className="space-y-1">
            {filtered.map((w, i) => (
              <div
                key={w.id}
                onClick={() => navigate(`/history/${w.id}`)}
                className={`group grid grid-cols-12 items-center cursor-pointer ${i % 2 === 0 ? 'bg-[#131313]' : 'bg-[#000000]'} hover:bg-[#262626] transition-all duration-300 p-6 relative`}
              >
                <div className="col-span-4">
                  <p className="text-[10px] text-[#00e3fd] font-bold uppercase tracking-[0.2em] mb-1">{formatDate(w.started_at)}</p>
                  <div className="flex items-center gap-2">
                    <h5 className="text-xl font-bold font-headline group-hover:text-[#D1FF26] transition-colors">{w.name}</h5>
                    {!w.completed_at && (
                      <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-[#00e3fd]/10 text-[#00e3fd] rounded border border-[#00e3fd]/20">
                        In Progress
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-span-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Icon name="schedule" className="text-sm" />
                    <span className="text-xs font-medium">{formatTimeRange(w.started_at, w.completed_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Icon name="timer" className="text-sm" />
                    <span className="text-xs">{formatDuration(w.started_at, w.completed_at)} duration</span>
                  </div>
                </div>
                <div className="col-span-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] bg-[#262626] px-2 py-1 text-zinc-400 rounded-sm">{w.activities?.length ?? 0} ACTIVITIES</span>
                    <span className="text-[10px] bg-[#262626] px-2 py-1 text-zinc-400 rounded-sm">{calcVolume(w.activities ?? [])}</span>
                  </div>
                </div>
                <div className={`col-span-2 flex justify-end gap-4 transition-opacity ${confirmDeleteId === w.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  {confirmDeleteId === w.id ? (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(w.id); }} disabled={deletingId === w.id}
                        className="text-[10px] font-bold text-[#d53d18] uppercase tracking-wider disabled:opacity-40">
                        {deletingId === w.id ? '…' : 'Delete'}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(w.id); }}
                      className="text-zinc-500 hover:text-[#d53d18] transition-colors"
                      title="Delete workout"
                    >
                      <Icon name="delete" className="text-xl" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/history/${w.id}`); }}
                    className="text-[#D1FF26] font-bold uppercase text-[10px] tracking-widest flex items-center gap-1 hover:text-[#f4ffc9]"
                  >
                    View Details
                    <Icon name="arrow_forward" className="text-sm" />
                  </button>
                </div>
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#D1FF26] scale-y-0 group-hover:scale-y-100 transition-transform duration-300" />
              </div>
            ))}
          </div>
        </div>

        {/* Featured section — shown only when there are workouts */}
        {workouts.length > 0 && (
          <div className="grid grid-cols-12 gap-8 items-stretch">
            <div className="col-span-12 lg:col-span-7 bg-[#131313] rounded-xl p-8 relative overflow-hidden flex flex-col justify-center">
              <div className="relative z-10 space-y-4">
                <span className="text-[#00e3fd] font-bold text-[10px] uppercase tracking-[0.4em]">Most recent session</span>
                <h3 className="text-4xl lg:text-5xl font-black font-headline tracking-tighter leading-tight max-w-md">
                  {workouts[0].name.toUpperCase()}
                </h3>
                <p className="text-zinc-500 text-sm max-w-sm">
                  {formatDate(workouts[0].started_at)} · {workouts[0].activities?.length ?? 0} activities · {calcVolume(workouts[0].activities ?? [])}
                </p>
              </div>
              <div className="absolute -right-4 -bottom-12 text-[10rem] font-black italic text-zinc-900 select-none leading-none opacity-20 font-headline">GO</div>
            </div>

            <div className="col-span-12 lg:col-span-5 bg-[#262626] rounded-xl relative overflow-hidden min-h-[300px]">
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] to-[#262626]" />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
              <div className="absolute bottom-8 left-8 right-8">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[#00e3fd] shadow-[0_0_8px_rgba(0,227,253,0.8)]" />
                  <span className="text-[10px] font-bold text-[#00e3fd] uppercase tracking-widest">All Time</span>
                </div>
                <h4 className="text-2xl font-bold font-headline leading-tight">{workouts.length} WORKOUTS LOGGED</h4>
              </div>
            </div>
          </div>
        )}
      </section>
      <div className="h-24" />
    </div>
  );
}
