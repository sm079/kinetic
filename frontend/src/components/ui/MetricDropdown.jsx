import { useState, useRef, useEffect } from 'react';
import Icon from './Icon';

const BUILTIN = [
  { key: 'volume',   label: 'Total Volume',   color: '#D1FF26' },
  { key: 'cardio',   label: 'Cardio Duration', color: '#00e3fd' },
  { key: 'sessions', label: 'Sessions',        color: '#ffe56b' },
  { key: 'recovery', label: 'Recovery Score',  color: '#34d399' },
];

function currentLabel(value) {
  const builtin = BUILTIN.find(b => b.key === value);
  if (builtin) return builtin.label;
  if (value?.startsWith('ex:')) return value.slice(3);
  return 'Metric';
}

function currentColor(value) {
  const builtin = BUILTIN.find(b => b.key === value);
  return builtin?.color ?? '#71717a';
}

export default function MetricDropdown({ value, onChange, exercises = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const q = query.toLowerCase();
  const filteredBuiltin = BUILTIN.filter(b => !q || b.label.toLowerCase().includes(q));
  const filteredEx      = exercises.filter(n => !q || n.toLowerCase().includes(q));

  function select(key) {
    onChange(key);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#1e1e1e] bg-[#0e0e0e] hover:border-[#2a2a2a] transition-colors"
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: currentColor(value) }}
        />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 max-w-[120px] truncate">
          {currentLabel(value)}
        </span>
        <Icon name="expand_more" className="text-[11px] text-zinc-600" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-[#111] border border-[#1e1e1e] rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="px-3 py-2 border-b border-[#1e1e1e] flex-shrink-0">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full bg-transparent text-xs text-white placeholder:text-zinc-700 focus:outline-none"
            />
          </div>

          <div className="overflow-y-auto max-h-72">
            {/* Built-in metrics */}
            {filteredBuiltin.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-700">Summary</p>
                {filteredBuiltin.map(b => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => select(b.key)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 transition-colors ${
                      value === b.key ? 'bg-[#1a1a1a]' : 'hover:bg-[#181818]'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: b.color }} />
                    <span className="text-xs text-zinc-300">{b.label}</span>
                    {value === b.key && <Icon name="check" className="text-[10px] text-zinc-500 ml-auto" />}
                  </button>
                ))}
              </>
            )}

            {/* Exercise list */}
            {filteredEx.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-700 border-t border-[#1e1e1e] mt-1">
                  Exercises
                </p>
                {filteredEx.map(name => {
                  const key = `ex:${name}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => select(key)}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 transition-colors ${
                        value === key ? 'bg-[#1a1a1a]' : 'hover:bg-[#181818]'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 flex-shrink-0" />
                      <span className="text-xs text-zinc-300 truncate">{name}</span>
                      {value === key && <Icon name="check" className="text-[10px] text-zinc-500 ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
              </>
            )}

            {filteredBuiltin.length === 0 && filteredEx.length === 0 && (
              <p className="px-3 py-4 text-xs text-zinc-700 text-center">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
