import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { apiGetProgram, apiDeleteProgram, apiFollowProgram, apiUnfollowProgram, apiGetProgramCompletions, apiGetDayWithTargets } from '../../lib/api';
import { hydrateActivitiesForTracker } from '../../lib/workout';
import { useUnits } from '../../lib/units';

const LEVEL_LABEL = { beginner: 'Beginner', novice: 'Novice', intermediate: 'Intermediate', advanced: 'Advanced', elite: 'Elite' };
const EQUIP_LABEL = { full_gym: 'Full Gym', home_gym: 'Home Gym', bodyweight_only: 'Bodyweight' };

function intensityToString(i) {
  if (!i) return null;
  if (i.type === 'rpe') return `RPE ${i.value}`;
  if (i.type === 'rir') return `RIR ${i.value}`;
  return null;
}

function Chip({ children, color = 'default' }) {
  const cls = {
    default: 'bg-[#1a1a1a] border border-[#2a2a2a] text-zinc-400',
    green:   'bg-[#D1FF26]/10 border border-[#D1FF26]/20 text-[#D1FF26]',
    lime:    'bg-[#D1FF26] text-zinc-950',
    blue:    'bg-[#00e3fd]/10 border border-[#00e3fd]/20 text-[#00e3fd]',
  }[color];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}

export default function ProgramDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { units, unit } = useUnits();

  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openWeek, setOpenWeek] = useState(0);
  const [openDay, setOpenDay] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [following, setFollowing] = useState(false);
  const [completions, setCompletions] = useState({});
  const [startingDay, setStartingDay] = useState(null); // "week-day" key while loading targets

  function isDayDone(weekNum, dayNum) {
    return !!completions[`w${weekNum}-d${dayNum}`];
  }

  useEffect(() => {
    if (!id) { navigate('/programs'); return; }
    Promise.all([
      apiGetProgram(id),
      apiGetProgramCompletions(id).catch(() => []),
    ]).then(([p, comps]) => {
      setProgram(p);
      setFollowing(p.is_following ?? false);
      const lookup = {};
      for (const c of comps) {
        if (c.week != null && c.day != null) lookup[`w${c.week}-d${c.day}`] = true;
      }
      setCompletions(lookup);
      if (p.is_following && p.weeks?.length) {
        const wi = p.weeks.findIndex(w => w.week === p.current_week);
        if (wi !== -1) {
          setOpenWeek(wi);
          const di = p.weeks[wi].days.findIndex(d => d.day === p.current_day);
          if (di !== -1) setOpenDay(di);
        }
      }
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function handleWeekToggle(wi) {
    setOpenWeek(openWeek === wi ? -1 : wi);
    setOpenDay(0);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiDeleteProgram(id);
      navigate('/programs');
    } catch (err) {
      window.dispatchEvent(new CustomEvent('kinetic:toast', { detail: { message: err.message, type: 'error' } }));
      setDeleting(false);
    }
  }

  async function handleFollow() {
    try {
      const updated = await apiFollowProgram(id);
      setProgram(updated);
      setFollowing(true);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('kinetic:toast', { detail: { message: err.message, type: 'error' } }));
    }
  }

  async function handleUnfollow() {
    try {
      const updated = await apiUnfollowProgram(id);
      setProgram(updated);
      setFollowing(false);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('kinetic:toast', { detail: { message: err.message, type: 'error' } }));
    }
  }

  if (loading) return <div className="p-8 py-32 text-center text-zinc-600 text-sm">Loading…</div>;
  if (error) return <div className="p-8 py-32 text-center text-[#d53d18] text-sm">{error}</div>;
  if (!program) return null;

  const { details = {}, weeks = [] } = program;

  const metaChips = [
    details.level && (LEVEL_LABEL[details.level] ?? details.level),
    details.equipment && (EQUIP_LABEL[details.equipment] ?? details.equipment),
    (details.duration_weeks ? `${details.duration_weeks}wk` : weeks.length ? `${weeks.length}wk` : null),
    details.days_per_week && `${details.days_per_week}×/wk`,
    details.minutes_per_workout && `~${details.minutes_per_workout}min`,
  ].filter(Boolean);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Back */}
      <button
        onClick={() => navigate('/programs')}
        className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
      >
        <Icon name="arrow_back" className="text-sm" />
        All Programs
      </button>

      {/* Header */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl font-headline font-black tracking-tight text-white leading-tight">{program.name}</h1>
            {program.tagline && <p className="text-sm text-zinc-500 italic">{program.tagline}</p>}
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {following ? (
              <button
                onClick={handleUnfollow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D1FF26]/10 border border-[#D1FF26]/30 text-[#D1FF26] text-xs font-bold uppercase tracking-widest rounded hover:bg-[#d53d18]/10 hover:border-[#d53d18]/30 hover:text-[#d53d18] transition-colors"
              >
                <Icon name="check_circle" className="text-xs" />
                Following
              </button>
            ) : (
              <button
                onClick={handleFollow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D1FF26] text-zinc-950 text-xs font-black uppercase tracking-widest rounded hover:bg-[#f4ffc9] transition-colors"
              >
                <Icon name="play_circle" className="text-xs" />
                Follow
              </button>
            )}
            <button
              onClick={() => navigate(`/programs/${id}/edit`)}
              className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded hover:bg-[#1e1e1e]"
              title="Edit"
            >
              <Icon name="edit" className="text-base" />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button onClick={handleDelete} disabled={deleting}
                  className="text-xs font-bold text-[#d53d18] uppercase tracking-widest hover:opacity-75 transition-opacity disabled:opacity-40">
                  {deleting ? '…' : 'Delete'}
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 text-zinc-700 hover:text-[#d53d18] transition-colors rounded hover:bg-[#1e1e1e]"
                title="Delete"
              >
                <Icon name="delete" className="text-base" />
              </button>
            )}
          </div>
        </div>

        {program.description && (
          <p className="text-sm text-zinc-500 leading-relaxed">{program.description}</p>
        )}

        {/* Meta chips */}
        {metaChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {metaChips.map(c => <Chip key={c}>{c}</Chip>)}
            {following && <Chip color="green"><Icon name="check_circle" className="text-[10px]" /> Active</Chip>}
          </div>
        )}

        {/* Recommended days */}
        {details.recommended_days?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {details.recommended_days.map(d => (
              <span key={d} className="text-[10px] text-zinc-600 px-2 py-0.5 bg-[#1a1a1a] rounded border border-[#2a2a2a]">
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Structure */}
      {weeks.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 px-1">Structure</p>

          {weeks.map((week, wi) => {
            const isActiveWeek = following && program.current_week === week.week;
            const isOpen = openWeek === wi;
            return (
              <div key={wi} className={`bg-[#111] border rounded-xl overflow-hidden transition-colors ${isActiveWeek ? 'border-[#D1FF26]/20' : 'border-[#1e1e1e]'}`}>
                {/* Week header */}
                <button
                  onClick={() => handleWeekToggle(wi)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#171717] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${isActiveWeek ? 'bg-[#D1FF26] text-zinc-950' : 'bg-[#1e1e1e] text-zinc-400'}`}>
                      W{week.week}
                    </span>
                    <span className="text-sm font-bold text-white">Week {week.week}</span>
                    <span className="text-[10px] text-zinc-600">{week.days.length} day{week.days.length !== 1 ? 's' : ''}</span>
                    {isActiveWeek && <Chip color="green">Active</Chip>}
                  </div>
                  <Icon name={isOpen ? 'expand_less' : 'expand_more'} className="text-zinc-600 text-sm" />
                </button>

                {isOpen && (
                  <div className="border-t border-[#1e1e1e]">
                    {/* Day tabs */}
                    <div className="flex gap-1 px-5 pt-3 pb-1 overflow-x-auto scrollbar-none">
                      {week.days.map((day, di) => {
                        const isRest = day.activities.length === 0;
                        const isNextUp = following && program.current_week === week.week && program.current_day === day.day;
                        const done = isDayDone(week.week, day.day);
                        const label = day.label || `Day ${day.day}`;
                        return (
                          <button
                            key={di}
                            onClick={() => setOpenDay(di)}
                            className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded whitespace-nowrap transition-colors ${
                              openDay === di
                                ? 'bg-[#D1FF26] text-zinc-950'
                                : isNextUp
                                ? 'bg-[#D1FF26]/15 text-[#D1FF26] ring-1 ring-[#D1FF26]/30'
                                : 'bg-[#1a1a1a] text-zinc-500 hover:text-white'
                            }`}
                          >
                            {isRest && <Icon name="hotel" className="text-[10px]" />}
                            {done && !isNextUp && openDay !== di && <Icon name="check_circle" className="text-[10px]" />}
                            {isNextUp && openDay !== di && <Icon name="play_arrow" fill className="text-[10px]" />}
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Day content */}
                    {(() => {
                      const day = week.days[openDay];
                      if (!day) return null;
                      const isRest = day.activities.length === 0;
                      if (isRest) return (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                          <Icon name="hotel" className="text-2xl text-zinc-700" />
                          <p className="text-xs text-zinc-600 font-bold uppercase tracking-widest">Rest Day</p>
                        </div>
                      );
                      return (
                        <div className="px-5 pt-3 pb-5 space-y-5">
                          {/* Start button */}
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-zinc-600">
                              {day.activities.length} exercise{day.activities.length !== 1 ? 's' : ''}
                              {day.activities.filter(a => a.type === 'lift').reduce((s, a) => s + (a.sets?.length ?? 0), 0) > 0 && (
                                <> · {day.activities.filter(a => a.type === 'lift').reduce((s, a) => s + (a.sets?.length ?? 0), 0)} sets</>
                              )}
                            </p>
                            <button
                              disabled={!!startingDay}
                              onClick={async () => {
                                const key = `${week.week}-${day.day}`;
                                setStartingDay(key);
                                const navState = {
                                  workoutName: `${program.name} — W${week.week} D${day.day}${day.label ? ` (${day.label})` : ''}`,
                                  programContext: { programId: id, programName: program.name, week: week.week, day: day.day, dayLabel: day.label ?? null },
                                };
                                try {
                                  const computed = await apiGetDayWithTargets(id, week.week, day.day);
                                  navState.activities = hydrateActivitiesForTracker(computed.activities, units);
                                } catch {
                                  navState.activities = hydrateActivitiesForTracker(day.activities, units);
                                } finally {
                                  setStartingDay(null);
                                }
                                navigate('/track', { state: navState });
                              }}
                              className="flex items-center gap-1.5 px-4 py-2 bg-[#D1FF26] text-zinc-950 text-xs font-black uppercase tracking-widest rounded-lg hover:bg-[#f4ffc9] active:scale-[0.98] transition-all disabled:opacity-60"
                            >
                              {startingDay === `${week.week}-${day.day}`
                                ? <><Icon name="autorenew" className="text-sm animate-spin" /> Loading…</>
                                : <><Icon name="play_arrow" fill className="text-sm" /> Start Workout</>
                              }
                            </button>
                          </div>

                          {/* Activities */}
                          <div className="space-y-4">
                            {day.activities.map((act, ai) => (
                              <div key={ai}>
                                {act.type === 'lift' ? (
                                  <>
                                    <div className="flex items-center gap-2 mb-2">
                                      <p className="text-sm font-bold text-white">{act.name}</p>
                                      {act.note && <span className="text-[10px] text-zinc-600">— {act.note}</span>}
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left">
                                        <thead>
                                          <tr className="text-[9px] uppercase tracking-widest text-zinc-700 border-b border-[#1e1e1e]">
                                            <th className="pb-2 font-bold w-10">Set</th>
                                            <th className="pb-2 font-bold">{unit}</th>
                                            <th className="pb-2 font-bold">Reps</th>
                                            <th className="pb-2 font-bold">Intensity</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#1a1a1a]">
                                          {act.sets.map((s, si) => (
                                            <tr key={si} className="text-sm">
                                              <td className="py-2 font-bold text-zinc-500">
                                                {si + 1}
                                                {s.is_warmup && <span className="ml-1.5 text-[9px] bg-[#1a1a1a] px-1 py-0.5 rounded text-[#00e3fd]">W</span>}
                                              </td>
                                              <td className="py-2 font-bold text-white">
                                                {s.target_performance?.weight_kg != null
                                                  ? units === 'imperial'
                                                    ? +(s.target_performance.weight_kg * 2.20462).toFixed(1)
                                                    : s.target_performance.weight_kg
                                                  : '—'}
                                              </td>
                                              <td className="py-2 font-bold text-white">{s.target_performance?.reps ?? '—'}</td>
                                              <td className="py-2 text-xs text-zinc-600">{intensityToString(s.target_performance?.intensity) ?? '—'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-3 bg-[#1a1a1a] rounded-lg px-4 py-3">
                                    <Icon name="sprint" className="text-[#ffe56b] text-sm" />
                                    <div className="flex-1">
                                      <p className="text-sm font-bold text-white">{act.name}</p>
                                    </div>
                                    <div className="flex gap-4 text-xs text-zinc-600">
                                      {act.duration_seconds && <span>{Math.round(act.duration_seconds / 60)}min</span>}
                                      {act.intensity && <span>{intensityToString(act.intensity)}</span>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-10 text-center">
          <p className="text-zinc-600 text-sm mb-3">No weeks defined yet.</p>
          <button
            onClick={() => navigate(`/programs/${id}/edit`)}
            className="text-[#D1FF26] text-xs font-bold uppercase tracking-widest hover:text-[#f4ffc9] transition-colors"
          >
            Edit Program →
          </button>
        </div>
      )}

      <div className="h-6" />
    </div>
  );
}
