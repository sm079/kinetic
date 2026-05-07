import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  apiGetPrograms, apiDeleteProgram, apiGetTemplates, apiGetTemplate,
  apiImportTemplate, apiGetActiveProgram, apiFollowProgram, apiUnfollowProgram,
  apiGetWorkouts, apiDeleteWorkout, apiExportWorkouts,
} from '../../lib/api';
import { hydrateActivitiesForTracker } from '../../lib/workout';
import { useUnits } from '../../lib/units';

const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const EQUIP_LABEL = { full_gym: 'Full Gym', home_gym: 'Home Gym', bodyweight_only: 'Bodyweight' };

// ── Template Preview Modal ─────────────────────────────────────────────────

function TemplatePreviewModal({ templateId, onFollow, onEdit, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openWeek, setOpenWeek] = useState(0);
  const [openDay, setOpenDay] = useState(0);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    apiGetTemplate(templateId).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [templateId]);

  async function handleFollow() { setImporting(true); try { await onFollow(templateId); } finally { setImporting(false); } }
  async function handleEdit()   { setImporting(true); try { await onEdit(templateId); }   finally { setImporting(false); } }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#0e0e0e] border border-[#222] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b border-[#1a1a1a]">
          <div className="flex-1 min-w-0 pr-4">
            {loading ? (
              <div className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-2/3" /></div>
            ) : data ? (
              <>
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#00e3fd]">Template</span>
                <h2 className="text-2xl font-bold tracking-tight text-white mt-1">{data.name}</h2>
                {data.tagline && <p className="text-zinc-400 text-sm italic mt-1">{data.tagline}</p>}
                {data.description && <p className="text-zinc-600 text-xs mt-2 max-w-xl">{data.description}</p>}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {data.details?.level && <Chip>{LEVEL_LABEL[data.details.level] ?? data.details.level}</Chip>}
                  {data.details?.equipment && <Chip>{EQUIP_LABEL[data.details.equipment] ?? data.details.equipment}</Chip>}
                  {data.details?.duration_weeks && <Chip>{data.details.duration_weeks}w</Chip>}
                  {data.details?.days_per_week && <Chip>{data.details.days_per_week}×/week</Chip>}
                  {data.details?.minutes_per_workout && <Chip>~{data.details.minutes_per_workout} min</Chip>}
                </div>
              </>
            ) : null}
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-white transition-colors">
            <Icon name="close" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {loading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          {!loading && data && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-4">
                {data.week_count} week{data.week_count !== 1 ? 's' : ''}
              </p>
              {data.weeks.map((week, wi) => (
                <div key={wi} className="bg-[#111] rounded-xl overflow-hidden border border-[#1a1a1a]">
                  <button onClick={() => { setOpenWeek(openWeek === wi ? -1 : wi); setOpenDay(0); }}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1a1a1a] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold bg-[#D1FF26] text-zinc-950 px-2 py-0.5 rounded">W{week.week}</span>
                      <span className="text-sm font-bold text-white">Week {week.week}</span>
                      <span className="text-xs text-zinc-600">{week.days.length} days</span>
                    </div>
                    <Icon name={openWeek === wi ? 'expand_less' : 'expand_more'} className="text-zinc-500 text-sm" />
                  </button>
                  {openWeek === wi && (
                    <div className="border-t border-[#1a1a1a]">
                      <div className="flex gap-1 px-4 pt-3 overflow-x-auto scrollbar-none">
                        {week.days.map((day, di) => (
                          <button key={di} onClick={() => setOpenDay(di)}
                            className={`flex-shrink-0 px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-colors ${openDay === di ? 'bg-[#D1FF26] text-zinc-950' : 'bg-[#1a1a1a] text-zinc-500 hover:text-white'}`}>
                            {day.label || `Day ${day.day}`}
                          </button>
                        ))}
                      </div>
                      <div className="p-4">
                        {(() => {
                          const day = week.days[openDay];
                          if (!day) return null;
                          if (day.activities.length === 0) return (
                            <div className="flex items-center gap-2 py-4 text-zinc-600">
                              <Icon name="hotel" className="text-sm" />
                              <span className="text-sm font-bold uppercase tracking-widest">Rest Day</span>
                            </div>
                          );
                          return (
                            <div className="space-y-2">
                              {day.activities.map((act, ai) => (
                                <div key={ai} className="flex items-center gap-3 bg-[#1a1a1a] rounded-lg px-3 py-2.5">
                                  <Icon name="fitness_center" className="text-zinc-600 text-xs flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white">{act.name}</p>
                                    {act.sets?.length > 0 && (
                                      <p className="text-[10px] text-zinc-600 mt-0.5">
                                        {act.sets.filter(s => !s.is_warmup).length} working set{act.sets.filter(s => !s.is_warmup).length !== 1 ? 's' : ''}
                                        {act.sets.find(s => !s.is_warmup)?.target_performance?.reps != null
                                          ? ` · ${act.sets.find(s => !s.is_warmup).target_performance.reps} reps` : ''}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="p-4 border-t border-[#1a1a1a] flex gap-3">
          <button onClick={handleEdit} disabled={importing || loading || !data}
            className="flex-1 py-2.5 border border-[#222] text-zinc-400 text-xs font-bold uppercase tracking-widest rounded-lg hover:text-white hover:border-[#444] transition-colors disabled:opacity-40">
            Customise &amp; Edit
          </button>
          <button onClick={handleFollow} disabled={importing || loading || !data}
            className="flex-1 py-2.5 bg-[#D1FF26] text-zinc-950 font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-[#e8ff50] transition-colors disabled:opacity-40">
            {importing ? 'Adding…' : 'Follow Program'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small reusable chip ────────────────────────────────────────────────────

function Chip({ children, accent }) {
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${accent ? 'bg-[#D1FF26]/10 text-[#D1FF26]' : 'bg-[#1e1e1e] text-zinc-500'}`}>
      {children}
    </span>
  );
}

// ── Active Program Card ────────────────────────────────────────────────────

function ActiveProgramCard({ program, onStartSession, onUnfollow, unfollowing }) {
  const navigate = useNavigate();
  const d = program.current_day_data;

  return (
    <div className="bg-[#111] border border-[#D1FF26]/15 rounded-2xl p-5 mb-8">
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D1FF26] animate-pulse flex-shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D1FF26]">Active Program</span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight truncate">{program.name}</h2>
          {d ? (
            <p className="text-sm text-zinc-400 mt-0.5">
              Week {d.week} · Day {d.day}{d.label ? ` — ${d.label}` : ''}
            </p>
          ) : (
            <p className="text-xs text-zinc-600 mt-0.5">Program complete</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-3 flex-shrink-0">
          <button onClick={() => navigate(`/programs/${program.id}`)}
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded" title="View details">
            <Icon name="open_in_new" className="text-sm" />
          </button>
          <button onClick={onUnfollow} disabled={unfollowing}
            className="p-1.5 text-zinc-700 hover:text-[#d53d18] transition-colors rounded disabled:opacity-40" title="Unfollow">
            <Icon name="close" className="text-sm" />
          </button>
        </div>
      </div>

      {/* Exercise preview */}
      {d?.activities?.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {d.activities.slice(0, 5).map((act, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">{act.name}</span>
              {act.type === 'lift' && act.sets?.length > 0 && (
                <span className="text-xs text-zinc-600 font-mono tabular-nums">
                  {act.sets.filter(s => !s.is_warmup).length}
                  <span className="text-zinc-700 mx-0.5">×</span>
                  {act.sets.find(s => !s.is_warmup)?.target_performance?.reps ?? '—'}
                </span>
              )}
            </div>
          ))}
          {d.activities.length > 5 && (
            <p className="text-xs text-zinc-600 pl-0">+{d.activities.length - 5} more</p>
          )}
        </div>
      )}
      {d?.activities?.length === 0 && (
        <div className="flex items-center gap-2 mb-4 text-zinc-500">
          <Icon name="hotel" className="text-sm" />
          <span className="text-sm">Rest day</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onStartSession}
          disabled={!d}
          className="flex-1 py-2.5 bg-[#D1FF26] text-zinc-950 font-black text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-[#e8ff50] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="play_arrow" fill className="text-base" />
          Start Session
        </button>
        <button
          onClick={() => navigate('/track', { state: { emptySession: true } })}
          className="px-4 py-2.5 border border-[#262626] text-zinc-400 text-sm rounded-xl hover:border-[#333] hover:text-zinc-200 transition-colors"
        >
          Empty
        </button>
      </div>
    </div>
  );
}

// ── Template Card ──────────────────────────────────────────────────────────

function TemplateCard({ t, onPreview, onFollow, importing }) {
  return (
    <div className="bg-[#111] rounded-xl p-4 border border-[#1e1e1e] hover:border-[#2a2a2a] hover:bg-[#161616] transition-all flex flex-col gap-3">
      <div className="flex-1">
        <h4 className="text-sm font-bold text-white">{t.name}</h4>
        {t.tagline && <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{t.tagline}</p>}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {t.details?.level && <Chip>{LEVEL_LABEL[t.details.level] ?? t.details.level}</Chip>}
          {t.details?.days_per_week && <Chip>{t.details.days_per_week}×/wk</Chip>}
          {t.week_count > 0 && <Chip>{t.week_count}w</Chip>}
          {t.details?.minutes_per_workout && <Chip>~{t.details.minutes_per_workout}m</Chip>}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onPreview}
          className="flex-1 py-2 border border-[#262626] text-zinc-500 text-xs font-bold uppercase tracking-widest rounded-lg hover:text-zinc-200 hover:border-[#444] transition-colors">
          Preview
        </button>
        <button onClick={onFollow} disabled={importing}
          className="flex-1 py-2 bg-[#D1FF26]/10 border border-[#D1FF26]/20 text-[#D1FF26] text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-[#D1FF26]/20 transition-colors disabled:opacity-40">
          {importing ? 'Adding…' : 'Follow'}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDuration(startedAt, completedAt) {
  if (!completedAt) return null;
  const mins = Math.round((new Date(completedAt) - new Date(startedAt)) / 60000);
  return `${mins}m`;
}

function calcVolume(activities, units = 'metric') {
  let totalKg = 0;
  for (const a of activities ?? []) {
    if (a.type !== 'lift') continue;
    for (const s of a.sets ?? []) {
      totalKg += (s.current_performance?.weight_kg ?? s.target_performance?.weight_kg ?? 0)
               * (s.current_performance?.reps ?? s.target_performance?.reps ?? 0);
    }
  }
  if (totalKg === 0) return null;
  if (units === 'imperial') {
    const lbs = totalKg * 2.20462;
    return lbs >= 1000 ? `${(lbs / 1000).toFixed(1)}k lbs` : `${Math.round(lbs)} lbs`;
  }
  return totalKg >= 1000 ? `${(totalKg / 1000).toFixed(1)}k kg` : `${Math.round(totalKg)} kg`;
}

// ── My Programs ────────────────────────────────────────────────────────────

function MyProgramsSection({ programs, activeProgram, onDelete, deletingId, navigate }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  if (programs.length === 0) return null;

  return (
    <div className="mb-8">
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-3">My Programs</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {programs.map(p => {
          const isActive = activeProgram?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => navigate(`/programs/${p.id}`)}
              className={`group relative bg-[#111] rounded-xl p-4 cursor-pointer border transition-all hover:bg-[#161616] ${
                isActive ? 'border-[#D1FF26]/20 hover:border-[#D1FF26]/30' : 'border-[#1e1e1e] hover:border-[#2a2a2a]'
              }`}
            >
              <div className="flex items-start justify-between mb-2 pr-12">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white group-hover:text-[#D1FF26] transition-colors truncate">
                      {p.name}
                    </h3>
                    {isActive && <Chip accent>Active</Chip>}
                  </div>
                  {p.tagline && <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">{p.tagline}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.details?.level && <Chip>{LEVEL_LABEL[p.details.level] ?? p.details.level}</Chip>}
                {(p.details?.duration_weeks ?? p.weeks?.length) > 0 && (
                  <Chip>{p.details?.duration_weeks ?? p.weeks?.length}w</Chip>
                )}
                {p.details?.days_per_week && <Chip>{p.details.days_per_week}×/wk</Chip>}
              </div>

              {/* Hover actions */}
              <div className={`absolute top-3 right-3 flex items-center gap-0.5 transition-opacity ${confirmDeleteId === p.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {confirmDeleteId === p.id ? (
                  <>
                    <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); onDelete(p.id, e); }}
                      disabled={deletingId === p.id}
                      className="text-[10px] font-bold text-[#d53d18] uppercase tracking-wider px-1.5 disabled:opacity-40">
                      {deletingId === p.id ? '…' : 'Delete'}
                    </button>
                    <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
                      className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors px-1">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/programs/${p.id}/edit`); }}
                      className="p-1.5 text-zinc-600 hover:text-zinc-200 transition-colors rounded"
                    >
                      <Icon name="edit" className="text-sm" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id); }}
                      className="p-1.5 text-zinc-600 hover:text-[#d53d18] transition-colors rounded"
                    >
                      <Icon name="delete" className="text-sm" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Recent Sessions ────────────────────────────────────────────────────────

function RecentSessions({ navigate }) {
  const { units } = useUnits();
  const [workouts, setWorkouts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');

  useEffect(() => {
    apiGetWorkouts({ limit: 30 }).then(setWorkouts).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id, e) {
    e.stopPropagation();
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      await apiDeleteWorkout(id);
      setWorkouts(ws => ws.filter(w => w.id !== id));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('kinetic:toast', { detail: { message: err.message, type: 'error' } }));
    } finally { setDeletingId(null); }
  }

  const inProgress = workouts.filter(w => w.started_at && !w.completed_at);
  const filtered = workouts.filter(w => {
    const d = w.started_at.slice(0, 10);
    if (startDate && d < startDate) return false;
    if (endDate   && d > endDate)   return false;
    return true;
  });

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600">Recent Sessions</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterOpen(v => !v)}
            className={`p-1.5 rounded transition-colors ${filterOpen ? 'text-[#D1FF26]' : 'text-zinc-700 hover:text-zinc-400'}`}
            title="Filter by date"
          >
            <Icon name="filter_list" className="text-sm" />
          </button>
          <button onClick={() => apiExportWorkouts().catch(() => {})}
            className="p-1.5 text-zinc-700 hover:text-zinc-400 transition-colors" title="Export CSV">
            <Icon name="download" className="text-sm" />
          </button>
        </div>
      </div>

      {/* Date filter */}
      {filterOpen && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="bg-[#111] border border-[#222] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#444] transition-colors" />
          <span className="text-zinc-700 text-xs">to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="bg-[#111] border border-[#222] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#444] transition-colors" />
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }}
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors">Clear</button>
          )}
        </div>
      )}

      {/* In-progress banner */}
      {!loading && inProgress.length > 0 && (
        <div className="mb-3 flex items-center justify-between px-4 py-3 bg-[#00e3fd]/5 border border-[#00e3fd]/15 rounded-xl">
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00e3fd] animate-pulse" />
            <span className="text-sm font-medium text-[#00e3fd] truncate max-w-[180px]">{inProgress[0].name}</span>
            <span className="text-xs text-zinc-500 hidden sm:inline">in progress</span>
          </div>
          <button onClick={() => navigate('/track')}
            className="text-xs font-bold text-[#00e3fd] flex items-center gap-1 flex-shrink-0">
            Resume <Icon name="arrow_forward" className="text-xs" />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-2 py-3">
              <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="py-12 text-center border border-dashed border-[#1e1e1e] rounded-xl">
          <Icon name="fitness_center" className="text-3xl text-zinc-800 block mx-auto mb-3" />
          <p className="text-zinc-600 text-sm">{startDate || endDate ? 'No sessions in this range' : 'No sessions yet'}</p>
          {!startDate && !endDate && (
            <button onClick={() => navigate('/track')}
              className="mt-2 text-xs text-[#D1FF26] font-bold hover:text-[#f4ffc9] transition-colors">
              Start your first session →
            </button>
          )}
        </div>
      )}

      {/* Session list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-0.5">
          {filtered.map(w => {
            const vol = calcVolume(w.activities, units);
            const dur = fmtDuration(w.started_at, w.completed_at);
            const date = new Date(w.started_at);
            const meta = [dur, vol, `${w.activities?.length ?? 0} ex`].filter(Boolean).join(' · ');
            return (
              <div
                key={w.id}
                onClick={() => navigate(`/history/${w.id}`)}
                className="group flex items-center gap-3 px-2 py-2.5 hover:bg-[#111] rounded-xl cursor-pointer transition-colors"
              >
                {/* Date block */}
                <div className="w-10 text-center flex-shrink-0">
                  <p className="text-base font-bold text-white leading-none tabular-nums">{date.getDate()}</p>
                  <p className="text-[9px] font-bold text-zinc-600 uppercase mt-0.5">
                    {date.toLocaleDateString('en-US', { month: 'short' })}
                  </p>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">{w.name}</p>
                    {!w.completed_at && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 bg-[#00e3fd]/10 text-[#00e3fd] border border-[#00e3fd]/20 rounded flex-shrink-0">
                        Live
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{meta}</p>
                </div>

                {/* Hover actions */}
                <div className={`flex items-center gap-2 transition-opacity flex-shrink-0 ${confirmDeleteId === w.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  {confirmDeleteId === w.id ? (
                    <>
                      <button onClick={e => handleDelete(w.id, e)} disabled={deletingId === w.id}
                        className="text-[10px] font-bold text-[#d53d18] uppercase tracking-wider disabled:opacity-40">
                        {deletingId === w.id ? '…' : 'Delete'}
                      </button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(w.id); }}
                      className="text-zinc-700 hover:text-[#d53d18] transition-colors">
                      <Icon name="delete" className="text-sm" />
                    </button>
                  )}
                  <Icon name="chevron_right" className="text-sm text-zinc-600" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProgramsListPage() {
  const navigate = useNavigate();
  const { units } = useUnits();

  const [activeProgram, setActiveProgram] = useState(undefined);
  const [programs, setPrograms] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [importingId, setImportingId] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [unfollowing, setUnfollowing] = useState(false);

  useEffect(() => {
    Promise.all([
      apiGetActiveProgram().catch(() => null),
      apiGetPrograms().catch(() => []),
      apiGetTemplates().catch(() => []),
    ]).then(([active, progs, tmpls]) => {
      setActiveProgram(active);
      setPrograms(progs);
      setTemplates(tmpls);
    }).finally(() => setLoading(false));
  }, []);

  function handleStartSession() {
    if (!activeProgram?.current_day_data) return;
    const d = activeProgram.current_day_data;
    navigate('/track', {
      state: {
        activities: hydrateActivitiesForTracker(d.activities, units),
        workoutName: `${activeProgram.name} — W${d.week} D${d.day}${d.label ? ` (${d.label})` : ''}`,
        programContext: {
          programId: activeProgram.id,
          programName: activeProgram.name,
          week: d.week,
          day: d.day,
          dayLabel: d.label ?? null,
        },
      },
    });
  }

  async function handleUnfollow() {
    if (!activeProgram) return;
    setUnfollowing(true);
    try { await apiUnfollowProgram(activeProgram.id); setActiveProgram(null); }
    catch (err) { alert(err.message); }
    finally { setUnfollowing(false); }
  }

  async function handleFollow(templateId) {
    setImportingId(templateId);
    try { const c = await apiImportTemplate(templateId); setPreviewId(null); navigate(`/programs/${c.id}`); }
    catch (err) { alert(err.message); setImportingId(null); }
  }

  async function handleEdit(templateId) {
    setImportingId(templateId);
    try { const c = await apiImportTemplate(templateId); setPreviewId(null); navigate(`/programs/${c.id}/edit`); }
    catch (err) { alert(err.message); setImportingId(null); }
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await apiDeleteProgram(id);
      setPrograms(ps => ps.filter(p => p.id !== id));
      if (activeProgram?.id === id) setActiveProgram(null);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('kinetic:toast', { detail: { message: err.message, type: 'error' } }));
    } finally { setDeletingId(null); }
  }

  const hasActive = !!activeProgram;
  const noPrograms = !loading && programs.length === 0;

  return (
    <div className="p-5 md:p-8 max-w-4xl mx-auto w-full">
      {previewId && (
        <TemplatePreviewModal
          templateId={previewId}
          onFollow={handleFollow}
          onEdit={handleEdit}
          onClose={() => setPreviewId(null)}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Train</h1>
        <button
          onClick={() => navigate('/programs/new')}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#D1FF26] text-zinc-950 font-bold text-xs rounded-lg hover:bg-[#e8ff50] transition-colors"
        >
          <Icon name="add" className="text-sm" />
          <span className="hidden sm:inline">New Program</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 mt-6">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* Active program card */}
          {hasActive && (
            <ActiveProgramCard
              program={activeProgram}
              onStartSession={handleStartSession}
              onUnfollow={handleUnfollow}
              unfollowing={unfollowing}
            />
          )}

          {/* No active program: quick start CTA */}
          {!hasActive && (
            <button
              onClick={() => navigate('/track')}
              className="w-full mb-8 flex items-center gap-4 p-5 bg-[#111] border border-[#1e1e1e] hover:border-[#2a2a2a] rounded-2xl hover:bg-[#161616] transition-all group text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-[#D1FF26]/10 flex items-center justify-center flex-shrink-0">
                <Icon name="play_arrow" fill className="text-[#D1FF26]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white group-hover:text-[#D1FF26] transition-colors">Start Empty Session</p>
                <p className="text-xs text-zinc-600 mt-0.5">Begin a free-form workout now</p>
              </div>
              <Icon name="arrow_forward" className="text-zinc-700 group-hover:text-zinc-400 transition-colors ml-auto text-sm" />
            </button>
          )}

          {/* Programs grid */}
          <MyProgramsSection
            programs={programs}
            activeProgram={activeProgram}
            onDelete={handleDelete}
            deletingId={deletingId}
            navigate={navigate}
          />

          {/* Templates — always shown when no programs, toggle when there are programs */}
          {noPrograms && templates.length > 0 && (
            <div className="mb-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-3">Start with a Template</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {templates.map(t => (
                  <TemplateCard key={t.id} t={t}
                    onPreview={() => setPreviewId(t.id)}
                    onFollow={() => handleFollow(t.id)}
                    importing={importingId === t.id} />
                ))}
              </div>
            </div>
          )}

          {programs.length > 0 && (
            <div className="mb-8">
              <button
                onClick={() => setShowTemplates(v => !v)}
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors mb-3"
              >
                <Icon name={showTemplates ? 'expand_less' : 'library_books'} className="text-sm" />
                {showTemplates ? 'Hide Templates' : 'Browse Templates'}
              </button>
              {showTemplates && templates.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {templates.map(t => (
                    <TemplateCard key={t.id} t={t}
                      onPreview={() => setPreviewId(t.id)}
                      onFollow={() => handleFollow(t.id)}
                      importing={importingId === t.id} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-[#1a1a1a] my-8" />

          {/* Recent sessions */}
          <RecentSessions navigate={navigate} />
        </>
      )}

      <div className="h-16" />
    </div>
  );
}
