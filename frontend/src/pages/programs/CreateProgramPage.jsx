import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import ExerciseCombobox from '../../components/ui/ExerciseCombobox';
import ExercisePickerModal from '../../components/ui/ExercisePickerModal';
import { apiCreateProgram, apiGetProgram, apiUpdateProgram, apiGetExercises } from '../../lib/api';
import { displayToKg, kgToDisplayStr, useUnits } from '../../lib/units';

// ── Helpers ────────────────────────────────────────────────────────────────

let _uidCounter = 0;
function uid() { return `${Date.now()}-${++_uidCounter}`; }

function parseIntensity(str) {
  if (!str) return null;
  const [type, val] = str.split(' ');
  if (type === 'RPE') return { type: 'rpe', value: parseFloat(val) };
  if (type === 'RIR') return { type: 'rir', value: parseInt(val) };
  return null;
}

function intensityToString(i) {
  if (!i) return 'RIR 2';
  if (i.type === 'rpe') return `RPE ${i.value}`;
  if (i.type === 'rir') return `RIR ${i.value}`;
  return 'RIR 2';
}

function newSet() {
  return { _id: uid(), isWarmup: false, targetWeight: '', targetReps: '', intensity: 'RIR 2' };
}

function newLift(name = '') {
  return { _id: uid(), type: 'lift', name, note: '', sets: [newSet()] };
}

function newCardio(name = '') {
  return { _id: uid(), type: 'cardio', name, duration: '', intensity: 'RPE 6' };
}

function newDay(n) {
  return { _id: uid(), day: n, label: '', isRest: false, activities: [] };
}

function newWeek(n) {
  return { _id: uid(), week: n, days: [newDay(1)] };
}

function serializeWeeks(weeks, units) {
  return weeks.map(w => ({
    week: w.week,
    days: w.days.map(d => ({
      day: d.day,
      label: d.label || null,
      activities: d.isRest ? [] : d.activities.map(a => {
        if (a.type === 'lift') {
          return {
            type: 'lift',
            name: a.name || 'Unnamed Exercise',
            note: a.note || null,
            sets: a.sets.map(s => ({
              is_warmup: s.isWarmup,
              target_performance: {
                weight_kg: s.targetWeight ? (displayToKg(parseFloat(s.targetWeight), units) ?? parseFloat(s.targetWeight)) : null,
                reps: s.targetReps ? parseInt(s.targetReps) : null,
                intensity: parseIntensity(s.intensity),
              },
              current_performance: null,
              completed: false,
            })),
          };
        }
        return {
          type: 'cardio',
          name: a.name || 'Cardio',
          note: null,
          distance_meters: null,
          duration_seconds: a.duration ? parseInt(a.duration) * 60 : null,
          intensity: parseIntensity(a.intensity),
        };
      }),
    })),
  }));
}

// Hydrate API response back to editable local state
function hydrateWeeks(apiWeeks, units) {
  return (apiWeeks ?? []).map(w => ({
    _id: uid(),
    week: w.week,
    days: (w.days ?? []).map(d => ({
      _id: uid(),
      day: d.day,
      label: d.label ?? '',
      isRest: d.activities?.length === 0,
      activities: (d.activities ?? []).map(a => {
        if (a.type === 'lift') {
          return {
            _id: uid(),
            type: 'lift',
            name: a.name ?? '',
            note: a.note ?? '',
            sets: (a.sets ?? []).map(s => ({
              _id: uid(),
              isWarmup: s.is_warmup ?? false,
              targetWeight: s.target_performance?.weight_kg != null ? kgToDisplayStr(s.target_performance.weight_kg, units) : '',
              targetReps: s.target_performance?.reps != null ? String(s.target_performance.reps) : '',
              intensity: intensityToString(s.target_performance?.intensity),
            })),
          };
        }
        return {
          _id: uid(),
          type: 'cardio',
          name: a.name ?? '',
          duration: a.duration_seconds ? String(Math.round(a.duration_seconds / 60)) : '',
          intensity: intensityToString(a.intensity),
        };
      }),
    })),
  }));
}

const INTENSITY_OPTIONS = ['RPE 6', 'RPE 7', 'RPE 8', 'RPE 9', 'RPE 10', 'RIR 0', 'RIR 1', 'RIR 2', 'RIR 3'];
const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

// ── Main Component ─────────────────────────────────────────────────────────

export default function CreateProgramPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { units } = useUnits();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    name: '',
    tagline: '',
    description: '',
    equipment: 'full_gym',
    level: 'intermediate',
    duration_weeks: '',
    days_per_week: '',
    minutes_per_workout: '',
    recommended_days: [],
  });

  const [weeks, setWeeks] = useState([newWeek(1)]);
  const [openWeeks, setOpenWeeks] = useState({ 0: true });
  const [exercises, setExercises] = useState([]);

  useEffect(() => {
    apiGetExercises().then(setExercises).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    apiGetProgram(id)
      .then(p => {
        setForm({
          name: p.name ?? '',
          tagline: p.tagline ?? '',
          description: p.description ?? '',
          equipment: p.details?.equipment ?? 'full_gym',
          level: p.details?.level ?? 'intermediate',
          duration_weeks: p.details?.duration_weeks != null ? String(p.details.duration_weeks) : '',
          days_per_week: p.details?.days_per_week != null ? String(p.details.days_per_week) : '',
          minutes_per_workout: p.details?.minutes_per_workout != null ? String(p.details.minutes_per_workout) : '',
          recommended_days: p.details?.recommended_days ?? [],
        });
        setWeeks(hydrateWeeks(p.weeks, units));
        setOpenWeeks({ 0: true });
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Form field helpers ──────────────────────────────────────────────────

  function setField(key, value) { setForm(f => ({ ...f, [key]: value })); }

  function toggleDay(day) {
    setForm(f => ({
      ...f,
      recommended_days: f.recommended_days.includes(day)
        ? f.recommended_days.filter(d => d !== day)
        : [...f.recommended_days, day],
    }));
  }

  // ── Week helpers ────────────────────────────────────────────────────────

  function addWeek() {
    setWeeks(ws => {
      const next = [...ws, newWeek(ws.length + 1)];
      setOpenWeeks(o => ({ ...o, [next.length - 1]: true }));
      return next;
    });
  }

  function removeWeek(wi) {
    setWeeks(ws => ws.filter((_, i) => i !== wi).map((w, i) => ({ ...w, week: i + 1 })));
  }

  function toggleWeek(wi) {
    setOpenWeeks(o => ({ ...o, [wi]: !o[wi] }));
  }

  function updateWeek(wi, fn) {
    setWeeks(ws => ws.map((w, i) => i === wi ? fn(w) : w));
  }

  // ── Day helpers ─────────────────────────────────────────────────────────

  function addDay(wi) {
    updateWeek(wi, w => ({
      ...w,
      days: [...w.days, newDay(w.days.length + 1)],
    }));
  }

  function removeDay(wi, di) {
    updateWeek(wi, w => ({
      ...w,
      days: w.days.filter((_, i) => i !== di).map((d, i) => ({ ...d, day: i + 1 })),
    }));
  }

  function updateDay(wi, di, fn) {
    updateWeek(wi, w => ({ ...w, days: w.days.map((d, i) => i === di ? fn(d) : d) }));
  }

  // ── Activity helpers ────────────────────────────────────────────────────

  function addActivity(wi, di, type, name = '') {
    updateDay(wi, di, d => ({
      ...d,
      activities: [...d.activities, type === 'lift' ? newLift(name) : newCardio(name)],
    }));
  }

  function removeActivity(wi, di, aid) {
    updateDay(wi, di, d => ({
      ...d,
      activities: d.activities.filter(a => a._id !== aid),
    }));
  }

  function updateActivity(wi, di, aid, fn) {
    updateDay(wi, di, d => ({
      ...d,
      activities: d.activities.map(a => a._id === aid ? fn(a) : a),
    }));
  }

  // ── Set helpers ─────────────────────────────────────────────────────────

  function addSet(wi, di, aid) {
    updateActivity(wi, di, aid, a => ({ ...a, sets: [...a.sets, newSet()] }));
  }

  function removeSet(wi, di, aid, sid) {
    updateActivity(wi, di, aid, a => ({
      ...a,
      sets: a.sets.filter(s => s._id !== sid),
    }));
  }

  function updateSet(wi, di, aid, sid, field, value) {
    updateActivity(wi, di, aid, a => ({
      ...a,
      sets: a.sets.map(s => s._id === sid ? { ...s, [field]: value } : s),
    }));
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) { setError('Program name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        tagline: form.tagline.trim() || null,
        description: form.description.trim() || null,
        details: {
          equipment: form.equipment || null,
          level: form.level || null,
          duration_weeks: form.duration_weeks ? parseInt(form.duration_weeks) : null,
          days_per_week: form.days_per_week ? parseInt(form.days_per_week) : null,
          minutes_per_workout: form.minutes_per_workout ? parseInt(form.minutes_per_workout) : null,
          recommended_days: form.recommended_days,
        },
        weeks: serializeWeeks(weeks, units),
      };
      const saved = isEdit
        ? await apiUpdateProgram(id, payload)
        : await apiCreateProgram(payload);
      navigate(`/programs/${saved.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center py-32 text-zinc-600">Loading program…</div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      {/* Page header */}
      <div className="mb-10 flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/programs')}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-[#adaaaa] transition-colors mb-3 uppercase tracking-widest font-bold"
          >
            <Icon name="arrow_back" className="text-sm" />
            Programs
          </button>
          <h1 className="text-4xl font-headline font-bold tracking-tighter text-white italic">
            {isEdit ? 'Edit Program' : 'Create Program'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {error && <p className="text-[#d53d18] text-xs max-w-xs text-right">{error}</p>}
          <button
            onClick={() => navigate('/programs')}
            className="px-5 py-2.5 border border-[#484847]/30 text-zinc-500 hover:text-white text-xs font-bold uppercase tracking-widest rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-br from-[#c1ed00] to-[#cefc22] text-[#4b5e00] font-headline font-black uppercase tracking-widest text-sm rounded-lg pulse-shadow-lime active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Program')}
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* ── Section 1: Program Info ─────────────────────────────────── */}
        <Section title="Program Info" icon="description">
          <div className="grid grid-cols-1 gap-5">
            <Field label="Program Name *">
              <input
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="e.g. Kinetic Hypertrophy Protocol"
                className={inputCls}
              />
            </Field>
            <Field label="Tagline">
              <input
                value={form.tagline}
                onChange={e => setField('tagline', e.target.value)}
                placeholder="e.g. Science-based muscle building for intermediate lifters"
                className={inputCls}
              />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={e => setField('description', e.target.value)}
                placeholder="Describe the program goals, methods, and who it's designed for…"
                rows={3}
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>
        </Section>

        {/* ── Section 2: Details ──────────────────────────────────────── */}
        <Section title="Program Details" icon="tune">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            <Field label="Equipment">
              <select value={form.equipment} onChange={e => setField('equipment', e.target.value)} className={selectCls}>
                <option value="full_gym">Full Gym</option>
                <option value="home_gym">Home Gym</option>
                <option value="bodyweight_only">Bodyweight Only</option>
              </select>
            </Field>
            <Field label="Level">
              <select value={form.level} onChange={e => setField('level', e.target.value)} className={selectCls}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
            <Field label="Duration (weeks)">
              <input
                type="number" min="1" max="52"
                value={form.duration_weeks}
                onChange={e => setField('duration_weeks', e.target.value)}
                placeholder="e.g. 12"
                className={inputCls}
              />
            </Field>
            <Field label="Days per week">
              <input
                type="number" min="1" max="7"
                value={form.days_per_week}
                onChange={e => setField('days_per_week', e.target.value)}
                placeholder="e.g. 4"
                className={inputCls}
              />
            </Field>
            <Field label="Minutes per session">
              <input
                type="number" min="10" max="300"
                value={form.minutes_per_workout}
                onChange={e => setField('minutes_per_workout', e.target.value)}
                placeholder="e.g. 75"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="mt-5">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Recommended Days</p>
            <div className="flex gap-2 flex-wrap">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all ${
                    form.recommended_days.includes(day)
                      ? 'bg-[#D1FF26] text-zinc-950'
                      : 'bg-[#1a1a1a] text-zinc-500 hover:text-white border border-[#262626]'
                  }`}
                >
                  {DAY_SHORT[day]}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ── Section 3: Program Structure ────────────────────────────── */}
        <Section title="Program Structure" icon="view_week">
          <div className="space-y-3">
            {weeks.map((week, wi) => (
              <WeekAccordion
                key={week._id}
                week={week}
                wi={wi}
                isOpen={!!openWeeks[wi]}
                onToggle={() => toggleWeek(wi)}
                onRemove={() => removeWeek(wi)}
                canRemove={weeks.length > 1}
                onAddDay={() => addDay(wi)}
                onRemoveDay={(di) => removeDay(wi, di)}
                onUpdateDay={(di, fn) => updateDay(wi, di, fn)}
                onAddActivity={(di, type, name) => addActivity(wi, di, type, name)}
                onRemoveActivity={(di, aid) => removeActivity(wi, di, aid)}
                onUpdateActivity={(di, aid, fn) => updateActivity(wi, di, aid, fn)}
                onAddSet={(di, aid) => addSet(wi, di, aid)}
                onRemoveSet={(di, aid, sid) => removeSet(wi, di, aid, sid)}
                onUpdateSet={(di, aid, sid, field, value) => updateSet(wi, di, aid, sid, field, value)}
                exercises={exercises}
              />
            ))}
          </div>

          <button
            onClick={addWeek}
            className="mt-4 flex items-center gap-2 text-xs font-bold text-[#D1FF26] uppercase tracking-widest hover:text-[#f4ffc9] transition-colors"
          >
            <Icon name="add" className="text-sm" />
            Add Week
          </button>
        </Section>
      </div>

      <div className="h-24" />
    </div>
  );
}

// ── Layout helpers ─────────────────────────────────────────────────────────

const inputCls = 'w-full bg-[#1a1a1a] border border-[#262626] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#484847] transition-colors';
const selectCls = 'w-full bg-[#1a1a1a] border border-[#262626] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#484847] transition-colors cursor-pointer';

function Section({ title, icon, children }) {
  return (
    <div className="bg-[#131313] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <Icon name={icon} className="text-[#adaaaa] text-base" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-[#adaaaa]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ── Week Accordion ─────────────────────────────────────────────────────────

function WeekAccordion({
  week, isOpen, onToggle, onRemove, canRemove,
  onAddDay, onRemoveDay, onUpdateDay,
  onAddActivity, onRemoveActivity, onUpdateActivity,
  onAddSet, onRemoveSet, onUpdateSet,
  exercises,
}) {
  const [activeDay, setActiveDay] = useState(0);
  const totalActivities = week.days.reduce((s, d) => s + d.activities.length, 0);

  return (
    <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-xl overflow-hidden">
      {/* Week header */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 text-left"
        >
          <span className="text-[10px] font-black bg-[#D1FF26] text-zinc-950 px-2 py-0.5 rounded">W{week.week}</span>
          <span className="font-headline font-bold text-white uppercase tracking-wider">Week {week.week}</span>
          <span className="text-[10px] text-zinc-600">{week.days.length} day{week.days.length !== 1 ? 's' : ''} · {totalActivities} exercise{totalActivities !== 1 ? 's' : ''}</span>
          <Icon name={isOpen ? 'expand_less' : 'expand_more'} className="text-[#adaaaa] text-base ml-1" />
        </button>
        {canRemove && (
          <button onClick={onRemove} className="text-zinc-700 hover:text-[#d53d18] transition-colors p-1">
            <Icon name="delete" className="text-base" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-[#1a1a1a]">
          {/* Day tabs */}
          <div className="flex items-center gap-1 px-5 pt-4 pb-0 flex-wrap">
            {week.days.map((d, di) => (
              <button
                key={d._id}
                onClick={() => setActiveDay(di)}
                className={`group flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all ${
                  activeDay === di
                    ? 'bg-[#D1FF26] text-zinc-950'
                    : 'bg-[#1a1a1a] text-zinc-500 hover:text-white'
                }`}
              >
                {d.isRest ? (
                  <Icon name="hotel" className="text-xs" />
                ) : (
                  <Icon name="fitness_center" className="text-xs opacity-60" />
                )}
                {d.label || `Day ${d.day}`}
                {week.days.length > 1 && (
                  <span
                    onClick={e => { e.stopPropagation(); if (activeDay >= di && activeDay > 0) setActiveDay(activeDay - 1); onRemoveDay(di); }}
                    className={`ml-1 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] leading-none transition-all cursor-pointer ${
                      activeDay === di ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60'
                    }`}
                  >
                    ✕
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => { onAddDay(); setActiveDay(week.days.length); }}
              className="px-3 py-1.5 text-[10px] font-bold text-zinc-600 hover:text-[#D1FF26] uppercase tracking-wider transition-colors flex items-center gap-1"
            >
              <Icon name="add" className="text-xs" />
              Day
            </button>
          </div>

          {/* Active day editor */}
          {week.days[activeDay] && (
            <DayEditor
              day={week.days[activeDay]}
              di={activeDay}
              onUpdate={fn => onUpdateDay(activeDay, fn)}
              onAddActivity={(type, name) => onAddActivity(activeDay, type, name)}
              onRemoveActivity={aid => onRemoveActivity(activeDay, aid)}
              onUpdateActivity={(aid, fn) => onUpdateActivity(activeDay, aid, fn)}
              onAddSet={aid => onAddSet(activeDay, aid)}
              onRemoveSet={(aid, sid) => onRemoveSet(activeDay, aid, sid)}
              onUpdateSet={(aid, sid, field, value) => onUpdateSet(activeDay, aid, sid, field, value)}
              exercises={exercises}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Day Editor ─────────────────────────────────────────────────────────────

function DayEditor({ day, onUpdate, onAddActivity, onRemoveActivity, onUpdateActivity, onAddSet, onRemoveSet, onUpdateSet, exercises }) {
  const [showPicker, setShowPicker] = useState(false);
  const [showCardioPicker, setShowCardioPicker] = useState(false);

  return (
    <div className="p-5 space-y-4">
      {/* Day label + rest toggle */}
      <div className="flex items-center gap-4">
        <input
          value={day.label}
          onChange={e => onUpdate(d => ({ ...d, label: e.target.value }))}
          placeholder={`Day ${day.day} label (e.g. Push Day)`}
          className="flex-1 bg-transparent border-b border-[#262626] focus:border-[#484847] py-1.5 text-sm text-white placeholder:text-zinc-700 focus:outline-none transition-colors"
        />
        <button
          onClick={() => onUpdate(d => ({ ...d, isRest: !d.isRest }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all ${
            day.isRest
              ? 'bg-[#00e3fd]/10 text-[#00e3fd] border border-[#00e3fd]/20'
              : 'bg-[#1a1a1a] text-zinc-500 border border-[#262626] hover:text-white'
          }`}
        >
          <Icon name="hotel" className="text-xs" />
          Rest Day
        </button>
      </div>

      {day.isRest ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Icon name="hotel" className="text-3xl text-zinc-700" />
          <p className="text-zinc-600 text-xs uppercase tracking-widest">Rest & Recovery</p>
        </div>
      ) : (
        <>
          {/* Activities */}
          <div className="space-y-4">
            {day.activities.map(a => (
              <div key={a._id}>
                {a.type === 'lift' ? (
                  <LiftEditor
                    activity={a}
                    onUpdate={fn => onUpdateActivity(a._id, fn)}
                    onRemove={() => onRemoveActivity(a._id)}
                    onAddSet={() => onAddSet(a._id)}
                    onRemoveSet={sid => onRemoveSet(a._id, sid)}
                    onUpdateSet={(sid, field, value) => onUpdateSet(a._id, sid, field, value)}
                    exercises={exercises}
                  />
                ) : (
                  <CardioEditor
                    activity={a}
                    onUpdate={fn => onUpdateActivity(a._id, fn)}
                    onRemove={() => onRemoveActivity(a._id)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Add activity buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-2 text-xs font-bold text-[#f4ffc9]/70 uppercase tracking-widest hover:text-[#f4ffc9] transition-colors"
            >
              <Icon name="fitness_center" className="text-sm" />
              Add Lift
            </button>
            <span className="text-zinc-800">·</span>
            <button
              onClick={() => setShowCardioPicker(true)}
              className="flex items-center gap-2 text-xs font-bold text-[#ffe56b]/70 uppercase tracking-widest hover:text-[#ffe56b] transition-colors"
            >
              <Icon name="sprint" className="text-sm" />
              Add Cardio
            </button>
          </div>

          {showPicker && (
            <ExercisePickerModal
              exercises={exercises.filter(e => e.bodypart !== 'Cardio')}
              onAdd={name => onAddActivity('lift', name)}
              onClose={() => setShowPicker(false)}
            />
          )}

          {showCardioPicker && (
            <ExercisePickerModal
              exercises={exercises.filter(e => e.bodypart === 'Cardio')}
              onAdd={name => onAddActivity('cardio', name)}
              onClose={() => setShowCardioPicker(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Lift Editor ────────────────────────────────────────────────────────────

function LiftEditor({ activity, onUpdate, onRemove, onAddSet, onRemoveSet, onUpdateSet, exercises }) {
  const { unit } = useUnits();
  return (
    <div className="bg-[#131313] rounded-lg p-4 border-l-2 border-[#f4ffc9]/20">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1">
          <ExerciseCombobox
            value={activity.name}
            onChange={name => onUpdate(a => ({ ...a, name }))}
            exercises={exercises ?? []}
            placeholder="Exercise name (e.g. Bench Press)"
            inputClassName="w-full bg-transparent border-b border-[#262626] focus:border-[#484847] py-1 text-sm font-bold text-white placeholder:text-zinc-700 focus:outline-none transition-colors"
          />
        </div>
        <button onClick={onRemove} className="text-zinc-700 hover:text-[#d53d18] transition-colors flex-shrink-0 mt-1">
          <Icon name="close" className="text-base" />
        </button>
      </div>
      <input
        value={activity.note}
        onChange={e => onUpdate(a => ({ ...a, note: e.target.value }))}
        placeholder="Note (optional — e.g. Primary Compound · Chest/Triceps)"
        className="w-full bg-transparent border-b border-[#1a1a1a] focus:border-[#262626] pb-1 mb-4 text-xs text-[#adaaaa] placeholder:text-zinc-800 focus:outline-none transition-colors"
      />

      {/* Sets table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[9px] uppercase tracking-widest text-zinc-700 border-b border-[#1a1a1a]">
              <th className="pb-2 font-bold w-10">Set</th>
              <th className="pb-2 font-bold">Weight ({unit})</th>
              <th className="pb-2 font-bold">Reps</th>
              <th className="pb-2 font-bold">Intensity</th>
              <th className="pb-2 font-bold w-12 text-center">Warm</th>
              <th className="pb-2 w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a1a1a]">
            {activity.sets.map((s, si) => (
              <tr key={s._id}>
                <td className="py-2 text-xs font-bold text-zinc-600">{si + 1}</td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    value={s.targetWeight}
                    onChange={e => onUpdateSet(s._id, 'targetWeight', e.target.value)}
                    placeholder="0"
                    className="w-16 bg-transparent border-b border-[#262626] focus:border-[#484847] py-0.5 text-xs text-white font-bold focus:outline-none transition-colors"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    value={s.targetReps}
                    onChange={e => onUpdateSet(s._id, 'targetReps', e.target.value)}
                    placeholder="0"
                    className="w-12 bg-transparent border-b border-[#262626] focus:border-[#484847] py-0.5 text-xs text-white font-bold focus:outline-none transition-colors"
                  />
                </td>
                <td className="py-2 pr-3">
                  <select
                    value={s.intensity}
                    onChange={e => onUpdateSet(s._id, 'intensity', e.target.value)}
                    className="bg-[#1a1a1a] text-[10px] border border-[#262626] rounded px-1.5 py-1 text-[#adaaaa] focus:outline-none cursor-pointer"
                  >
                    {INTENSITY_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </td>
                <td className="py-2 text-center">
                  <button
                    onClick={() => onUpdateSet(s._id, 'isWarmup', !s.isWarmup)}
                    className={`w-5 h-5 rounded border flex items-center justify-center mx-auto transition-all ${
                      s.isWarmup
                        ? 'border-[#00e3fd] bg-[#00e3fd]/10 text-[#00e3fd]'
                        : 'border-[#262626] text-transparent hover:border-[#484847]'
                    }`}
                  >
                    <Icon name="check" className="text-[10px]" />
                  </button>
                </td>
                <td className="py-2">
                  {activity.sets.length > 1 && (
                    <button onClick={() => onRemoveSet(s._id)} className="text-zinc-800 hover:text-[#d53d18] transition-colors">
                      <Icon name="remove" className="text-xs" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={onAddSet}
        className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-[#00d4ec]/60 uppercase tracking-widest hover:text-[#00e3fd] transition-colors"
      >
        <Icon name="add" className="text-xs" />
        Add Set
      </button>
    </div>
  );
}

// ── Cardio Editor ──────────────────────────────────────────────────────────

function CardioEditor({ activity, onUpdate, onRemove }) {
  return (
    <div className="bg-[#131313] rounded-lg p-4 border-l-2 border-[#ffe56b]/20">
      <div className="flex items-center gap-3 mb-4">
        <Icon name="sprint" className="text-[#ffe56b] text-sm flex-shrink-0" />
        <input
          value={activity.name}
          onChange={e => onUpdate(a => ({ ...a, name: e.target.value }))}
          placeholder="Cardio name (e.g. Incline Walk)"
          className="flex-1 bg-transparent border-b border-[#262626] focus:border-[#484847] py-1 text-sm font-bold text-white placeholder:text-zinc-700 focus:outline-none transition-colors"
        />
        <button onClick={onRemove} className="text-zinc-700 hover:text-[#d53d18] transition-colors">
          <Icon name="close" className="text-base" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Duration (min)">
          <input
            type="text"
            value={activity.duration}
            onChange={e => onUpdate(a => ({ ...a, duration: e.target.value }))}
            placeholder="20"
            className={inputCls}
          />
        </Field>
        <Field label="Intensity">
          <select
            value={activity.intensity}
            onChange={e => onUpdate(a => ({ ...a, intensity: e.target.value }))}
            className={selectCls}
          >
            {['RPE 4', 'RPE 5', 'RPE 6', 'RPE 7', 'RPE 8'].map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}
