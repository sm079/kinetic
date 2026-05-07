import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { apiGetWorkout, apiDeleteWorkout } from '../../lib/api';
import { useUnits } from '../../lib/units';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(startedAt, completedAt) {
  if (!completedAt) return null;
  const mins = Math.round((new Date(completedAt) - new Date(startedAt)) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

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

function fmtVolume(kg, units) {
  if (kg === 0) return null;
  if (units === 'imperial') {
    const lbs = kg * 2.20462;
    return lbs >= 1000 ? `${(lbs / 1000).toFixed(1)}k lbs` : `${Math.round(lbs)} lbs`;
  }
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)}k kg` : `${Math.round(kg)} kg`;
}

function fmtSetWeight(kg, units) {
  if (kg == null) return '—';
  if (units === 'imperial') return `${+(kg * 2.20462).toFixed(1)}`;
  return String(kg);
}

function intensityStr(i) {
  if (!i) return null;
  if (i.type === 'rpe') return `RPE ${i.value}`;
  if (i.type === 'rir') return `RIR ${i.value}`;
  return null;
}

export default function WorkoutDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { units, unit } = useUnits();
  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!id) { navigate('/programs'); return; }
    apiGetWorkout(id)
      .then(setWorkout)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiDeleteWorkout(id);
      navigate('/history');
    } catch (err) {
      window.dispatchEvent(new CustomEvent('kinetic:toast', { detail: { message: err.message, type: 'error' } }));
      setDeleting(false);
    }
  }

  if (loading) return <div className="p-8 py-32 text-center text-zinc-600 text-sm">Loading…</div>;
  if (error) return <div className="p-8 py-32 text-center text-[#d53d18] text-sm">{error}</div>;
  if (!workout) return null;

  const volume = calcVolume(workout.activities);
  const setCount = workout.activities.filter(a => a.type === 'lift').reduce((s, a) => s + (a.sets?.length ?? 0), 0);
  const doneCount = workout.activities.filter(a => a.type === 'lift').reduce((s, a) => s + (a.sets?.filter(s => s.completed)?.length ?? 0), 0);
  const duration = fmtDuration(workout.started_at, workout.completed_at);
  const volStr = fmtVolume(volume, units);

  const metaParts = [
    duration,
    volStr && `${volStr} volume`,
    setCount > 0 && `${doneCount}/${setCount} sets`,
  ].filter(Boolean);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Back */}
      <button
        onClick={() => navigate('/programs')}
        className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
      >
        <Icon name="arrow_back" className="text-sm" />
        History
      </button>

      {/* Header */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">{fmtDate(workout.started_at)}</p>
            <h1 className="text-2xl font-headline font-black tracking-tight text-white">{workout.name}</h1>
            <p className="text-xs text-zinc-600">
              {fmtTime(workout.started_at)}{workout.completed_at ? ` — ${fmtTime(workout.completed_at)}` : ' · In progress'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate('/track', { state: { editWorkout: workout } })}
              className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded hover:bg-[#1e1e1e]"
              title="Edit"
            >
              <Icon name="edit" className="text-base" />
            </button>
            <button
              onClick={() => navigate('/track', { state: { workout } })}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#D1FF26]/20 text-[#D1FF26] text-xs font-bold uppercase tracking-widest rounded hover:bg-[#D1FF26]/10 transition-colors"
            >
              <Icon name="replay" className="text-xs" />
              Repeat
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

        {/* Meta + note */}
        {metaParts.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {metaParts.map(m => (
              <span key={m} className="text-xs text-zinc-500">{m}</span>
            ))}
          </div>
        )}

        {workout.note && (
          <p className="mt-3 text-sm text-zinc-500 bg-[#1a1a1a] rounded-lg px-4 py-3 border-l-2 border-[#D1FF26]/20">
            {workout.note}
          </p>
        )}
      </div>

      {/* Activities */}
      <div className="space-y-3">
        {workout.activities.length > 0 && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 px-1">
            Exercises · {workout.activities.length}
          </p>
        )}

        {workout.activities.map((activity, ai) => (
          <div key={ai} className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 flex items-center gap-3 border-b border-[#1e1e1e]">
              <Icon
                name={activity.type === 'lift' ? 'fitness_center' : 'sprint'}
                className={`text-sm ${activity.type === 'lift' ? 'text-zinc-500' : 'text-[#ffe56b]'}`}
              />
              <p className="font-bold text-white text-sm">{activity.name}</p>
              {activity.note && <span className="text-[10px] text-zinc-600 ml-1">— {activity.note}</span>}
            </div>

            {activity.type === 'lift' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-widest text-zinc-700 border-b border-[#1a1a1a]">
                      <th className="text-left px-5 py-2.5 font-bold w-12">Set</th>
                      <th className="text-left px-4 py-2.5 font-bold">Target</th>
                      <th className="text-left px-4 py-2.5 font-bold">Actual</th>
                      <th className="text-left px-4 py-2.5 font-bold hidden sm:table-cell">Intensity</th>
                      <th className="text-center px-5 py-2.5 font-bold w-12">✓</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1a1a]">
                    {activity.sets.map((set, si) => {
                      const target = set.target_performance;
                      const actual = set.current_performance;
                      const targetStr = (target?.weight_kg != null && target?.reps != null)
                        ? `${fmtSetWeight(target.weight_kg, units)} ${unit} × ${target.reps}`
                        : '—';
                      const actualStr = (actual?.weight_kg != null || actual?.reps != null)
                        ? `${actual?.weight_kg != null ? fmtSetWeight(actual.weight_kg, units) + ' ' + unit : '—'} × ${actual?.reps ?? '—'}`
                        : '—';
                      return (
                        <tr key={si} className="hover:bg-[#171717] transition-colors">
                          <td className="px-5 py-2.5 font-bold text-zinc-600 text-xs">
                            {si + 1}
                            {set.is_warmup && <span className="ml-1.5 text-[9px] bg-[#1a1a1a] px-1 py-0.5 rounded text-[#00e3fd]">W</span>}
                          </td>
                          <td className="px-4 py-2.5 text-zinc-600 font-mono text-xs">{targetStr}</td>
                          <td className={`px-4 py-2.5 font-mono text-xs font-bold ${set.completed ? 'text-[#D1FF26]' : 'text-zinc-500'}`}>
                            {actualStr}
                          </td>
                          <td className="px-4 py-2.5 text-zinc-600 text-xs hidden sm:table-cell">
                            {intensityStr(target?.intensity) ?? '—'}
                          </td>
                          <td className="px-5 py-2.5 text-center">
                            {set.completed
                              ? <Icon name="check_circle" fill className="text-[#D1FF26] text-sm" />
                              : <Icon name="radio_button_unchecked" className="text-zinc-800 text-sm" />
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activity.type === 'cardio' && (
              <div className="px-5 py-4 flex gap-6">
                {[
                  { label: 'Distance', value: activity.distance_meters ? `${(activity.distance_meters / 1000).toFixed(2)} km` : '—' },
                  { label: 'Duration', value: activity.duration_seconds ? `${Math.round(activity.duration_seconds / 60)} min` : '—' },
                  { label: 'Intensity', value: intensityStr(activity.intensity) ?? '—' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-[9px] text-zinc-700 uppercase tracking-wider mb-0.5">{s.label}</p>
                    <p className="text-sm font-bold text-white">{s.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {workout.activities.length === 0 && (
          <div className="py-12 text-center text-zinc-700 text-sm">No exercises logged.</div>
        )}
      </div>

      <div className="h-6" />
    </div>
  );
}
