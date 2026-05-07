import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { muscleName } from '../../lib/muscles';

const BODYPART_COLOR = {
  'Back':       'text-[#00e3fd]  bg-[#00e3fd]/10',
  'Biceps':     'text-[#c084fc]  bg-[#c084fc]/10',
  'Cardio':     'text-[#22d3ee]  bg-[#22d3ee]/10',
  'Chest':      'text-[#D1FF26]  bg-[#D1FF26]/10',
  'Core':       'text-[#fb923c]  bg-[#fb923c]/10',
  'Forearms':   'text-[#adaaaa]  bg-[#adaaaa]/10',
  'Legs':       'text-[#ffe56b]  bg-[#ffe56b]/10',
  'Shoulders':  'text-[#34d399]  bg-[#34d399]/10',
  'Triceps':    'text-[#f472b6]  bg-[#f472b6]/10',
  'Whole Body': 'text-white      bg-white/10',
};

export default function ExercisePickerModal({ exercises, onAdd, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = query.trim()
    ? exercises.filter(e =>
        e.name.toLowerCase().includes(query.toLowerCase()) ||
        (e.aliases ?? []).some(a => a.toLowerCase().includes(query.toLowerCase()))
      )
    : exercises;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#111] border border-[#1e1e1e] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg flex flex-col"
        style={{ maxHeight: '82vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e1e] flex-shrink-0">
          <Icon name="search" className="text-zinc-600 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search exercises…"
            className="flex-1 bg-transparent text-white placeholder:text-zinc-600 focus:outline-none text-sm"
          />
          <button onClick={onClose} className="text-zinc-600 hover:text-white transition-colors flex-shrink-0">
            <Icon name="close" className="text-base" />
          </button>
        </div>

        {/* Count */}
        <div className="px-4 py-2 border-b border-[#1e1e1e] flex-shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            {filtered.length} exercise{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-zinc-600 text-xs uppercase tracking-widest font-bold">
              No exercises found
            </div>
          ) : (
            <ul>
              {filtered.map(ex => (
                <li key={ex.name}>
                  <button
                    type="button"
                    onClick={() => { onAdd(ex.name); onClose(); }}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[#1a1a1a] transition-colors border-b border-[#1e1e1e]/40"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{ex.name}</p>
                      {((ex.primary_muscles?.length ?? 0) + (ex.secondary_muscles?.length ?? 0)) > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(ex.primary_muscles ?? []).slice(0, 3).map(m => (
                            <span key={m} className="text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded bg-[#1e1e1e] text-zinc-500">
                              {muscleName(m)}
                            </span>
                          ))}
                          {(ex.secondary_muscles ?? []).slice(0, 2).map(m => (
                            <span key={m} className="text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded bg-[#181818] text-zinc-700">
                              {muscleName(m)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className={`flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5 ${BODYPART_COLOR[ex.bodypart] ?? 'text-zinc-500 bg-[#1e1e1e]'}`}>
                      {ex.bodypart}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
