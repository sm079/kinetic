import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../components/ui/Icon';
import { apiUpdateMe, apiGetTemplates, apiImportTemplate, apiFollowProgram } from '../../lib/api';

// ── Option data ────────────────────────────────────────────────────────────

const GOALS = [
  { id: 'muscle',      icon: 'fitness_center',       label: 'Build Muscle',         desc: 'Hypertrophy-focused training' },
  { id: 'strength',    icon: 'hardware',              label: 'Build Strength',        desc: 'Get stronger on the big lifts' },
  { id: 'fat_loss',    icon: 'local_fire_department', label: 'Lose Fat',              desc: 'Burn calories, preserve muscle' },
  { id: 'endurance',   icon: 'sprint',                label: 'Endurance',             desc: 'Cardio capacity and stamina' },
  { id: 'general',     icon: 'self_improvement',      label: 'General Fitness',       desc: 'Stay healthy and active' },
  { id: 'performance', icon: 'sports',                label: 'Athletic Performance',  desc: 'Sport-specific conditioning' },
];

const LEVELS = [
  { id: 'beginner',     label: 'Beginner',     desc: 'Under 6 months lifting',          icon: 'keyboard_arrow_up' },
  { id: 'novice',       label: 'Novice',        desc: '6 months – 1.5 years',            icon: 'trending_up' },
  { id: 'intermediate', label: 'Intermediate',  desc: '1.5 – 3 years, solid technique',  icon: 'arrow_upward' },
  { id: 'advanced',     label: 'Advanced',      desc: '3 – 5 years, near full potential', icon: 'bolt' },
  { id: 'elite',        label: 'Elite',         desc: 'Competitive / near genetic max',  icon: 'star' },
];

const EQUIPMENT = [
  { id: 'full_gym',        icon: 'fitness_center',    label: 'Full Gym',   desc: 'Barbells, racks, cables, machines' },
  { id: 'home_gym',        icon: 'home',              label: 'Home Gym',   desc: 'Dumbbells and basic kit' },
  { id: 'bodyweight_only', icon: 'accessibility_new', label: 'Bodyweight', desc: 'No equipment required' },
];

const FREQ_OPTIONS = [3, 4, 5, 6];
const WEEKDAYS     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_KEY = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const LEVEL_MATCH = {
  beginner:     'Beginner',
  novice:       'Beginner',      // closest template level
  intermediate: 'Intermediate',
  advanced:     'Advanced',
  elite:        'Advanced',      // closest template level
};
const EQUIP_MATCH = { full_gym: 'Full Gym', home_gym: 'Home Gym', bodyweight_only: 'Bodyweight' };

// ── Step definitions ───────────────────────────────────────────────────────
const TOTAL_STEPS = 5;

// ── Small reusable card ────────────────────────────────────────────────────
function OptionCard({ selected, onClick, icon, iconFill, label, desc, accent = '#D1FF26', wide = false }) {
  return (
    <button
      onClick={onClick}
      className={`group relative text-left rounded-xl border p-5 transition-all duration-200 active:scale-[0.98] ${
        wide ? 'flex items-start gap-4' : 'flex flex-col gap-3'
      } ${
        selected
          ? 'border-[var(--accent)]/50 bg-[var(--accent)]/8 shadow-[0_0_20px_rgba(0,0,0,0.4)]'
          : 'border-[#262626] bg-[#131313] hover:border-[#484847] hover:bg-[#1a1a1a]'
      }`}
      style={{ '--accent': accent }}
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          selected ? 'bg-[var(--accent)]/20' : 'bg-[#1a1a1a] group-hover:bg-[#262626]'
        }`}
        style={{ '--accent': accent }}
      >
        <Icon
          name={icon}
          fill={iconFill || selected}
          className="text-xl transition-colors"
          style={{ color: selected ? accent : '#adaaaa' }}
        />
      </div>
      <div className="min-w-0">
        <p className={`font-headline font-bold text-sm tracking-wide transition-colors ${selected ? 'text-white' : 'text-[#adaaaa] group-hover:text-white'}`}>
          {label}
        </p>
        {desc && (
          <p className={`text-[11px] mt-0.5 transition-colors ${selected ? 'text-zinc-400' : 'text-zinc-600 group-hover:text-zinc-500'}`}>
            {desc}
          </p>
        )}
      </div>
      {selected && (
        <div
          className="absolute top-3 right-3 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: accent }}
        >
          <Icon name="check" className="text-[10px] text-zinc-950 font-black" />
        </div>
      )}
    </button>
  );
}

// ── Step components ────────────────────────────────────────────────────────

function StepWelcome({ name }) {
  return (
    <div className="flex flex-col items-center text-center gap-8 py-4">
      {/* Animated logo mark */}
      <div className="relative">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#D1FF26]/20 to-[#00e3fd]/10 border border-[#D1FF26]/20 flex items-center justify-center">
          <span className="text-4xl font-headline font-black italic text-[#D1FF26]">K</span>
        </div>
        <div className="absolute -inset-3 bg-[#D1FF26]/5 rounded-3xl blur-xl -z-10" />
      </div>

      <div className="space-y-4 max-w-sm">
        <h1 className="text-4xl font-headline font-black tracking-tighter text-white">
          {name ? `Welcome, ${name.split(' ')[0]}.` : 'Welcome.'}
        </h1>
        <p className="text-[#adaaaa] text-base leading-relaxed">
          Let's spend 60 seconds personalising Kinetic so your dashboard, programs,
          and AI coach are built around <span className="text-white font-semibold">you</span>.
        </p>
      </div>

      {/* Preview chips */}
      <div className="flex flex-wrap justify-center gap-2 max-w-xs">
        {['Personalised Programs', 'AI Coach', 'Progress Tracking', 'Nutrition Logs'].map(f => (
          <span key={f} className="text-[10px] font-bold uppercase tracking-widest bg-[#1a1a1a] border border-[#262626] text-zinc-500 px-3 py-1.5 rounded-full">
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepGoal({ value, onChange }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-headline font-black tracking-tighter text-white">What's your main goal?</h2>
        <p className="text-[#adaaaa] text-sm mt-2">We'll tailor your program suggestions around this.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {GOALS.map(g => (
          <OptionCard
            key={g.id}
            selected={value === g.id}
            onClick={() => onChange(g.id)}
            icon={g.icon}
            label={g.label}
            desc={g.desc}
          />
        ))}
      </div>
    </div>
  );
}

function StepExperience({ level, equipment, onLevel, onEquipment }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-headline font-black tracking-tighter text-white">Experience & Setup</h2>
        <p className="text-[#adaaaa] text-sm mt-2">Helps us match program difficulty and exercises to what you have.</p>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">Training Experience</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {LEVELS.map(l => (
            <OptionCard
              key={l.id}
              selected={level === l.id}
              onClick={() => onLevel(l.id)}
              icon={l.icon}
              label={l.label}
              desc={l.desc}
              wide
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">Available Equipment</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {EQUIPMENT.map(e => (
            <OptionCard
              key={e.id}
              selected={equipment === e.id}
              onClick={() => onEquipment(e.id)}
              icon={e.icon}
              label={e.label}
              desc={e.desc}
              accent="#00e3fd"
              wide
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const UNIT_OPTIONS = [
  { id: 'metric',   label: 'Metric',   hint: 'kg · km · cm',     icon: 'straighten' },
  { id: 'imperial', label: 'Imperial', hint: 'lbs · miles · in',  icon: 'straighten' },
];

function StepSchedule({ freq, days, onFreq, onDays, units, onUnits }) {
  function toggleDay(key) {
    onDays(days.includes(key) ? days.filter(d => d !== key) : [...days, key]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-headline font-black tracking-tighter text-white">Training Schedule</h2>
        <p className="text-[#adaaaa] text-sm mt-2">How many days can you commit to each week?</p>
      </div>

      {/* Frequency selector */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">Days Per Week</p>
        <div className="flex gap-3">
          {FREQ_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => onFreq(n)}
              className={`w-14 h-14 rounded-xl font-headline font-black text-xl transition-all ${
                freq === n
                  ? 'bg-[#D1FF26] text-zinc-950 shadow-[0_0_20px_rgba(209,255,38,0.3)]'
                  : 'bg-[#131313] border border-[#262626] text-zinc-500 hover:border-[#484847] hover:text-white'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => onFreq(7)}
            className={`px-4 h-14 rounded-xl font-headline font-black text-sm transition-all ${
              freq === 7
                ? 'bg-[#D1FF26] text-zinc-950'
                : 'bg-[#131313] border border-[#262626] text-zinc-500 hover:border-[#484847] hover:text-white'
            }`}
          >
            Daily
          </button>
        </div>
      </div>

      {/* Day picker */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">
          Preferred Days <span className="text-zinc-700 normal-case tracking-normal font-normal">(optional)</span>
        </p>
        <div className="flex gap-2 flex-wrap">
          {WEEKDAYS.map((d, i) => {
            const key = WEEKDAYS_KEY[i];
            const sel = days.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggleDay(key)}
                className={`w-12 h-12 rounded-lg font-bold text-xs transition-all ${
                  sel
                    ? 'bg-[#D1FF26] text-zinc-950'
                    : 'bg-[#131313] border border-[#262626] text-zinc-500 hover:border-[#484847] hover:text-white'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Units preference */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">Preferred Units</p>
        <div className="grid grid-cols-2 gap-3">
          {UNIT_OPTIONS.map(u => (
            <button
              key={u.id}
              onClick={() => onUnits(u.id)}
              className={`text-left rounded-xl border p-4 transition-all ${
                units === u.id
                  ? 'border-[#ffe56b]/50 bg-[#ffe56b]/8'
                  : 'border-[#262626] bg-[#131313] hover:border-[#484847]'
              }`}
            >
              <p className={`font-headline font-bold text-sm ${units === u.id ? 'text-white' : 'text-[#adaaaa]'}`}>{u.label}</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">{u.hint}</p>
              {units === u.id && (
                <div className="mt-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#ffe56b]">
                  <Icon name="check" className="text-[10px] text-zinc-950" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepProgram({ level, equipment, selectedTemplate, onSelect }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Sort: matching level+equip first, then level-only, then rest
  const sorted = [...templates].sort((a, b) => {
    const score = t => {
      const lvl  = LEVEL_MATCH[level];
      const equip = EQUIP_MATCH[equipment];
      const matchLvl  = t.details?.level === lvl;
      const matchEq   = t.details?.equipment === equip;
      if (matchLvl && matchEq) return 2;
      if (matchLvl || matchEq) return 1;
      return 0;
    };
    return score(b) - score(a);
  });

  const LEVEL_BADGE = { Beginner: '#D1FF26', Novice: '#a3e635', Intermediate: '#00e3fd', Advanced: '#ff7351', Elite: '#f472b6' };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-headline font-black tracking-tighter text-white">Start with a program?</h2>
        <p className="text-[#adaaaa] text-sm mt-2">
          Pick one to follow — we'll track your progress through weeks and days automatically.
          You can always change this later.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-[#131313] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 scrollbar-none">
          {sorted.map(t => {
            const sel = selectedTemplate === t.id;
            const lvlLabel = t.details?.level;
            const badgeColor = LEVEL_BADGE[lvlLabel] ?? '#adaaaa';
            const isMatch = t.details?.level === LEVEL_MATCH[level] && t.details?.equipment === EQUIP_MATCH[equipment];
            return (
              <button
                key={t.id}
                onClick={() => onSelect(sel ? null : t.id)}
                className={`w-full text-left rounded-xl border p-4 transition-all flex items-center gap-4 ${
                  sel
                    ? 'border-[#D1FF26]/40 bg-[#D1FF26]/8'
                    : 'border-[#262626] bg-[#131313] hover:border-[#484847]'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${sel ? 'bg-[#D1FF26]/20' : 'bg-[#1a1a1a]'}`}>
                  <Icon name="view_week" className="text-lg" style={{ color: sel ? '#D1FF26' : '#484847' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-headline font-bold text-sm text-white">{t.name}</p>
                    {isMatch && (
                      <span className="text-[9px] font-bold uppercase tracking-widest bg-[#D1FF26]/15 text-[#D1FF26] px-1.5 py-0.5 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {lvlLabel && (
                      <span className="text-[10px] font-bold" style={{ color: badgeColor }}>{lvlLabel}</span>
                    )}
                    {t.details?.days_per_week && (
                      <span className="text-[10px] text-zinc-600">{t.details.days_per_week}×/wk</span>
                    )}
                    {t.week_count > 0 && (
                      <span className="text-[10px] text-zinc-600">{t.week_count}w</span>
                    )}
                    {t.tagline && (
                      <span className="text-[10px] text-zinc-600 truncate">{t.tagline}</span>
                    )}
                  </div>
                </div>
                {sel && (
                  <div className="w-5 h-5 rounded-full bg-[#D1FF26] flex items-center justify-center flex-shrink-0">
                    <Icon name="check" className="text-[10px] text-zinc-950" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={() => onSelect(null)}
        className={`text-xs font-bold uppercase tracking-widest transition-colors ${
          selectedTemplate === null ? 'text-zinc-400' : 'text-zinc-600 hover:text-zinc-400'
        }`}
      >
        {selectedTemplate === null ? '✓ I\'ll start without a program' : 'Skip for now'}
      </button>
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressDots({ step, total }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < step ? 'bg-[#D1FF26] w-6 h-1.5' :
            i === step ? 'bg-[#D1FF26] w-4 h-1.5' :
            'bg-[#262626] w-4 h-1.5'
          }`}
        />
      ))}
      <span className="text-[10px] text-zinc-600 font-bold ml-2 uppercase tracking-widest">
        {step + 1} / {total}
      </span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1=forward, -1=back
  const [saving, setSaving] = useState(false);

  // Collected data
  const [goal, setGoal]           = useState('');
  const [level, setLevel]         = useState('');
  const [equipment, setEquipment] = useState('');
  const [freq, setFreq]           = useState(4);
  const [days, setDays]           = useState([]);
  const [units, setUnits]         = useState('metric');
  const [template, setTemplate]   = useState(null); // null = skip

  const contentRef = useRef(null);

  // Animate step changes
  function goTo(next) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }

  function canAdvance() {
    if (step === 1) return !!goal;
    if (step === 2) return !!level && !!equipment;
    if (step === 3) return !!freq;
    return true;
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await apiUpdateMe({
        onboarding_completed: true,
        fitness_goal: goal || null,
        fitness_level: level || null,
        preferred_equipment: equipment || null,
        days_per_week: freq || null,
        preferred_days: days,
        preferred_units: units,
      });

      if (template) {
        try {
          const imported = await apiImportTemplate(template);
          // Auto-follow the imported program so it shows up in TrackWorkoutPage
          if (imported?.id) {
            await apiFollowProgram(imported.id);
          }
        } catch {}
      }

      await refreshUser();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  }

  const stepContent = {
    0: <StepWelcome name={user?.display_name} />,
    1: <StepGoal value={goal} onChange={setGoal} />,
    2: <StepExperience level={level} equipment={equipment} onLevel={setLevel} onEquipment={setEquipment} />,
    3: <StepSchedule freq={freq} days={days} onFreq={setFreq} onDays={setDays} units={units} onUnits={setUnits} />,
    4: <StepProgram level={level} equipment={equipment} selectedTemplate={template} onSelect={setTemplate} />,
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white font-body flex flex-col overflow-hidden">
      {/* Ambient glows */}
      <div className="fixed top-[-15%] right-[-10%] w-[600px] h-[600px] bg-[#D1FF26]/4 rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#00e3fd]/4 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Header */}
      <header className="flex-shrink-0 px-6 py-5 flex items-center justify-between border-b border-[#1a1a1a]">
        <span className="text-xl font-headline font-black italic text-[#D1FF26] tracking-tighter">KINETIC</span>
        <ProgressDots step={step} total={TOTAL_STEPS} />
        {step > 0 ? (
          <button
            onClick={() => goTo(step - 1)}
            className="text-xs font-bold text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors"
          >
            Back
          </button>
        ) : (
          <div className="w-12" />
        )}
      </header>

      {/* Content area */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto px-6 py-10 flex items-start justify-center"
      >
        <div
          key={step}
          className="w-full max-w-2xl animate-in"
          style={{
            animation: `slideIn${direction > 0 ? 'Right' : 'Left'} 0.25s ease forwards`,
          }}
        >
          {stepContent[step]}
        </div>
      </div>

      {/* Footer CTA */}
      <footer className="flex-shrink-0 px-6 py-6 border-t border-[#1a1a1a] bg-[#0e0e0e]/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto">
          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={() => goTo(step + 1)}
              disabled={!canAdvance()}
              className="w-full py-4 rounded-xl bg-gradient-to-br from-[#c1ed00] to-[#cefc22] text-[#4b5e00] font-headline font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 active:scale-[0.99] transition-all disabled:opacity-30 disabled:cursor-not-allowed pulse-shadow-lime"
            >
              {step === 0 ? "Let's Go" : 'Continue'}
              <Icon name="arrow_forward" className="text-sm" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full py-4 rounded-xl bg-gradient-to-br from-[#c1ed00] to-[#cefc22] text-[#4b5e00] font-headline font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 active:scale-[0.99] transition-all disabled:opacity-60 pulse-shadow-lime"
            >
              {saving ? (
                <>
                  <Icon name="autorenew" className="text-sm animate-spin" />
                  Setting up your account…
                </>
              ) : (
                <>
                  <Icon name="rocket_launch" fill className="text-sm" />
                  {template ? 'Start Training' : 'Go to Dashboard'}
                </>
              )}
            </button>
          )}

          {/* Skip entire onboarding */}
          {step > 0 && step < TOTAL_STEPS - 1 && (
            <button
              onClick={() => goTo(TOTAL_STEPS - 1)}
              className="w-full mt-3 text-xs text-zinc-700 hover:text-zinc-500 font-bold uppercase tracking-widest transition-colors"
            >
              Skip setup
            </button>
          )}
        </div>
      </footer>

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
