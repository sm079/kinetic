import { useState, useEffect, useCallback } from 'react';

// ── Event bus ──────────────────────────────────────────────────────────────
const TOAST_EVENT = 'kinetic:toast';

export function showToast(message, type = 'error') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }));
}

// ── Provider ───────────────────────────────────────────────────────────────
export default function ToastProvider() {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(ts => ts.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    function handler(e) {
      const id = Date.now() + Math.random();
      setToasts(ts => [...ts.slice(-4), { id, ...e.detail }]);
      setTimeout(() => dismiss(id), 4000);
    }
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, [dismiss]);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border pointer-events-auto max-w-sm animate-in fade-in slide-in-from-bottom-2 ${
            t.type === 'error'
              ? 'bg-[#1a0a08] border-[#d53d18]/30 text-[#ff7351]'
              : 'bg-[#0a1a08] border-[#D1FF26]/30 text-[#D1FF26]'
          }`}
        >
          <span className="material-symbols-rounded text-base flex-shrink-0">
            {t.type === 'error' ? 'error' : 'check_circle'}
          </span>
          <p className="text-xs font-medium">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            className="ml-2 opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
          >
            <span className="material-symbols-rounded text-sm">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}
