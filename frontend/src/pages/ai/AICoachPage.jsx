import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { useLocation } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { getTokens } from '../../lib/api';
import {
  apiCreateConversation,
  apiGetConversation,
  apiListConversations,
  apiDeleteConversation,
  apiGetWorkouts,
  apiUpdateConversation,
  apiSetActiveBranch,
} from '../../lib/api';

const BASE_URL = 'http://localhost:8000';

// ── uid ────────────────────────────────────────────────────────────────────
let _uid = 0;
function uid() { return ++_uid; }

// ── Time formatting ────────────────────────────────────────────────────────
function fmtTime(date) {
  const diff = Date.now() - date.getTime();
  if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function fmtFull(date) {
  return date.toLocaleString([], { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Walk the byParent map to find the deepest descendant ──────────────────
function findTip(byParent, startId) {
  let current = startId;
  const seen = new Set();
  while (true) {
    if (seen.has(current)) break;
    seen.add(current);
    const children = (byParent[current] || []).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    if (!children.length) return current;
    current = children[0].id;
  }
  return current;
}

// ── Build display nodes from the server's message tree ─────────────────────
function buildDisplayNodes(allNodes, activeTipId, fallbackMessages) {
  const byId = {};
  const byParent = {};
  for (const n of allNodes || []) {
    byId[n.id] = n;
    const key = n.parent_id ?? '__root__';
    (byParent[key] = byParent[key] || []).push(n);
  }

  if (!Object.keys(byId).length) {
    if (!fallbackMessages?.length) return [];
    const loaded = [];
    for (let i = 0; i < fallbackMessages.length; i += 2) {
      const u = fallbackMessages[i], a = fallbackMessages[i + 1];
      if (u?.role !== 'user') continue;
      loaded.push({
        id: uid(),
        branches: [{
          userText: u.content,
          llmText: a?.content ?? '',
          ts: new Date(u.timestamp),
          userMsgId: u.id ?? null,
          aiMsgId: a?.id ?? null,
          parentMsgId: u.parent_id ?? null,
          tipId: a?.id ?? null,
        }],
        cur: 0,
      });
    }
    return loaded;
  }

  if (!activeTipId) return [];

  const thread = [];
  let cur = activeTipId;
  const visited = new Set();
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const msg = byId[cur];
    if (!msg) break;
    thread.unshift(msg);
    cur = msg.parent_id ?? null;
  }

  const displayNodes = [];
  for (let i = 0; i < thread.length; i += 2) {
    const userMsg = thread[i];
    if (!userMsg || userMsg.role !== 'user') continue;

    const pKey = userMsg.parent_id ?? '__root__';
    const siblings = (byParent[pKey] || [])
      .filter(n => n.role === 'user')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (!siblings.length) continue;

    const branches = siblings.map(sib => {
      const sibAiNodes = (byParent[sib.id] || []).filter(n => n.role === 'assistant');
      const sibAiMsg = sibAiNodes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      const tipId = sibAiMsg ? findTip(byParent, sibAiMsg.id) : null;
      return {
        userText: sib.content,
        llmText: sibAiMsg?.content ?? '',
        ts: new Date(sib.timestamp),
        userMsgId: sib.id,
        aiMsgId: sibAiMsg?.id ?? null,
        parentMsgId: sib.parent_id ?? null,
        tipId,
      };
    });

    const curIdx = siblings.findIndex(s => s.id === userMsg.id);
    displayNodes.push({
      id: uid(),
      branches,
      cur: curIdx >= 0 ? curIdx : 0,
    });
  }

  return displayNodes;
}

// ── Graph block parser ─────────────────────────────────────────────────────
function parseBlocks(text) {
  const parts = [];
  const re = /<graph>([\s\S]*?)<\/graph>/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: 'text', content: text.slice(last, m.index) });
    parts.push({ type: 'graph', content: m[1].trim() });
    last = m.index + m[0].length;
  }
  const tail = text.slice(last);
  const openIdx = tail.indexOf('<graph>');
  if (openIdx !== -1) {
    if (openIdx > 0) parts.push({ type: 'text', content: tail.slice(0, openIdx) });
    parts.push({ type: 'graph-pending' });
  } else if (tail) {
    parts.push({ type: 'text', content: tail });
  }
  return parts;
}

// ── Markdown renderer ──────────────────────────────────────────────────────
//
// Supports: headings (# ## ###), bold (**), italic (*), inline code (`),
// fenced code blocks (```), unordered lists (- / *), ordered lists (1.),
// blockquotes (>), horizontal rules (---), and bare URLs.
//
function MarkdownRenderer({ content }) {
  // Render inline formatting within a single line of text
  function renderInline(text, key) {
    // Pattern order matters: code first, then bold+italic, then bold, then italic, then links
    const parts = [];
    const re = /(`[^`]+`|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s]+))/g;
    let last = 0;
    let m;
    let idx = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(<span key={idx++}>{text.slice(last, m.index)}</span>);
      const match = m[0];
      if (match.startsWith('`')) {
        parts.push(
          <code key={idx++} className="px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-[#D1FF26] text-[0.8em] font-mono">
            {match.slice(1, -1)}
          </code>
        );
      } else if (match.startsWith('***')) {
        parts.push(<strong key={idx++} className="font-bold italic text-white">{m[2]}</strong>);
      } else if (match.startsWith('**') || match.startsWith('__')) {
        parts.push(<strong key={idx++} className="font-semibold text-white">{m[3] ?? m[4]}</strong>);
      } else if (match.startsWith('*') || match.startsWith('_')) {
        parts.push(<em key={idx++} className="italic text-zinc-300">{m[5] ?? m[6]}</em>);
      } else if (m[7]) {
        // [text](url)
        parts.push(
          <a key={idx++} href={m[8]} target="_blank" rel="noopener noreferrer"
            className="text-[#D1FF26] underline underline-offset-2 hover:text-[#f4ffc9] transition-colors">
            {m[7]}
          </a>
        );
      } else if (m[9]) {
        // bare URL
        parts.push(
          <a key={idx++} href={m[9]} target="_blank" rel="noopener noreferrer"
            className="text-[#D1FF26] underline underline-offset-2 hover:text-[#f4ffc9] transition-colors">
            {m[9]}
          </a>
        );
      } else {
        parts.push(<span key={idx++}>{match}</span>);
      }
      last = m.index + match.length;
    }
    if (last < text.length) parts.push(<span key={idx++}>{text.slice(last)}</span>);
    return <span key={key}>{parts}</span>;
  }

  // Split the markdown into block-level tokens
  function tokenize(raw) {
    const tokens = [];
    // Normalise line endings
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      if (/^```/.test(line)) {
        const lang = line.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // consume closing ```
        tokens.push({ type: 'code', lang, content: codeLines.join('\n') });
        continue;
      }

      // Horizontal rule
      if (/^[-*_]{3,}$/.test(line.trim())) {
        tokens.push({ type: 'hr' });
        i++;
        continue;
      }

      // Heading
      const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
      if (headingMatch) {
        tokens.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2] });
        i++;
        continue;
      }

      // Blockquote
      if (/^>\s?/.test(line)) {
        const quoteLines = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        tokens.push({ type: 'blockquote', content: quoteLines.join('\n') });
        continue;
      }

      // Unordered list
      if (/^[-*+]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
          items.push(lines[i].replace(/^[-*+]\s/, ''));
          i++;
        }
        tokens.push({ type: 'ul', items });
        continue;
      }

      // Ordered list
      if (/^\d+\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          items.push(lines[i].replace(/^\d+\.\s/, ''));
          i++;
        }
        tokens.push({ type: 'ol', items });
        continue;
      }

      // Blank line — paragraph separator
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Paragraph — collect consecutive non-special lines
      const paraLines = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^(#{1,3}\s|```|[-*+]\s|\d+\.\s|>\s?|[-*_]{3,}$)/.test(lines[i])
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length) tokens.push({ type: 'paragraph', content: paraLines.join('\n') });
    }

    return tokens;
  }

  const tokens = tokenize(content);
  const headingClass = {
    1: 'text-lg font-bold text-white mt-4 mb-2 first:mt-0',
    2: 'text-base font-bold text-white mt-3 mb-1.5 first:mt-0',
    3: 'text-sm font-bold text-zinc-200 mt-2 mb-1 first:mt-0',
  };

  return (
    <div className="flex flex-col gap-2">
      {tokens.map((tok, ti) => {
        switch (tok.type) {
          case 'heading':
            return (
              <p key={ti} className={headingClass[tok.level] || headingClass[3]}>
                {renderInline(tok.content, ti)}
              </p>
            );

          case 'paragraph':
            return (
              <p key={ti} className="text-sm text-[#e8e8e8] leading-relaxed whitespace-pre-wrap">
                {renderInline(tok.content, ti)}
              </p>
            );

          case 'ul':
            return (
              <ul key={ti} className="space-y-1 pl-1">
                {tok.items.map((item, ii) => (
                  <li key={ii} className="flex gap-2 text-sm text-[#e8e8e8] leading-relaxed">
                    <span className="text-[#D1FF26] mt-[3px] flex-shrink-0">•</span>
                    <span>{renderInline(item, ii)}</span>
                  </li>
                ))}
              </ul>
            );

          case 'ol':
            return (
              <ol key={ti} className="space-y-1 pl-1">
                {tok.items.map((item, ii) => (
                  <li key={ii} className="flex gap-2 text-sm text-[#e8e8e8] leading-relaxed">
                    <span className="text-[#D1FF26] font-mono text-xs mt-[3px] flex-shrink-0 w-4 text-right">{ii + 1}.</span>
                    <span>{renderInline(item, ii)}</span>
                  </li>
                ))}
              </ol>
            );

          case 'code':
            return (
              <div key={ti} className="rounded-xl overflow-hidden border border-[#1e1e1e]">
                {tok.lang && (
                  <div className="flex items-center px-4 py-1.5 bg-[#0e0e0e] border-b border-[#1e1e1e]">
                    <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{tok.lang}</span>
                  </div>
                )}
                <pre className="overflow-x-auto p-4 bg-[#080808] text-xs text-zinc-300 font-mono leading-relaxed">
                  <code>{tok.content}</code>
                </pre>
              </div>
            );

          case 'blockquote':
            return (
              <div key={ti} className="border-l-2 border-[#D1FF26]/40 pl-4 py-0.5">
                <p className="text-sm text-zinc-400 leading-relaxed italic">
                  {renderInline(tok.content, ti)}
                </p>
              </div>
            );

          case 'hr':
            return <hr key={ti} className="border-none border-t border-[#1e1e1e] my-1" />;

          default:
            return null;
        }
      })}
    </div>
  );
}

// ── Inline SVG Chart ───────────────────────────────────────────────────────
function InlineChart({ type, title, unit, labels, datasets }) {
  const W = 560, H = 200, PL = 44, PR = 16, PT = 8, PB = 32;
  const cW = W - PL - PR, cH = H - PT - PB;

  if (!datasets?.length || !labels?.length) return null;
  const allVals = datasets.flatMap(d => d.data ?? []).filter(v => v != null);
  if (!allVals.length) return null;

  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  const COLORS = ['#D1FF26', '#00e3fd', '#ff7351', '#ffe56b'];

  function toX(i) { return PL + (i / (labels.length - 1)) * cW; }
  function toY(v) { return PT + cH - ((v - minV) / range) * cH; }
  function barX(i, di, total) {
    const slotW = cW / labels.length;
    const barW = slotW * 0.7 / total;
    const offset = (di - (total - 1) / 2) * (barW + 2);
    return PL + slotW * (i + 0.5) - barW / 2 + offset;
  }
  function barW(total) { return (cW / labels.length) * 0.7 / total; }

  const yTicks = 4;
  const yStep = range / yTicks;

  return (
    <div className="my-3 bg-[#0a0a0a] rounded-xl p-4 border border-[#1e1e1e] overflow-x-auto">
      {title && <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">{title}{unit ? ` (${unit})` : ''}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 300 }}>
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = minV + yStep * i;
          const y = toY(v);
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#1a1a1a" strokeWidth="1" />
              <text x={PL - 4} y={y + 3.5} textAnchor="end" fill="#444" fontSize="9">{Math.round(v)}</text>
            </g>
          );
        })}
        {datasets.map((ds, di) => {
          const color = ds.color ?? COLORS[di % COLORS.length];
          if (type === 'bar') {
            return ds.data.map((v, i) => {
              if (v == null) return null;
              const x = barX(i, di, datasets.length);
              const bw = barW(datasets.length);
              const y = toY(v);
              return (
                <rect key={i} x={x} y={y} width={bw} height={toY(minV) - y}
                  fill={color} rx="2" opacity="0.85" />
              );
            });
          }
          const pts = ds.data.map((v, i) => v != null ? `${toX(i)},${toY(v)}` : null).filter(Boolean);
          if (pts.length < 2) return null;
          return (
            <polyline key={di} points={pts.join(' ')} fill="none"
              stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          );
        })}
        {labels.map((lbl, i) => {
          if (labels.length > 8 && i % Math.ceil(labels.length / 8) !== 0) return null;
          const x = type === 'bar'
            ? PL + (cW / labels.length) * (i + 0.5)
            : toX(i);
          return (
            <text key={i} x={x} y={H - 4} textAnchor="middle" fill="#444" fontSize="9">{lbl}</text>
          );
        })}
      </svg>
      {datasets.length > 1 && (
        <div className="flex gap-3 mt-2 flex-wrap">
          {datasets.map((ds, i) => (
            <span key={i} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: ds.color ?? ['#D1FF26','#00e3fd','#ff7351','#ffe56b'][i % 4] }} />
              {ds.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── LLMBlock ───────────────────────────────────────────────────────────────
function LLMBlock({ text, streaming, toolStatus, onRetry }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const plain = text.replace(/<graph>[\s\S]*?<\/graph>/g, '').trim();
    navigator.clipboard?.writeText(plain);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (text === '\x00err') return (
    <div className="flex gap-3 items-start">
      <AIAvatar />
      <div className="flex-1 pt-1">
        <p className="text-sm text-[#d53d18] leading-relaxed">Something went wrong. Please try again.</p>
        <div className="flex gap-3 mt-2">
          <button onClick={onRetry} className="ctrl-btn"><Icon name="refresh" className="text-sm" /></button>
        </div>
      </div>
    </div>
  );

  const blocks = parseBlocks(text);
  const isStreaming = streaming && !text;
  const showToolStatus = toolStatus && !text;

  return (
    <div className="flex gap-3 items-start">
      <AIAvatar />
      <div className="flex-1 pt-1 min-w-0">
        {showToolStatus
          ? <div className="flex items-center gap-2 text-xs text-zinc-500 py-1"><span className="animate-pulse">⚙</span><span>{toolStatus}</span></div>
          : isStreaming && <ThinkingDots />
        }
        {!showToolStatus && !isStreaming ? (
          <>
            {blocks.map((block, i) => {
              if (block.type === 'text') {
                const t = block.content.trim();
                return t ? <MarkdownRenderer key={i} content={t} /> : null;
              }
              if (block.type === 'graph') {
                try {
                  const data = JSON.parse(block.content);
                  return <InlineChart key={i} {...data} />;
                } catch { return null; }
              }
              if (block.type === 'graph-pending') {
                return <ThinkingDots key={i} />;
              }
              return null;
            })}
            <div className="flex gap-2 mt-3">
              <button onClick={onRetry} className="ctrl-btn" title="Retry"><Icon name="refresh" className="text-sm" /></button>
              <button onClick={copy} className="ctrl-btn" title="Copy">
                {copied ? <span className="text-[10px] text-[#D1FF26]">Copied</span> : <Icon name="content_copy" className="text-sm" />}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function AIAvatar() {
  return (
    <div className="w-7 h-7 rounded-lg bg-[#D1FF26] flex items-center justify-center flex-shrink-0 mt-0.5">
      <Icon name="psychology" fill className="text-zinc-950 text-sm" />
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 items-center h-5 pt-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  );
}

// ── UserTurn ───────────────────────────────────────────────────────────────
function UserTurn({ node, branch, onRetry, onEdit, onBranch }) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="max-w-2xl bg-[#111] border border-[#1e1e1e] rounded-2xl rounded-tr-sm px-5 py-3.5">
        <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{branch.userText}</p>
      </div>
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] text-zinc-700" title={fmtFull(branch.ts)}>{fmtTime(branch.ts)}</span>
        <button onClick={onRetry} className="ctrl-btn" title="Retry"><Icon name="refresh" className="text-sm" /></button>
        <button onClick={onEdit} className="ctrl-btn" title="Edit"><Icon name="edit" className="text-sm" /></button>
        {node.branches.length > 1 && (
          <>
            <button onClick={() => onBranch(-1)} disabled={node.cur === 0} className="ctrl-btn disabled:opacity-30">‹</button>
            <span className="text-[10px] text-zinc-600">{node.cur + 1}/{node.branches.length}</span>
            <button onClick={() => onBranch(1)} disabled={node.cur === node.branches.length - 1} className="ctrl-btn disabled:opacity-30">›</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── EditMode ───────────────────────────────────────────────────────────────
function EditMode({ text, onChange, onCancel, onSave }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = ref.current.scrollHeight + 'px';
    ref.current.focus();
    ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length);
  }, []);

  return (
    <div className="flex flex-col items-end gap-3 max-w-2xl ml-auto w-full">
      <textarea
        ref={ref}
        value={text}
        onChange={e => {
          onChange(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = e.target.scrollHeight + 'px';
        }}
        className="w-full bg-[#111] border border-[#D1FF26]/20 rounded-2xl px-5 py-4 text-sm text-white leading-relaxed resize-none focus:outline-none focus:border-[#D1FF26]/50"
      />
      <div className="flex flex-col items-end gap-2 w-full px-1">
        <p className="text-[10px] text-zinc-600 max-w-xs text-right">
          Editing creates a new branch. Use ‹ › to switch between branches.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-1.5 text-xs text-zinc-600 border border-[#1e1e1e] rounded-lg hover:text-white transition-colors">Cancel</button>
          <button onClick={() => onSave(text)} className="px-4 py-1.5 text-xs font-bold bg-[#D1FF26] text-zinc-950 rounded-lg hover:bg-[#f4ffc9] transition-colors">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Suggestion chips ───────────────────────────────────────────────────────
const DEFAULT_SUGGESTIONS = [
  'How is my training volume trending?',
  'What should I focus on this week?',
  'Suggest a deload protocol for me',
  'What does my recovery look like?',
];

function buildSuggestions(workouts) {
  if (!workouts?.length) return DEFAULT_SUGGESTIONS;
  const liftCounts = {};
  for (const w of workouts.slice(0, 20)) {
    for (const a of w.activities ?? []) {
      if (a.type === 'lift' && a.name) {
        liftCounts[a.name] = (liftCounts[a.name] ?? 0) + 1;
      }
    }
  }
  const topLifts = Object.entries(liftCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);

  const dynamic = topLifts.map(name => `Analyze my ${name} progress over time`);
  return [
    'How is my training volume trending?',
    'What should I focus on this week?',
    ...dynamic,
    'Suggest a deload protocol for me',
  ].slice(0, 4);
}

// ── Input box ──────────────────────────────────────────────────────────────
const InputBox = memo(function InputBox({ onSend, disabled, onOpenChats, onNewChat, chatsActive }) {
  const [input, setInput] = useState('');
  const ref = useRef(null);

  function resize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  function send() {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
    if (ref.current) ref.current.style.height = '22px';
  }

  return (
    <div className="flex-shrink-0 pb-4 px-4 bg-[#0a0a0a]">
      <div className="max-w-[640px] mx-auto">
        <div
          className="bg-[#111] border border-[#1e1e1e] rounded-2xl px-4 pt-3 pb-2.5 cursor-text"
          onClick={() => ref.current?.focus()}
        >
          <textarea
            ref={ref}
            rows={1}
            value={input}
            onChange={e => { setInput(e.target.value); resize(e.target); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask Kinetic AI about your performance…"
            disabled={disabled}
            className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-white placeholder-zinc-700 resize-none leading-relaxed disabled:opacity-50 scrollbar-thin"
            style={{ minHeight: 22, maxHeight: 160, overflowY: 'auto' }}
          />
          <div className="flex items-center justify-between mt-2.5">
            <div className="flex items-center gap-0.5">
              <button
                onClick={e => { e.stopPropagation(); onNewChat(); }}
                title="New chat"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:bg-[#1e1e1e] hover:text-zinc-300 transition-all"
              >
                <Icon name="create" className="text-sm" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); onOpenChats(); }}
                title="Chats"
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${
                  chatsActive ? 'text-[#D1FF26]' : 'text-zinc-600 hover:bg-[#1e1e1e] hover:text-zinc-300'
                }`}
              >
                <Icon name="chat_bubble_outline" className="text-sm" />
              </button>
            </div>
            <button
              onClick={e => { e.stopPropagation(); send(); }}
              disabled={!input.trim() || disabled}
              className="px-5 py-1.5 rounded-lg bg-[#D1FF26] text-zinc-950 text-xs font-bold disabled:opacity-30 disabled:cursor-default hover:bg-[#f4ffc9] transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Chats Panel ────────────────────────────────────────────────────────────
function ChatsPanel({ open, onClose, conversations, activeId, onSelect, onNew, onDelete, loading }) {
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => { if (!open) { setSearch(''); setSelectMode(false); setSelected(new Set()); } }, [open]);

  if (!open) return null;

  const filtered = search.trim()
    ? conversations.filter(c => (c.title || 'New conversation').toLowerCase().includes(search.toLowerCase()))
    : conversations;

  function toggleSelect(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selected.size} conversation${selected.size > 1 ? 's' : ''}?`)) return;
    for (const id of selected) await onDelete(id, true);
    setSelected(new Set());
    setSelectMode(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
    <div
      ref={ref}
      className="w-full max-w-sm bg-[#0e0e0e] border border-[#1e1e1e] rounded-2xl shadow-2xl flex flex-col"
      style={{ maxHeight: '72vh' }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e] flex-shrink-0">
        <span className="text-sm font-bold text-white">Chats</span>
        <button
          onClick={() => { onNew(); onClose(); }}
          className="flex items-center gap-1 text-xs font-bold text-[#D1FF26] hover:text-[#f4ffc9] transition-colors"
        >
          <Icon name="add" className="text-xs" />
          New
        </button>
      </div>

      <div className="px-4 py-3 border-b border-[#1e1e1e] flex-shrink-0">
        <div className="flex items-center gap-2 bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2">
          <Icon name="search" className="text-zinc-700 text-sm flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-700 focus:outline-none min-w-0"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-zinc-700 hover:text-zinc-400 transition-colors">
              <Icon name="close" className="text-xs" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-2.5 flex-shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-700">Your Chats</span>
        {conversations.length > 0 && (
          <button
            onClick={() => { setSelectMode(s => !s); setSelected(new Set()); }}
            className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${selectMode ? 'text-[#D1FF26]' : 'text-zinc-700 hover:text-zinc-400'}`}
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <p className="px-5 py-4 text-xs text-zinc-700">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p className="px-5 py-8 text-xs text-zinc-700 text-center">
            {search ? 'No chats match your search' : 'No chats yet'}
          </p>
        )}
        {filtered.map(c => (
          <div
            key={c.id}
            onClick={() => {
              if (selectMode) { toggleSelect(c.id); return; }
              onSelect(c);
              onClose();
            }}
            className={`group flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors border-b border-[#111] last:border-0 ${
              c.id === activeId && !selectMode ? 'bg-[#111]' : 'hover:bg-[#111]'
            }`}
          >
            {selectMode && (
              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                selected.has(c.id) ? 'bg-[#D1FF26] border-[#D1FF26]' : 'border-[#2a2a2a]'
              }`}>
                {selected.has(c.id) && <Icon name="check" className="text-zinc-950" style={{ fontSize: 10 }} />}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate leading-snug ${
                c.id === activeId && !selectMode ? 'text-[#D1FF26]' : 'text-zinc-400'
              }`}>
                {c.title || 'New conversation'}
              </p>
              <p className="text-[10px] text-zinc-700 mt-0.5">{timeAgo(new Date(c.updated_at))}</p>
            </div>
            {!selectMode && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                className="opacity-0 group-hover:opacity-100 text-zinc-700 hover:text-[#d53d18] transition-all flex-shrink-0"
                title="Delete"
              >
                <Icon name="delete" className="text-sm" />
              </button>
            )}
          </div>
        ))}
      </div>

      {selectMode && selected.size > 0 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#1e1e1e] flex-shrink-0">
          <span className="text-xs text-zinc-600">{selected.size} selected</span>
          <button
            onClick={deleteSelected}
            className="flex items-center gap-1.5 text-xs font-bold text-[#d53d18] hover:text-[#ff7351] transition-colors"
          >
            <Icon name="delete" className="text-sm" />
            Delete
          </button>
        </div>
      )}
    </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AICoachPage() {
  const location = useLocation();
  const locationPrompt = location.state?.prompt ?? null;

  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  const [activeConvId, setActiveConvId] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [convNodes, setConvNodes] = useState([]);
  const [activeTipId, setActiveTipId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState('');
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [panelOpen, setPanelOpen] = useState(false);

  const scrollRef = useRef(null);
  const mainConvRef = useRef(null);
  const sendFnRef = useRef(null);
  const locationPromptFired = useRef(false);

  useEffect(() => {
    apiListConversations()
      .then(convs => {
        setConversations(convs);
        if (convs.length && (convs[0].messages ?? []).length > 0) {
          loadConversation(convs[0]);
        } else if (convs.length) {
          mainConvRef.current = convs[0].id;
          setActiveConvId(convs[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setConvLoading(false));

    apiGetWorkouts({ limit: 50 })
      .then(ws => setSuggestions(buildSuggestions(ws)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [nodes]);

  function loadConversation(conv) {
    mainConvRef.current = conv.id;
    setActiveConvId(conv.id);
    setConvNodes(conv.nodes || []);
    setActiveTipId(conv.active_tip_id ?? null);
    setNodes(buildDisplayNodes(conv.nodes || [], conv.active_tip_id ?? null, conv.messages));
    setEditing(null);

    if (!(conv.nodes?.length) && (conv.messages?.length)) {
      apiGetConversation(conv.id)
        .then(full => {
          if (mainConvRef.current !== conv.id) return;
          setConvNodes(full.nodes || []);
          setActiveTipId(full.active_tip_id ?? null);
          setNodes(buildDisplayNodes(full.nodes || [], full.active_tip_id ?? null, full.messages));
        })
        .catch(() => {});
    }
  }

  async function getOrCreateConvId() {
    if (mainConvRef.current) return mainConvRef.current;
    const conv = await apiCreateConversation();
    mainConvRef.current = conv.id;
    setActiveConvId(conv.id);
    setConversations(cs => [conv, ...cs]);
    return conv.id;
  }

  async function streamReply(text, nodeId, branchIdx, convId, parentMsgId) {
    if (!convId) return;
    setStreaming(true);
    const { access } = getTokens();
    let res;
    try {
      res = await fetch(`${BASE_URL}/api/conversations/${convId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
        body: JSON.stringify({ message: text, parent_message_id: parentMsgId ?? null }),
      });
    } catch {
      setNodes(prev => prev.map(n => n.id !== nodeId ? n :
        { ...n, branches: n.branches.map((b, i) => i === branchIdx ? { ...b, llmText: '\x00err' } : b) }
      ));
      setStreaming(false);
      return;
    }

    if (!res.ok) {
      setNodes(prev => prev.map(n => n.id !== nodeId ? n :
        { ...n, branches: n.branches.map((b, i) => i === branchIdx ? { ...b, llmText: '\x00err' } : b) }
      ));
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') {
          apiListConversations().then(cs => setConversations(cs)).catch(() => {});
          apiGetConversation(convId)
            .then(full => {
              if (mainConvRef.current !== convId) return;
              setConvNodes(full.nodes || []);
            })
            .catch(() => {});
          setToolStatus('');
          setStreaming(false);
          return;
        }
        let d;
        try { d = JSON.parse(raw); } catch { continue; }

        if (d && typeof d === 'object' && d.$ === 'saved') {
          setActiveTipId(d.active_tip_id);
          setNodes(prev => prev.map(n => n.id !== nodeId ? n : {
            ...n,
            branches: n.branches.map((b, i) => i !== branchIdx ? b : {
              ...b,
              userMsgId: d.user_msg_id,
              aiMsgId: d.ai_msg_id,
              tipId: d.active_tip_id,
            }),
          }));
          continue;
        }

        if (d === '\x00error') {
          setNodes(prev => prev.map(n => n.id !== nodeId ? n :
            { ...n, branches: n.branches.map((b, i) => i === branchIdx ? { ...b, llmText: '\x00err' } : b) }
          ));
          setStreaming(false);
          setToolStatus('');
          return;
        }

        if (typeof d === 'string' && d.startsWith('\x00tool:')) {
          const TOOL_LABELS = {
            get_exercise_history:  'Fetching exercise history…',
            get_workout_volume:    'Fetching training volume…',
            get_biometric_trend:   'Fetching biometric data…',
            get_nutrition_trend:   'Fetching nutrition data…',
            get_session_frequency: 'Fetching session history…',
          };
          const name = d.slice(6);
          setToolStatus(TOOL_LABELS[name] || 'Fetching data…');
          continue;
        }

        setToolStatus('');
        setNodes(prev => prev.map(n => n.id !== nodeId ? n :
          { ...n, branches: n.branches.map((b, i) => i === branchIdx ? { ...b, llmText: b.llmText + d } : b) }
        ));
      }
    }
    setStreaming(false);
    setToolStatus('');
  }

  function send(text) {
    if (!text.trim() || streaming) return;
    const id = uid();
    const isFirst = nodes.length === 0;
    const parentMsgId = activeTipId;
    setNodes(p => [...p, {
      id,
      branches: [{ userText: text, llmText: '', ts: new Date(), userMsgId: null, aiMsgId: null, parentMsgId, tipId: null }],
      cur: 0,
    }]);
    getOrCreateConvId().then(convId => {
      if (isFirst) {
        apiUpdateConversation(convId, { title: text.slice(0, 60) })
          .then(updated => setConversations(cs => cs.map(c => c.id === convId ? { ...c, title: updated.title } : c)))
          .catch(() => {});
      }
      streamReply(text, id, 0, convId, parentMsgId);
    });
  }
  sendFnRef.current = send;
  const stableSend = useCallback((text) => sendFnRef.current(text), []);

  useEffect(() => {
    if (!locationPrompt || locationPromptFired.current || convLoading) return;
    locationPromptFired.current = true;
    const t = setTimeout(() => stableSend(locationPrompt), 300);
    return () => clearTimeout(t);
  }, [locationPrompt, convLoading, stableSend]);

  function retry(nodeId) {
    const idx = nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) return;
    const node = nodes[idx];
    const cur = node.branches[node.cur];
    const parentMsgId = cur.parentMsgId;
    const newBranch = { userText: cur.userText, llmText: '', ts: new Date(), userMsgId: null, aiMsgId: null, parentMsgId, tipId: null };
    const branchIdx = node.branches.length;
    const updatedNode = { ...node, branches: [...node.branches, newBranch], cur: branchIdx };
    setNodes([...nodes.slice(0, idx), updatedNode]);
    streamReply(cur.userText, nodeId, branchIdx, mainConvRef.current, parentMsgId);
  }

  function saveEdit(nodeId, text) {
    const idx = nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) { setEditing(null); return; }
    const node = nodes[idx];
    const cur = node.branches[node.cur];
    const parentMsgId = cur.parentMsgId;
    const newBranch = { userText: text, llmText: '', ts: new Date(), userMsgId: null, aiMsgId: null, parentMsgId, tipId: null };
    const branchIdx = node.branches.length;
    const updatedNode = { ...node, branches: [...node.branches, newBranch], cur: branchIdx };
    setNodes([...nodes.slice(0, idx), updatedNode]);
    setEditing(null);
    streamReply(text, nodeId, branchIdx, mainConvRef.current, parentMsgId);
  }

  async function switchBranch(nodeId, delta) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const nextIdx = node.cur + delta;
    if (nextIdx < 0 || nextIdx >= node.branches.length) return;
    const targetBranch = node.branches[nextIdx];

    if (!targetBranch.aiMsgId || !mainConvRef.current) {
      setNodes(prev => prev.map(n => n.id !== nodeId ? n : { ...n, cur: nextIdx }));
      return;
    }

    // Build byParent from the live convNodes so we walk the *current* tree,
    // not the stale tipId recorded when this branch was first created.
    const byParent = {};
    for (const n of convNodes) {
      const key = n.parent_id ?? '__root__';
      (byParent[key] = byParent[key] || []).push(n);
    }
    const actualTipId = findTip(byParent, targetBranch.aiMsgId);

    try {
      const conv = await apiSetActiveBranch(mainConvRef.current, actualTipId);
      setConvNodes(conv.nodes || []);
      setActiveTipId(conv.active_tip_id ?? null);
      setNodes(buildDisplayNodes(conv.nodes || [], conv.active_tip_id ?? null, conv.messages));
    } catch {
      setNodes(prev => prev.map(n => n.id !== nodeId ? n : { ...n, cur: nextIdx }));
    }
  }

  async function handleNewChat() {
    if (nodes.length === 0) return;
    const conv = await apiCreateConversation();
    mainConvRef.current = conv.id;
    setActiveConvId(conv.id);
    setConversations(cs => [conv, ...cs]);
    setNodes([]);
    setConvNodes([]);
    setActiveTipId(null);
    setEditing(null);
  }

  async function handleSelectConv(conv) {
    if (conv.id === activeConvId) return;
    mainConvRef.current = conv.id;
    setActiveConvId(conv.id);
    setNodes(buildDisplayNodes(conv.nodes || [], conv.active_tip_id ?? null, conv.messages));
    setConvNodes(conv.nodes || []);
    setActiveTipId(conv.active_tip_id ?? null);
    setEditing(null);

    try {
      const full = await apiGetConversation(conv.id);
      if (mainConvRef.current !== conv.id) return;
      setConvNodes(full.nodes || []);
      setActiveTipId(full.active_tip_id ?? null);
      setNodes(buildDisplayNodes(full.nodes || [], full.active_tip_id ?? null, full.messages));
    } catch {}
  }

  async function handleDeleteConv(id, silent = false) {
    if (!silent && !confirm('Delete this conversation?')) return;
    await apiDeleteConversation(id).catch(() => {});
    if (id === activeConvId) {
      setEditing(null);
      setConversations(cs => {
        const remaining = cs.filter(c => c.id !== id);
        if (remaining.length && (remaining[0].messages ?? []).length > 0) {
          loadConversation(remaining[0]);
        } else if (remaining.length) {
          mainConvRef.current = remaining[0].id;
          setActiveConvId(remaining[0].id);
          setNodes([]);
          setConvNodes([]);
          setActiveTipId(null);
        } else {
          mainConvRef.current = null;
          setActiveConvId(null);
          setNodes([]);
          setConvNodes([]);
          setActiveTipId(null);
        }
        return remaining;
      });
    } else {
      setConversations(cs => cs.filter(c => c.id !== id));
    }
  }

  const isEmpty = nodes.length === 0;

  return (
    <div className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-5rem)] bg-[#0a0a0a] overflow-hidden">

      <ChatsPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConv}
        onNew={handleNewChat}
        onDelete={handleDeleteConv}
        loading={convLoading}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 space-y-6">
          {isEmpty && (
            <div className="max-w-[640px] mx-auto px-4 flex flex-col items-center justify-center h-full gap-7 py-20">
              <div className="w-12 h-12 rounded-2xl bg-[#D1FF26] flex items-center justify-center">
                <Icon name="psychology" fill className="text-zinc-950 text-xl" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-headline font-bold text-white tracking-tight mb-1.5">Kinetic AI</h2>
                <p className="text-sm text-zinc-600 max-w-xs leading-relaxed">Ask anything about your training — analysis, programming, recovery.</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => stableSend(s)}
                    className="px-3.5 py-2 bg-[#111] border border-[#1e1e1e] rounded-full text-xs text-zinc-500 hover:border-[#D1FF26]/30 hover:text-[#D1FF26] transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {nodes.map(node => {
            const b = node.branches[node.cur];
            const isEditing = editing?.nodeId === node.id;
            return (
              <div key={node.id} className="max-w-[640px] mx-auto px-4 space-y-4">
                {isEditing ? (
                  <EditMode
                    text={editing.text}
                    onChange={t => setEditing(e => ({ ...e, text: t }))}
                    onCancel={() => setEditing(null)}
                    onSave={t => saveEdit(node.id, t)}
                  />
                ) : (
                  <UserTurn
                    node={node}
                    branch={b}
                    onRetry={() => retry(node.id)}
                    onEdit={() => setEditing({ nodeId: node.id, text: b.userText })}
                    onBranch={d => switchBranch(node.id, d)}
                  />
                )}
                <LLMBlock
                  text={b.llmText}
                  streaming={!b.llmText && streaming && node.id === nodes[nodes.length - 1].id}
                  toolStatus={!b.llmText && node.id === nodes[nodes.length - 1].id ? toolStatus : ''}
                  onRetry={() => retry(node.id)}
                />
              </div>
            );
          })}
        </div>

        <InputBox
          onSend={stableSend}
          disabled={streaming}
          onOpenChats={() => setPanelOpen(o => !o)}
          onNewChat={handleNewChat}
          chatsActive={panelOpen}
        />
      </div>
    </div>
  );
}