import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import ExerciseCombobox from '../../components/ui/ExerciseCombobox';
import ExercisePickerModal from '../../components/ui/ExercisePickerModal';
import { apiCreateWorkout, apiUpdateWorkout, apiGetExercises, apiGetPrograms, apiGetActiveProgram, apiAdvanceProgram, apiGetExerciseSuggestions, apiGetExercise, apiGetLatestBiometric, apiGetDayWithTargets } from '../../lib/api';
import { hydrateActivitiesForTracker } from '../../lib/workout';
import { useUnits, displayToKg as _displayToKg, kgToDisplayStr as _kgToDisplayStr } from '../../lib/units';
import { computeLevel, LEVEL_CONFIG, muscleName } from '../../lib/muscles';

// ── Constants ─────────────────────────────────────────────────────────────
const INTENSITY_OPTIONS = ['—', 'RPE 5', 'RPE 6', 'RPE 7', 'RPE 8', 'RPE 9', 'RPE 10', 'RIR 0', 'RIR 1', 'RIR 2', 'RIR 3'];

// ── UID ───────────────────────────────────────────────────────────────────
let _uidCounter = 0;
function uid() { return `${Date.now()}-${++_uidCounter}`; }

// ── Serializers ───────────────────────────────────────────────────────────

function parseIntensity(str) {
  if (!str || str === '—') return null;
  const parts = str.split(' ');
  if (parts[0] === 'RPE') return { type: 'rpe', value: parseFloat(parts[1]) };
  if (parts[0] === 'RIR') return { type: 'rir', value: parseInt(parts[1]) };
  return null;
}

function parseDurationSeconds(str) {
  if (!str) return null;
  if (str.includes(':')) {
    const [mins, secs] = str.split(':').map(Number);
    return (mins || 0) * 60 + (secs || 0);
  }
  const mins = parseFloat(str);
  return isNaN(mins) ? null : Math.round(mins * 60);
}

function serializeActivities(activities, units = 'metric') {
  return activities.map(a => {
    if (a.type === 'lift') {
      return {
        type: 'lift',
        name: a.name || 'Unnamed Exercise',
        note: a.note || null,
        sets: a.sets.map(s => ({
          is_warmup: s.isWarmup,
          target_performance: {
            weight_kg: s.targetWeight ? _displayToKg(s.targetWeight, units) : null,
            reps: s.targetReps ? parseInt(s.targetReps) : null,
            intensity: parseIntensity(s.intensity),
          },
          current_performance: {
            weight_kg: s.weight ? _displayToKg(s.weight, units) : null,
            reps: s.reps ? parseInt(s.reps) : null,
          },
          completed: s.done,
        })),
      };
    }
    return {
      type: 'cardio',
      name: a.name || 'Cardio',
      note: a.note || null,
      distance_meters: a.distance ? parseFloat(a.distance) * 1000 : null,
      duration_seconds: parseDurationSeconds(a.duration),
      intensity: parseIntensity(a.intensity),
    };
  });
}

// ── Timer ─────────────────────────────────────────────────────────────────

function useTimer(startedAt) {
  const [seconds, setSeconds] = useState(() =>
    startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
  );
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ── Activity factories ─────────────────────────────────────────────────────

function newLift(name = '') {
  return {
    id: uid(), type: 'lift', name, note: '',
    sets: [{ id: uid(), isWarmup: false, targetWeight: '', targetReps: '', weight: '', reps: '', intensity: 'RIR 2', done: false }],
  };
}

function newCardio(name = '') {
  return { id: uid(), type: 'cardio', name, note: '', distance: '', duration: '', intensity: 'RPE 6' };
}

// ── Hydrate for editing ────────────────────────────────────────────────────

function hydrateFromWorkoutForEdit(workout, units = 'metric') {
  return (workout.activities ?? []).map(a => {
    const id = uid();
    if (a.type === 'lift') {
      return {
        id, type: 'lift', name: a.name ?? '', note: a.note ?? '',
        sets: (a.sets ?? []).map(s => ({
          id: uid(),
          isWarmup: s.is_warmup ?? false,
          targetWeight: _kgToDisplayStr(s.target_performance?.weight_kg, units),
          targetReps: s.target_performance?.reps != null ? String(s.target_performance.reps) : '',
          weight: _kgToDisplayStr(s.current_performance?.weight_kg, units),
          reps: s.current_performance?.reps != null ? String(s.current_performance.reps) : '',
          intensity: (() => { const i = s.target_performance?.intensity; if (!i) return 'RIR 2'; return i.type === 'rpe' ? `RPE ${i.value}` : `RIR ${i.value}`; })(),
          done: s.completed ?? false,
        })),
      };
    }
    return {
      id, type: 'cardio', name: a.name ?? '', note: a.note ?? '',
      distance: a.distance_meters ? String((a.distance_meters / 1000).toFixed(2)) : '',
      duration: a.duration_seconds ? String(Math.round(a.duration_seconds / 60)) : '',
      intensity: (() => { const i = a.intensity; if (!i) return 'RPE 6'; return i.type === 'rpe' ? `RPE ${i.value}` : `RIR ${i.value}`; })(),
    };
  });
}

// ── Hydrate from a repeated workout ───────────────────────────────────────

function hydrateFromWorkout(workout, units = 'metric') {
  return (workout.activities ?? []).map(a => {
    const id = uid();
    if (a.type === 'lift') {
      return {
        id, type: 'lift', name: a.name ?? '', note: a.note ?? '',
        sets: (a.sets ?? []).map(s => ({
          id: uid(),
          isWarmup: s.is_warmup ?? false,
          targetWeight: _kgToDisplayStr(
            s.current_performance?.weight_kg ?? s.target_performance?.weight_kg,
            units
          ),
          targetReps: s.current_performance?.reps != null
            ? String(s.current_performance.reps)
            : (s.target_performance?.reps != null ? String(s.target_performance.reps) : ''),
          weight: '', reps: '',
          intensity: (() => { const i = s.target_performance?.intensity; if (!i) return 'RIR 2'; return i.type === 'rpe' ? `RPE ${i.value}` : `RIR ${i.value}`; })(),
          done: false,
        })),
      };
    }
    return { id, type: 'cardio', name: a.name ?? '', note: a.note ?? '', distance: '', duration: a.duration_seconds ? String(Math.round(a.duration_seconds / 60)) : '', intensity: 'RPE 6' };
  });
}

// ── Program Day Picker ─────────────────────────────────────────────────────

function ProgramDayPicker({ onLoad }) {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(0);

  useEffect(() => {
    apiGetPrograms()
      .then(setPrograms)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center gap-2 text-zinc-600 text-xs py-4">
      <Icon name="autorenew" className="text-sm animate-spin" />
      Loading programs…
    </div>
  );

  if (programs.length === 0) return (
    <p className="text-zinc-600 text-xs py-2">
      No programs yet.{' '}
      <a href="/programs/new" className="text-[#D1FF26] hover:underline">Create one</a>.
    </p>
  );

  const prog = selectedProgram ? programs.find(p => p.id === selectedProgram) : null;
  const week = prog?.weeks?.[selectedWeek];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-1.5">
        {programs.map(p => (
          <button
            key={p.id}
            onClick={() => { setSelectedProgram(p.id); setSelectedWeek(0); }}
            className={`text-left px-4 py-3 rounded-lg border transition-all ${
              selectedProgram === p.id
                ? 'border-[#D1FF26]/30 bg-[#D1FF26]/5 text-white'
                : 'border-[#1e1e1e] text-zinc-500 hover:border-[#2a2a2a] hover:text-white'
            }`}
          >
            <span className="text-sm font-bold font-headline">{p.name}</span>
            {p.details?.duration_weeks && (
              <span className="ml-2 text-[10px] text-zinc-600">{p.details.duration_weeks}w</span>
            )}
          </button>
        ))}
      </div>

      {prog && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Week</p>
          <div className="flex flex-wrap gap-1.5">
            {prog.weeks.map((w, wi) => (
              <button
                key={wi}
                onClick={() => setSelectedWeek(wi)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                  selectedWeek === wi
                    ? 'bg-[#D1FF26] text-zinc-950'
                    : 'bg-[#1a1a1a] text-zinc-500 hover:text-white'
                }`}
              >
                W{w.week}
              </button>
            ))}
          </div>
        </div>
      )}

      {week && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Day</p>
          <div className="flex flex-wrap gap-2">
            {week.days.map((day, di) => {
              const isRest = day.activities.length === 0;
              return (
                <button
                  key={di}
                  disabled={isRest}
                  onClick={() => !isRest && onLoad(day, prog, week)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all ${
                    isRest
                      ? 'bg-[#111] text-zinc-700 cursor-not-allowed border border-[#1e1e1e]'
                      : 'bg-[#111] border border-[#1e1e1e] text-zinc-500 hover:border-[#D1FF26]/20 hover:text-[#D1FF26]'
                  }`}
                >
                  {isRest && <Icon name="hotel" className="text-xs" />}
                  {day.label || `Day ${day.day}`}
                  {!isRest && (
                    <span className="text-[9px] text-zinc-700 font-normal normal-case tracking-normal">
                      {day.activities.length} ex
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AddActivityModal ──────────────────────────────────────────────────────

function AddActivityModal({ onAdd, onClose, exercises }) {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState('');

  function confirm(resolvedName) {
    const n = (resolvedName ?? name).trim();
    if (!n) return;
    onAdd(mode === 'lift' ? newLift(n) : newCardio(n));
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-5">Add Exercise</p>

        {!mode && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setMode('lift')}
              className="flex flex-col items-center gap-3 p-5 bg-[#0e0e0e] rounded-xl border border-[#1e1e1e] hover:border-[#D1FF26]/30 hover:text-[#D1FF26] transition-all group">
              <Icon name="fitness_center" className="text-2xl text-[#D1FF26]" />
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 group-hover:text-[#D1FF26]">Lift</span>
            </button>
            <button onClick={() => setMode('cardio')}
              className="flex flex-col items-center gap-3 p-5 bg-[#0e0e0e] rounded-xl border border-[#1e1e1e] hover:border-[#00e3fd]/30 transition-all group">
              <Icon name="sprint" className="text-2xl text-[#00e3fd]" />
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 group-hover:text-[#00e3fd]">Cardio</span>
            </button>
          </div>
        )}

        {mode && (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Exercise Name</label>
              {mode === 'lift' ? (
                <ExerciseCombobox
                  value={name}
                  onChange={setName}
                  exercises={exercises}
                  placeholder="Search or type an exercise…"
                  inputClassName="w-full bg-[#0e0e0e] border border-[#1e1e1e] focus:border-[#D1FF26]/30 rounded-lg px-4 py-3 text-white font-medium transition-all focus:outline-none"
                />
              ) : (
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirm(); }}
                  placeholder="e.g. Treadmill Run"
                  className="w-full bg-[#0e0e0e] border border-[#1e1e1e] focus:border-[#00e3fd]/30 rounded-lg px-4 py-3 text-white font-medium transition-all focus:outline-none"
                />
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setMode(null); setName(''); }}
                className="flex-1 py-2.5 border border-[#1e1e1e] text-zinc-500 text-xs font-bold uppercase tracking-widest rounded-lg hover:text-white transition-colors">
                Back
              </button>
              <button onClick={() => confirm()} disabled={!name.trim()}
                className="flex-1 py-2.5 bg-[#D1FF26] text-zinc-950 font-black text-xs uppercase tracking-widest rounded-lg hover:bg-[#f4ffc9] transition-colors disabled:opacity-40">
                Add
              </button>
            </div>
          </div>
        )}

        {!mode && (
          <button onClick={onClose}
            className="mt-4 w-full py-2 text-zinc-600 text-xs font-bold uppercase tracking-widest hover:text-zinc-400 transition-colors">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TrackWorkoutPage() {
  const navigate = useNavigate();
  const { state: locationState } = useLocation();
  const { units, unit } = useUnits();

  const editWorkout = locationState?.editWorkout ?? null;
  const isEditMode = !!editWorkout;

  const initActivities = () => {
    if (isEditMode) return hydrateFromWorkoutForEdit(editWorkout, units);
    if (locationState?.activities) return locationState.activities;
    if (locationState?.workout) return hydrateFromWorkout(locationState.workout, units);
    return [];
  };

  const hasPreloaded = isEditMode || !!(locationState?.activities || locationState?.workout || locationState?.emptySession);
  const [phase, setPhase] = useState(hasPreloaded ? 'tracking' : 'setup');
  const [startedAt, setStartedAt] = useState(hasPreloaded ? Date.now() : null);

  const [activities, setActivities] = useState(initActivities);
  const [workoutName, setWorkoutName] = useState(() =>
    isEditMode ? (editWorkout.name ?? '') : (locationState?.workoutName ?? locationState?.workout?.name ?? '')
  );
  const [programContext, setProgramContext] = useState(() => locationState?.programContext ?? null);
  const [notes, setNotes] = useState(isEditMode ? (editWorkout.note ?? '') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showCardioPicker, setShowCardioPicker] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [exercises, setExercises] = useState([]);
  const [activeProgram, setActiveProgram] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [suggestions, setSuggestions] = useState({});
  const [predictedSetIds, setPredictedSetIds] = useState(new Set());
  const [exerciseData, setExerciseData] = useState({});   // name -> full exercise record (with standards)
  const [userBodyweight, setUserBodyweight] = useState(null);
  const [startingSession, setStartingSession] = useState(false);
  const fetchedSuggestionNamesRef = useRef(new Set());

  useEffect(() => {
    apiGetExercises().then(setExercises).catch(() => {});
    apiGetLatestBiometric().then(bio => {
      if (bio?.weight_kg) setUserBodyweight(bio.weight_kg);
    }).catch(() => {});
    if (phase === 'setup') {
      apiGetActiveProgram().then(setActiveProgram).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (phase !== 'tracking' || isEditMode) return;

    const liftNames = [...new Set(
      activities.filter(a => a.type === 'lift' && a.name).map(a => a.name)
    )];
    const newNames = liftNames.filter(n => !fetchedSuggestionNamesRef.current.has(n));
    if (!newNames.length) return;

    newNames.forEach(n => fetchedSuggestionNamesRef.current.add(n));

    apiGetExerciseSuggestions(newNames)
      .then(sugg => {
        if (!Object.keys(sugg).length) return;
        setSuggestions(prev => ({ ...prev, ...sugg }));
        const predicted = new Set();
        setActivities(prev => prev.map(a => {
          if (a.type !== 'lift' || !sugg[a.name]) return a;
          const s = sugg[a.name];
          return {
            ...a,
            sets: a.sets.map(set => {
              if (set.isWarmup || set.targetWeight !== '' || set.targetReps !== '') return set;
              predicted.add(set.id);
              return {
                ...set,
                targetWeight: s.weight_kg != null ? _kgToDisplayStr(s.weight_kg, units) : '',
                targetReps: s.reps != null ? String(s.reps) : '',
              };
            }),
          };
        }));
        setPredictedSetIds(prev => new Set([...prev, ...predicted]));
      })
      .catch(() => {});
  }, [phase, activities]);

  // Lazily fetch full exercise records (with standards) as activities are added
  useEffect(() => {
    if (phase !== 'tracking') return;
    const names = [...new Set(activities.filter(a => a.type === 'lift' && a.name).map(a => a.name))];
    const missing = names.filter(n => !exerciseData[n]);
    if (!missing.length) return;
    missing.forEach(name => {
      apiGetExercise(name).then(data => {
        setExerciseData(prev => ({ ...prev, [name]: data }));
      }).catch(() => {});
    });
  }, [activities, phase]);

  const elapsed = useTimer(startedAt);

  async function handleResumeAndStart() {
    if (!activeProgram?.current_day_data) return;
    const d = activeProgram.current_day_data;
    setStartingSession(true);
    let raw = d.activities;
    try {
      const computed = await apiGetDayWithTargets(activeProgram.id, d.week, d.day);
      raw = computed.activities;
    } catch {}
    setActivities(hydrateActivitiesForTracker(raw, units));
    setWorkoutName(`${activeProgram.name} — W${d.week} D${d.day}${d.label ? ` (${d.label})` : ''}`);
    setProgramContext({
      programId: activeProgram.id,
      programName: activeProgram.name,
      week: d.week,
      day: d.day,
      dayLabel: d.label ?? null,
    });
    setStartedAt(Date.now());
    setPhase('tracking');
    setStartingSession(false);
  }

  async function handleLoadDay(day, prog, week) {
    setStartingSession(true);
    let raw = day.activities;
    try {
      const computed = await apiGetDayWithTargets(prog.id, week.week, day.day);
      raw = computed.activities;
    } catch {}
    setActivities(hydrateActivitiesForTracker(raw, units));
    setWorkoutName(`${prog.name} — W${week.week} D${day.day}${day.label ? ` (${day.label})` : ''}`);
    setProgramContext({
      programId: prog.id,
      programName: prog.name,
      week: week.week,
      day: day.day,
      dayLabel: day.label ?? null,
    });
    setShowPicker(false);
    setStartingSession(false);
  }

  function handleStart() {
    setStartedAt(Date.now());
    setPhase('tracking');
  }

  function addActivity(act) { setActivities(prev => [...prev, act]); }
  function removeActivity(actId) { setActivities(prev => prev.filter(a => a.id !== actId)); }

  function toggleSetDone(actId, setId) {
    setActivities(acts => acts.map(a => {
      if (a.id !== actId || a.type !== 'lift') return a;
      return { ...a, sets: a.sets.map(s => s.id === setId ? { ...s, done: !s.done } : s) };
    }));
  }

  function updateSet(actId, setId, field, value) {
    setActivities(acts => acts.map(a => {
      if (a.id !== actId || a.type !== 'lift') return a;
      return { ...a, sets: a.sets.map(s => s.id === setId ? { ...s, [field]: value } : s) };
    }));
  }

  function addSet(actId) {
    setActivities(acts => acts.map(a => {
      if (a.id !== actId || a.type !== 'lift') return a;
      const last = a.sets[a.sets.length - 1];
      return { ...a, sets: [...a.sets, { id: uid(), isWarmup: false, targetWeight: last?.targetWeight ?? '', targetReps: last?.targetReps ?? '', weight: '', reps: '', intensity: 'RIR 2', done: false }] };
    }));
  }

  function removeSet(actId, setId) {
    setActivities(acts => acts.map(a => {
      if (a.id !== actId || a.type !== 'lift') return a;
      if (a.sets.length <= 1) return a;
      return { ...a, sets: a.sets.filter(s => s.id !== setId) };
    }));
  }

  function updateActivityName(actId, name) {
    setActivities(acts => acts.map(a => a.id !== actId ? a : { ...a, name }));
  }

  function updateCardio(actId, field, value) {
    setActivities(acts => acts.map(a => a.id !== actId ? a : { ...a, [field]: value }));
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      if (isEditMode) {
        await apiUpdateWorkout(editWorkout.id, {
          name: workoutName.trim() || 'Workout',
          note: notes.trim() || null,
          activities: serializeActivities(activities, units),
        });
        navigate(`/history/${editWorkout.id}`);
      } else {
        await apiCreateWorkout({
          name: workoutName.trim() || 'Workout',
          note: notes.trim() || null,
          started_at: new Date(startedAt).toISOString(),
          completed_at: new Date().toISOString(),
          activities: serializeActivities(activities, units),
          program_id: programContext?.programId ?? null,
          program_week: programContext?.week ?? null,
          program_day: programContext?.day ?? null,
          program_day_label: programContext?.dayLabel ?? null,
        });
        if (programContext?.programId) {
          try { await apiAdvanceProgram(programContext.programId); } catch {}
        }
        navigate('/history');
      }
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const allSets = activities.flatMap(a => a.sets ?? []);
  const totalSets = allSets.length;
  const doneSets = allSets.filter(s => s.done).length;
  const progress = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const circumference = 2 * Math.PI * 44;
  const offset = circumference - (progress / 100) * circumference;

  // ── Setup Phase ───────────────────────────────────────────────────────
  if (phase === 'setup') {
    const hasActive = !!activeProgram?.current_day_data;
    const d = activeProgram?.current_day_data;

    if (hasActive) {
      return (
        <div className="p-6 max-w-lg mx-auto w-full animate-in fade-in duration-500">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 uppercase tracking-widest font-bold transition-colors mb-8"
          >
            <Icon name="arrow_back" className="text-sm" />
            Back
          </button>

          {/* Program heading */}
          <div className="mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#D1FF26] mb-3">Active Program</p>
            <h1 className="text-3xl font-headline font-black tracking-tight text-white">
              {activeProgram.name}
            </h1>
          </div>
          <p className="text-sm text-zinc-500 mb-8">
            Week {d.week} · Day {d.day}
            {d.label && <span className="text-zinc-700"> — {d.label}</span>}
            <span className="mx-2 text-zinc-700">·</span>
            {d.activities.length} exercise{d.activities.length !== 1 ? 's' : ''}
          </p>

          {/* Exercise list */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden mb-6">
            {d.activities.map((a, i) => (
              <div key={i} className={`flex items-center gap-3 px-5 py-3.5 ${i > 0 ? 'border-t border-[#1e1e1e]' : ''}`}>
                <Icon
                  name={a.type === 'lift' ? 'fitness_center' : 'sprint'}
                  className={`text-sm flex-shrink-0 ${a.type === 'lift' ? 'text-[#D1FF26]/50' : 'text-[#ffe56b]/50'}`}
                />
                <span className="text-sm font-bold text-white flex-1">{a.name}</span>
                {a.type === 'lift' && a.sets?.length > 0 && (
                  <span className="text-[10px] text-zinc-600">
                    {a.sets.filter(s => !s.is_warmup).length} sets
                    {a.sets.some(s => s.is_warmup) ? ` + ${a.sets.filter(s => s.is_warmup).length}W` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Primary CTA */}
          <button
            onClick={handleResumeAndStart}
            disabled={startingSession}
            className="w-full py-4 rounded-xl bg-[#D1FF26] text-zinc-950 font-headline font-black uppercase tracking-widest text-base flex items-center justify-center gap-2 hover:bg-[#f4ffc9] active:scale-[0.98] transition-all disabled:opacity-70"
          >
            {startingSession
              ? <><Icon name="autorenew" className="text-xl animate-spin" /> Loading targets…</>
              : <><Icon name="play_arrow" fill className="text-xl" /> Start Session</>
            }
          </button>

          {/* Secondary options */}
          <div className="mt-4 flex items-center justify-center gap-5">
            <button
              onClick={() => setShowPicker(v => !v)}
              className="text-xs text-zinc-600 hover:text-zinc-400 font-bold uppercase tracking-widest transition-colors"
            >
              Different Day
            </button>
            <span className="w-1 h-1 rounded-full bg-zinc-800 flex-shrink-0" />
            <button
              onClick={handleStart}
              className="text-xs text-zinc-600 hover:text-zinc-400 font-bold uppercase tracking-widest transition-colors"
            >
              Empty Session
            </button>
          </div>

          {showPicker && (
            <div className="mt-5 bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-4">Load a Different Day</p>
              <ProgramDayPicker onLoad={(day, prog, week) => { handleLoadDay(day, prog, week); setShowPicker(false); }} />
            </div>
          )}
        </div>
      );
    }

    // No active program
    return (
      <div className="p-6 max-w-2xl mx-auto w-full animate-in fade-in duration-500">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 uppercase tracking-widest font-bold transition-colors mb-8"
        >
          <Icon name="arrow_back" className="text-sm" />
          Back
        </button>

        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">New Session</p>
          <h1 className="text-2xl font-headline font-black tracking-tight text-white">Track Workout</h1>
        </div>

        {/* Workout name */}
        <div className="mb-6">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Workout Name</label>
          <input
            value={workoutName}
            onChange={e => setWorkoutName(e.target.value)}
            placeholder="e.g. Monday Push, Leg Day…"
            className="w-full text-xl font-headline font-black tracking-tight text-white bg-transparent border-b border-[#1e1e1e] focus:border-[#D1FF26]/40 focus:outline-none py-2 placeholder:text-zinc-800 transition-colors"
          />
        </div>

        {/* Load from program */}
        <div className="mb-6 bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <button
            onClick={() => setShowPicker(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#1a1a1a] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                <Icon name="view_week" className="text-[#D1FF26] text-sm" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">Load from Program</p>
                {programContext ? (
                  <p className="text-[10px] text-[#D1FF26] font-bold mt-0.5">
                    {programContext.programName} · W{programContext.week} D{programContext.day}
                    {programContext.dayLabel ? ` · ${programContext.dayLabel}` : ''}
                  </p>
                ) : (
                  <p className="text-[10px] text-zinc-600 mt-0.5">Pre-load exercises from a program day</p>
                )}
              </div>
            </div>
            <Icon name={showPicker ? 'expand_less' : 'expand_more'} className="text-zinc-600" />
          </button>

          {showPicker && (
            <div className="px-5 pb-5 border-t border-[#1e1e1e] pt-4">
              <ProgramDayPicker onLoad={handleLoadDay} />
            </div>
          )}
        </div>

        {/* Exercise preview */}
        {activities.length > 0 && (
          <div className="mb-6 bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1e1e1e]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                {activities.length} exercise{activities.length !== 1 ? 's' : ''} loaded
              </p>
            </div>
            {activities.map((act, i) => (
              <div key={act.id} className={`flex items-center gap-3 px-5 py-3 ${i > 0 ? 'border-t border-[#1e1e1e]' : ''}`}>
                <Icon
                  name={act.type === 'lift' ? 'fitness_center' : 'sprint'}
                  className={`text-sm flex-shrink-0 ${act.type === 'lift' ? 'text-[#D1FF26]/60' : 'text-[#ffe56b]/60'}`}
                />
                <span className="text-sm font-bold text-white flex-1">{act.name || `Exercise ${i + 1}`}</span>
                {act.type === 'lift' && (
                  <span className="text-[10px] text-zinc-600">
                    {act.sets.filter(s => !s.isWarmup).length} sets
                    {act.sets.some(s => s.isWarmup) ? ` + ${act.sets.filter(s => s.isWarmup).length}W` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Start CTA */}
        <button
          onClick={handleStart}
          disabled={startingSession}
          className="w-full py-4 rounded-xl bg-[#D1FF26] text-zinc-950 font-headline font-black uppercase tracking-widest text-base flex items-center justify-center gap-2 hover:bg-[#f4ffc9] active:scale-[0.98] transition-all disabled:opacity-70"
        >
          {startingSession
            ? <><Icon name="autorenew" className="text-xl animate-spin" /> Loading targets…</>
            : <><Icon name="play_arrow" fill className="text-xl" />{activities.length > 0 ? 'Start Session' : 'Start Empty Session'}</>
          }
        </button>

        <div className="h-8" />
      </div>
    );
  }

  // ── Tracking Phase ────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto w-full animate-in fade-in duration-500">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        {confirmDiscard ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Discard session?</span>
            <button
              onClick={() => navigate('/history')}
              className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-red-500/20 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDiscard(false)}
              className="px-3 py-1.5 bg-[#1e1e1e] text-zinc-500 text-xs font-bold uppercase tracking-widest rounded-lg hover:text-zinc-200 transition-colors"
            >
              Keep going
            </button>
          </div>
        ) : (
          <button
            onClick={() => isEditMode ? navigate(`/history/${editWorkout.id}`) : setConfirmDiscard(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 uppercase tracking-widest font-bold transition-colors"
          >
            <Icon name="arrow_back" className="text-sm" />
            {isEditMode ? 'Back' : 'Discard'}
          </button>
        )}

        <div className="flex items-center gap-3">
          {!isEditMode ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#111] border border-[#1e1e1e] rounded-lg">
              <Icon name="timer" className="text-sm text-[#00e3fd]" />
              <span className="text-sm font-headline font-bold text-white tabular-nums">{elapsed}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-zinc-600 text-xs font-bold uppercase tracking-widest">
              <Icon name="edit" className="text-sm" />
              {new Date(editWorkout.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
          <button
            onClick={handleFinish}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#D1FF26] text-zinc-950 text-xs font-black uppercase tracking-widest rounded hover:bg-[#f4ffc9] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : isEditMode ? 'Save Changes' : 'Finish Workout'}
            {!saving && <Icon name={isEditMode ? 'save' : 'check'} className="text-sm" />}
          </button>
        </div>
      </div>

      {showExercisePicker && (
        <ExercisePickerModal
          exercises={exercises.filter(e => e.bodypart !== 'Cardio')}
          onAdd={name => addActivity(newLift(name))}
          onClose={() => setShowExercisePicker(false)}
        />
      )}

      {showCardioPicker && (
        <ExercisePickerModal
          exercises={exercises.filter(e => e.bodypart === 'Cardio')}
          onAdd={name => addActivity(newCardio(name))}
          onClose={() => setShowCardioPicker(false)}
        />
      )}

      {/* Program context badge */}
      {programContext && (
        <div
          onClick={() => navigate(`/programs/${programContext.programId}`)}
          className="mb-4 flex items-center gap-2 px-4 py-2 bg-[#111] border border-[#D1FF26]/10 rounded-lg cursor-pointer hover:border-[#D1FF26]/25 transition-colors group w-fit"
        >
          <Icon name="view_week" className="text-sm text-[#D1FF26]" />
          <span className="text-xs font-bold text-[#D1FF26] group-hover:underline">{programContext.programName}</span>
          <span className="text-zinc-700 text-xs">·</span>
          <span className="text-xs font-bold text-zinc-400">
            W{programContext.week} D{programContext.day}
            {programContext.dayLabel && ` — ${programContext.dayLabel}`}
          </span>
          <Icon name="open_in_new" className="text-xs text-zinc-700 group-hover:text-[#D1FF26]/60 transition-colors" />
        </div>
      )}

      {/* Workout name */}
      <input
        value={workoutName}
        onChange={e => setWorkoutName(e.target.value)}
        placeholder="Workout name…"
        className="text-2xl font-headline font-black tracking-tight text-white bg-transparent border-none focus:outline-none w-full placeholder:text-zinc-800 mb-6"
      />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Activities */}
        <div className="lg:col-span-2 space-y-4">
          {activities.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-4 bg-[#111] border border-dashed border-[#1e1e1e] rounded-xl">
              <Icon name="fitness_center" className="text-3xl text-zinc-700" />
              <p className="text-zinc-600 text-xs uppercase tracking-widest font-bold">No exercises yet</p>
              <div className="flex gap-3 mt-1">
                <button
                  onClick={() => setShowExercisePicker(true)}
                  className="px-4 py-2 border border-[#D1FF26]/30 text-[#D1FF26] text-xs font-bold uppercase tracking-widest rounded hover:bg-[#D1FF26]/5 transition-colors flex items-center gap-1.5"
                >
                  <Icon name="fitness_center" className="text-sm" />
                  Add Lift
                </button>
                <button
                  onClick={() => setShowCardioPicker(true)}
                  className="px-4 py-2 border border-[#00e3fd]/20 text-[#00e3fd]/60 text-xs font-bold uppercase tracking-widest rounded hover:bg-[#00e3fd]/5 transition-colors flex items-center gap-1.5"
                >
                  <Icon name="sprint" className="text-sm" />
                  Add Cardio
                </button>
              </div>
            </div>
          )}

          {activities.map(activity => (
            <div key={activity.id}>
              {activity.type === 'lift' && (
                <LiftActivity
                  activity={activity}
                  onToggleDone={toggleSetDone}
                  onUpdateSet={updateSet}
                  onAddSet={addSet}
                  onRemoveSet={removeSet}
                  onUpdateName={updateActivityName}
                  onRemove={removeActivity}
                  unit={unit}
                  units={units}
                  suggestion={suggestions[activity.name] ?? null}
                  predictedSetIds={predictedSetIds}
                  exerciseRecord={exerciseData[activity.name] ?? null}
                  userBodyweight={userBodyweight}
                />
              )}
              {activity.type === 'cardio' && (
                <CardioActivity
                  activity={activity}
                  onUpdate={updateCardio}
                  onUpdateName={updateActivityName}
                  onRemove={removeActivity}
                />
              )}
            </div>
          ))}

          {activities.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowExercisePicker(true)}
                className="py-3.5 border border-dashed border-[#1e1e1e] text-zinc-700 hover:border-[#D1FF26]/30 hover:text-[#D1FF26] rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
              >
                <Icon name="fitness_center" className="text-sm" />
                Add Lift
              </button>
              <button
                onClick={() => setShowCardioPicker(true)}
                className="py-3.5 border border-dashed border-[#1e1e1e] text-zinc-700 hover:border-[#00e3fd]/20 hover:text-[#00e3fd]/60 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
              >
                <Icon name="sprint" className="text-sm" />
                Add Cardio
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">

          {/* Progress ring */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-5">Progress</p>
            <div className="flex items-center justify-center">
              <div className="relative w-28 h-28">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="44" fill="transparent" stroke="#1e1e1e" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="44" fill="transparent"
                    stroke="url(#progressGrad)" strokeWidth="8"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                  <defs>
                    <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#D1FF26" />
                      <stop offset="100%" stopColor="#00e3fd" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-headline font-bold text-white">{progress}%</span>
                  <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">Done</span>
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 divide-x divide-[#1e1e1e]">
              <div className="text-center">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1">Sets</p>
                <p className="text-xl font-headline font-bold text-white">
                  {doneSets}<span className="text-zinc-700 text-lg">/{totalSets}</span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold mb-1">Exercises</p>
                <p className="text-xl font-headline font-bold text-white">{activities.length}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Session notes, cues to remember…"
              className="w-full bg-[#0e0e0e] border border-[#1e1e1e] rounded-lg p-3 text-sm text-zinc-400 min-h-[120px] focus:border-[#2a2a2a] focus:outline-none placeholder:text-zinc-700 resize-none transition-colors"
            />
          </div>

          {/* Discard */}
          {error && <p className="text-[#d53d18] text-xs text-center">{error}</p>}
          <button
            onClick={() => isEditMode ? navigate(`/history/${editWorkout.id}`) : navigate('/history')}
            disabled={saving}
            className="w-full py-3 px-4 rounded-xl border border-[#d53d18]/15 text-[#d53d18] font-bold uppercase tracking-widest text-xs hover:bg-[#d53d18]/5 transition-colors disabled:opacity-40"
          >
            {isEditMode ? 'Cancel Edit' : 'Discard Session'}
          </button>
        </div>
      </div>

      <div className="h-8" />
    </div>
  );
}

// ── LiftActivity ───────────────────────────────────────────────────────────

function LiftActivity({ activity, onToggleDone, onUpdateSet, onAddSet, onRemoveSet, onUpdateName, onRemove, unit, units, suggestion, predictedSetIds, exerciseRecord, userBodyweight }) {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">

      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <input
          value={activity.name}
          onChange={e => onUpdateName(activity.id, e.target.value)}
          placeholder="Exercise name"
          className="text-xl font-headline font-black tracking-tight text-white bg-transparent border-none focus:outline-none flex-1 min-w-0 mr-3"
        />
        <button onClick={() => onRemove(activity.id)} className="text-zinc-700 hover:text-[#d53d18] transition-colors flex-shrink-0 mt-0.5">
          <Icon name="close" className="text-base" />
        </button>
      </div>

      {/* Primary muscle chips */}
      {exerciseRecord?.primary_muscles?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {exerciseRecord.primary_muscles.slice(0, 3).map(m => (
            <span key={m} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1e1e1e] text-zinc-500">
              {muscleName(m)}
            </span>
          ))}
        </div>
      )}

      {/* Prior performance */}
      {suggestion?.last_weight_kg != null ? (
        <div className="flex items-center gap-2 mb-4 text-[10px] text-zinc-600">
          <Icon name="history" style={{ fontSize: 11 }} />
          <span>Last: <span className="text-zinc-500">{_kgToDisplayStr(suggestion.last_weight_kg, units)} {unit} × {suggestion.last_reps}</span></span>
          <span className="text-zinc-800">·</span>
          <span>Est. 1RM: <span className="text-zinc-500">~{_kgToDisplayStr(suggestion.estimated_1rm, units)} {unit}</span></span>
        </div>
      ) : (
        <div className="mb-4" />
      )}

      {activity.note && (
        <p className="text-xs text-zinc-600 mb-3 italic">{activity.note}</p>
      )}

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#1e1e1e]">
              <th className="pb-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-700 w-8">Set</th>
              <th className="pb-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-700">
                <span className="flex items-center gap-1">
                  Target
                  {suggestion && <Icon name="trending_up" style={{ fontSize: 10 }} className="text-[#D1FF26]/40" />}
                </span>
              </th>
              <th className="pb-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-700">{unit ?? 'kg'}</th>
              <th className="pb-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-700">Reps</th>
              <th className="pb-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-700">RPE / RIR</th>
              <th className="pb-2.5 w-10" />
              <th className="pb-2.5 w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e1e]/60">
            {activity.sets.map((set, idx) => (
              <tr key={set.id} className={`group transition-opacity ${set.done ? 'opacity-50' : ''}`}>
                <td className="py-3 font-headline font-bold text-zinc-500 text-sm">
                  {idx + 1}
                  {set.isWarmup && <span className="ml-1.5 text-[9px] bg-[#1e1e1e] px-1.5 py-0.5 rounded text-[#00e3fd]">W</span>}
                </td>
                <td className="py-3 text-zinc-600 text-xs">
                  <div className="flex gap-1 items-center">
                    <input type="text" value={set.targetWeight}
                      onChange={e => onUpdateSet(activity.id, set.id, 'targetWeight', e.target.value)}
                      placeholder="—"
                      className="w-12 bg-transparent border-0 border-b border-[#1e1e1e] text-zinc-500 text-xs py-0.5 focus:outline-none" />
                    <span className="text-zinc-700">×</span>
                    <input type="text" value={set.targetReps}
                      onChange={e => onUpdateSet(activity.id, set.id, 'targetReps', e.target.value)}
                      placeholder="—"
                      className="w-10 bg-transparent border-0 border-b border-[#1e1e1e] text-zinc-500 text-xs py-0.5 focus:outline-none" />
                  </div>
                  {!set.isWarmup && predictedSetIds?.has(set.id) && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      <Icon name="auto_awesome" style={{ fontSize: 9 }} className="text-[#D1FF26]/40" />
                      <span className="text-[8px] text-[#D1FF26]/40 uppercase tracking-wider">predicted</span>
                    </div>
                  )}
                </td>
                <td className="py-3">
                  <input
                    type="text" value={set.weight}
                    onChange={e => onUpdateSet(activity.id, set.id, 'weight', e.target.value)}
                    placeholder={set.targetWeight || '0'}
                    className={`w-20 bg-transparent border-0 border-b-2 py-1 font-bold text-sm transition-colors focus:outline-none ${
                      set.weight !== '' && parseFloat(set.weight) < 0
                        ? 'border-[#d53d18] text-[#d53d18]'
                        : 'border-[#2a2a2a] focus:border-[#00e3fd] text-white'
                    }`}
                  />
                  {set.weight !== '' && parseFloat(set.weight) < 0 &&
                    <p className="text-[9px] text-[#d53d18] mt-0.5">≥ 0</p>}
                  {(() => {
                    if (set.isWarmup || !set.weight || !userBodyweight || !exerciseRecord?.standards_male?.length) return null;
                    const lvl = computeLevel(exerciseRecord.standards_male, _displayToKg(set.weight, units), userBodyweight);
                    if (!lvl) return null;
                    const cfg = LEVEL_CONFIG[lvl];
                    return (
                      <span className={`inline-block mt-0.5 text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    );
                  })()}
                </td>
                <td className="py-3">
                  <input
                    type="text" value={set.reps}
                    onChange={e => onUpdateSet(activity.id, set.id, 'reps', e.target.value)}
                    placeholder={set.targetReps || '0'}
                    className={`w-16 bg-transparent border-0 border-b-2 py-1 font-bold text-sm transition-colors focus:outline-none ${
                      set.reps !== '' && parseInt(set.reps) <= 0
                        ? 'border-[#d53d18] text-[#d53d18]'
                        : 'border-[#2a2a2a] focus:border-[#00e3fd] text-white'
                    }`}
                  />
                  {set.reps !== '' && parseInt(set.reps) <= 0 &&
                    <p className="text-[9px] text-[#d53d18] mt-0.5">&gt; 0</p>}
                </td>
                <td className="py-3">
                  <select
                    value={set.intensity}
                    onChange={e => onUpdateSet(activity.id, set.id, 'intensity', e.target.value)}
                    className="bg-[#1a1a1a] border border-[#1e1e1e] text-xs rounded px-2 py-1 text-zinc-500 focus:outline-none cursor-pointer"
                  >
                    {INTENSITY_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td className="py-3 text-center">
                  <button
                    onClick={() => onToggleDone(activity.id, set.id)}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all mx-auto ${
                      set.done
                        ? 'border-[#D1FF26] bg-[#D1FF26]/10 text-[#D1FF26]'
                        : 'border-[#2a2a2a] text-zinc-700 hover:border-[#D1FF26]/50 hover:text-[#D1FF26]/50'
                    }`}
                  >
                    <Icon name="check" fill={set.done} className="text-sm" />
                  </button>
                </td>
                <td className="py-3 pl-1">
                  <button
                    onClick={() => onRemoveSet(activity.id, set.id)}
                    className="text-zinc-800 hover:text-[#d53d18] transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Icon name="remove" className="text-sm" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked sets */}
      <div className="sm:hidden space-y-2">
        {activity.sets.map((set, idx) => (
          <div key={set.id} className={`bg-[#0e0e0e] border border-[#1e1e1e] rounded-lg p-3 transition-opacity ${set.done ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                Set {idx + 1}
                {set.isWarmup && <span className="ml-1.5 text-[9px] text-[#00e3fd]">WARM-UP</span>}
              </span>
              <button
                onClick={() => onToggleDone(activity.id, set.id)}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                  set.done
                    ? 'border-[#D1FF26] bg-[#D1FF26]/10 text-[#D1FF26]'
                    : 'border-[#2a2a2a] text-zinc-700'
                }`}
              >
                <Icon name="check" fill={set.done} className="text-sm" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">{unit ?? 'kg'}</label>
                <input
                  type="text" value={set.weight}
                  onChange={e => onUpdateSet(activity.id, set.id, 'weight', e.target.value)}
                  placeholder={set.targetWeight || '0'}
                  className="w-full bg-transparent border-b border-[#1e1e1e] py-1 font-bold text-white text-sm focus:outline-none focus:border-[#00e3fd] transition-colors mt-1"
                />
                {(() => {
                  if (set.isWarmup || !set.weight || !userBodyweight || !exerciseRecord?.standards_male?.length) return null;
                  const lvl = computeLevel(exerciseRecord.standards_male, _displayToKg(set.weight, units), userBodyweight);
                  if (!lvl) return null;
                  const cfg = LEVEL_CONFIG[lvl];
                  return (
                    <span className={`inline-block mt-0.5 text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded ${cfg.bg} ${cfg.text}`}>
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>
              <div>
                <label className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">Reps</label>
                <input
                  type="text" value={set.reps}
                  onChange={e => onUpdateSet(activity.id, set.id, 'reps', e.target.value)}
                  placeholder={set.targetReps || '0'}
                  className="w-full bg-transparent border-b border-[#1e1e1e] py-1 font-bold text-white text-sm focus:outline-none focus:border-[#00e3fd] transition-colors mt-1"
                />
              </div>
            </div>
            {set.targetWeight && (
              <p className="text-[10px] text-zinc-700 mt-1.5">
                Target: {set.targetWeight} × {set.targetReps || '—'}
                {!set.isWarmup && predictedSetIds?.has(set.id) && (
                  <span className="ml-1.5 text-[#D1FF26]/40">✦ predicted</span>
                )}
              </p>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => onAddSet(activity.id)}
        className="mt-4 flex items-center gap-1.5 text-xs font-bold text-zinc-600 hover:text-[#00e3fd] uppercase tracking-widest transition-colors"
      >
        <Icon name="add" className="text-sm" />
        Add Set
      </button>
    </div>
  );
}

// ── CardioActivity ─────────────────────────────────────────────────────────

function CardioActivity({ activity, onUpdate, onUpdateName, onRemove }) {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
      <div className="flex items-center gap-3 mb-5">
        <Icon name="sprint" className="text-[#ffe56b]/70 flex-shrink-0" />
        <input
          value={activity.name}
          onChange={e => onUpdateName(activity.id, e.target.value)}
          placeholder="Cardio name"
          className="text-xl font-headline font-black tracking-tight text-white bg-transparent border-none focus:outline-none flex-1 min-w-0"
        />
        <button onClick={() => onRemove(activity.id)} className="text-zinc-700 hover:text-[#d53d18] transition-colors flex-shrink-0">
          <Icon name="close" className="text-base" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Distance (km)</label>
          <input
            type="text" value={activity.distance}
            onChange={e => onUpdate(activity.id, 'distance', e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent border-b border-[#1e1e1e] focus:border-[#00e3fd] py-2 text-white font-bold text-lg focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Duration (min or mm:ss)</label>
          <input
            type="text" value={activity.duration}
            onChange={e => onUpdate(activity.id, 'duration', e.target.value)}
            placeholder="30:00"
            className="w-full bg-transparent border-b border-[#1e1e1e] focus:border-[#00e3fd] py-2 text-white font-bold text-lg focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Intensity</label>
          <select
            value={activity.intensity}
            onChange={e => onUpdate(activity.id, 'intensity', e.target.value)}
            className="w-full bg-[#1a1a1a] border border-[#1e1e1e] rounded-lg py-2 px-3 text-white font-bold text-sm focus:outline-none cursor-pointer"
          >
            {['RPE 4', 'RPE 5', 'RPE 6', 'RPE 7', 'RPE 8', 'RPE 9'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
