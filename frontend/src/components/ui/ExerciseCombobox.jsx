import { useState, useRef, useEffect } from 'react';
import { muscleName } from '../../lib/muscles';

const BODYPART_COLOR = {
  'Back':       'text-[#00e3fd]  bg-[#00e3fd]/10',
  'Biceps':     'text-[#c084fc]  bg-[#c084fc]/10',
  'Chest':      'text-[#D1FF26]  bg-[#D1FF26]/10',
  'Core':       'text-[#fb923c]  bg-[#fb923c]/10',
  'Forearms':   'text-[#adaaaa]  bg-[#adaaaa]/10',
  'Legs':       'text-[#ffe56b]  bg-[#ffe56b]/10',
  'Shoulders':  'text-[#34d399]  bg-[#34d399]/10',
  'Triceps':    'text-[#f472b6]  bg-[#f472b6]/10',
  'Whole Body': 'text-white      bg-white/10',
};

const CATEGORY_ICON = {
  'Barbell':    '🏋',
  'Bodyweight': '🤸',
  'Cable':      '〰',
  'Dumbbell':   '💪',
  'Machine':    '⚙',
};

/**
 * Exercise name autocomplete with bodypart + muscle hints in dropdown.
 *
 * @param {string}   value       - current exercise name
 * @param {Function} onChange    - called with the chosen / typed name string
 * @param {Array}    exercises   - [{ name, bodypart, category, aliases, primary_muscles, secondary_muscles }]
 * @param {string}   [placeholder]
 * @param {string}   [inputClassName]
 */
export default function ExerciseCombobox({
  value,
  onChange,
  exercises = [],
  placeholder = 'Exercise name…',
  inputClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef(null);

  const suggestions = value.trim()
    ? exercises
        .filter(e =>
          e.name.toLowerCase().includes(value.toLowerCase()) ||
          (e.aliases ?? []).some(a => a.toLowerCase().includes(value.toLowerCase()))
        )
        .slice(0, 10)
    : exercises.slice(0, 10);

  useEffect(() => { setHighlighted(0); }, [value]);

  function select(name) {
    onChange(name);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { setOpen(true); return; }
    }
    if (e.key === 'ArrowDown')      { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open && suggestions[highlighted]) { e.preventDefault(); select(suggestions[highlighted].name); }
    else if (e.key === 'Escape')    { setOpen(false); }
  }

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#161616] border border-[#1e1e1e] rounded-xl overflow-hidden shadow-2xl max-h-72 overflow-y-auto">
          {suggestions.map((ex, i) => {
            const primaryLabels = (ex.primary_muscles ?? []).slice(0, 2).map(muscleName);
            return (
              <li key={ex.name}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); select(ex.name); }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    i === highlighted ? 'bg-[#1e1e1e]' : 'hover:bg-[#1a1a1a]'
                  }`}
                >
                  {/* Category icon */}
                  <span className="text-base flex-shrink-0 w-5 text-center select-none" title={ex.category}>
                    {CATEGORY_ICON[ex.category] ?? '·'}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{ex.name}</p>
                    {primaryLabels.length > 0 && (
                      <p className="text-[10px] text-zinc-600 truncate">{primaryLabels.join(' · ')}</p>
                    )}
                  </div>

                  <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${BODYPART_COLOR[ex.bodypart] ?? 'text-zinc-500 bg-zinc-800'}`}>
                    {ex.bodypart}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
