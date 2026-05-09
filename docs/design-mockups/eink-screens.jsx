/* global React, Creature */
const { useMemo } = React;

// =====================================================================
// AgentDeck — E-ink screen library v2
// Uses real Creature SVGs from creatures.jsx (claudecode, codex, openclaw, opencode)
// Real device sizes: Crema S landscape ~1872×1404, rendered at logical ½ (936×702).
// =====================================================================

const tokensBW = {
  paper: '#f4f1e8', paper2: '#ebe7da',
  ink: '#15140f', ink2: '#2b2820', ink3: '#5a564a', ink4: '#8a8676',
  rule: '#cfc9b8', hi: '#15140f', ok: '#15140f', warn: '#15140f',
  bgWater: '#f4f1e8', sand: '#dad4c1',
  cClaude: '#2b2820', cCodex: '#2b2820', cClaw: '#15140f', cCode: '#15140f',
};

const tokensColor = {
  paper: '#f0ece1', paper2: '#e8e3d4',
  ink: '#14130e', ink2: '#2b2820', ink3: '#5a564a', ink4: '#8a8676',
  rule: '#cfc9b8', hi: '#c8431f', ok: '#2f6b3a', warn: '#b6852c',
  bgWater: '#c8dde8', sand: '#d4b896',
  // Brand-tinted creatures (Kaleido-3 safe — saturated but flat)
  cClaude: '#c07058', cCodex: '#5560c8', cClaw: '#cc3333', cCode: '#2b2820',
};

const baseFont = `"Inter", "Helvetica Neue", system-ui, sans-serif`;
const monoFont = `"JetBrains Mono", "IBM Plex Mono", "SF Mono", Menlo, monospace`;
const serifFont = `"Source Serif Pro", "Charter", "Iowan Old Style", Georgia, serif`;

// --- helpers ---------------------------------------------------------
function creatureColor(kind, t) {
  return ({
    claudecode: t.cClaude,
    codex: t.cCodex,
    openclaw: t.cClaw,
    opencode: t.cCode,
  })[kind] || t.ink;
}
function stateGlyph(state, size, color) {
  if (state === 'AWAIT') {
    return (
      <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
        <polygon points="9,2 16,15 2,15" fill={color}/>
        <line x1="9" y1="7" x2="9" y2="11" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="9" cy="13" r="0.9" fill="#fff"/>
      </svg>
    );
  }
  if (state === 'PROC') {
    return (
      <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
        <circle cx="9" cy="9" r="4.5" fill={color}/>
      </svg>
    );
  }
  if (state === 'IDLE') {
    return (
      <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
        <circle cx="9" cy="9" r="4" fill="none" stroke={color} strokeWidth="1.6"/>
      </svg>
    );
  }
  if (state === 'OFF') {
    return (
      <svg width={size} height={size} viewBox="0 0 18 18" style={{ display: 'block' }}>
        <line x1="3" y1="3" x2="15" y2="15" stroke={color} strokeWidth="1.6"/>
        <line x1="15" y1="3" x2="3" y2="15" stroke={color} strokeWidth="1.6"/>
      </svg>
    );
  }
  return null;
}

// --- block bar -------------------------------------------------------
function BlockBar({ pct, t, height = 14 }) {
  const cells = 20;
  const filled = Math.round((pct / 100) * cells);
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center', height }}>
      {Array.from({ length: cells }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: '100%',
          background: i < filled ? t.ink : 'transparent',
          border: `1.5px solid ${t.ink}`, boxSizing: 'border-box',
        }}/>
      ))}
    </div>
  );
}

// =====================================================================
// SCENARIOS — richer mocks
// Each session: { id, agent, name, project, model, state, tool?, attention?, since }
// =====================================================================
const SCENARIOS = {
  // 1) typical day — multiple Claudes + 1 Codex idle + Pantone Pixoo via OpenClaw
  multi_claude: {
    label: '4 sessions · 2× Claude, 1× Codex, 1× OpenClaw',
    focus: 0,
    sessions: [
      { agent: 'claudecode', name: 'claude · web',     project: 'agentdeck',    model: 'opus-4.6',  state: 'PROC',  tool: 'Edit  apme/runner.ts',  since: '14m' },
      { agent: 'claudecode', name: 'claude · cli',     project: 'firmware-esp', model: 'sonnet-4.5',state: 'IDLE',  tool: null,                    since: '2h' },
      { agent: 'codex',      name: 'codex · main',     project: 'apme-tuner',   model: 'gpt-5.4',   state: 'PROC',  tool: 'Read  runner.ts',       since: '5m' },
      { agent: 'openclaw',   name: 'openclaw · gw',    project: 'gateway',      model: 'glm-5.1',   state: 'IDLE',  tool: null,                    since: '6h' },
    ],
  },
  // 2) busy — three Claude Code sessions all running
  triple_claude: {
    label: '5 sessions · 3× Claude, all hot',
    focus: 1,
    sessions: [
      { agent: 'claudecode', name: 'claude · agentdeck', project: 'agentdeck',  model: 'opus-4.6',   state: 'PROC',  tool: 'Bash · pnpm build',      since: '22m' },
      { agent: 'claudecode', name: 'claude · cli',       project: 'apme-tuner', model: 'opus-4.6',   state: 'PROC',  tool: 'Edit  data/profile.ts',  since: '8m'  },
      { agent: 'claudecode', name: 'claude · scratch',   project: 'scratch',    model: 'haiku-4.5',  state: 'IDLE',  tool: null,                     since: '40m' },
      { agent: 'codex',      name: 'codex · ttf',        project: 'fonttools',  model: 'gpt-5.4',    state: 'IDLE',  tool: null,                     since: '1h' },
      { agent: 'opencode',   name: 'opencode · vendor',  project: 'rk3566',     model: 'qwen3:30b',  state: 'PROC',  tool: 'WebFetch',               since: '3m' },
    ],
  },
  // 3) attention — one Claude awaiting permission while another runs
  permission: {
    label: '4 sessions · permission request on claude·cli',
    focus: 1,
    attentionId: 1,
    sessions: [
      { agent: 'claudecode', name: 'claude · web',     project: 'agentdeck',    model: 'opus-4.6',  state: 'PROC',  tool: 'Edit  apme/runner.ts', since: '14m' },
      { agent: 'claudecode', name: 'claude · cli',     project: 'scratch',      model: 'sonnet-4.5',state: 'AWAIT', tool: 'Bash  rm -rf .zig-cache', attention: 'Allow Bash(rm -rf .zig-cache)?', since: '15m' },
      { agent: 'codex',      name: 'codex · main',     project: 'apme-tuner',   model: 'gpt-5.4',   state: 'IDLE',  tool: null,                    since: '2h' },
      { agent: 'openclaw',   name: 'openclaw · gw',    project: 'gateway',      model: 'glm-5.1',   state: 'IDLE',  tool: null,                    since: '6h' },
    ],
  },
  // 4) two Codex sessions + OpenCode
  multi_codex: {
    label: '4 sessions · 2× Codex, 1× OpenCode, 1× Claude idle',
    focus: 0,
    sessions: [
      { agent: 'codex',      name: 'codex · firmware', project: 'esp32-disp', model: 'gpt-5.4',  state: 'PROC',  tool: 'Bash · idf.py build',  since: '4m' },
      { agent: 'codex',      name: 'codex · tuner',    project: 'apme-tuner', model: 'gpt-5.4',  state: 'PROC',  tool: 'Read  profile.ts',     since: '12m' },
      { agent: 'opencode',   name: 'opencode · main',  project: 'rk3566',     model: 'qwen3:30b',state: 'PROC',  tool: 'WebFetch · datasheet', since: '7m' },
      { agent: 'claudecode', name: 'claude · web',     project: 'agentdeck',  model: 'opus-4.6', state: 'IDLE',  tool: null,                   since: '38m' },
    ],
  },
  // 5) sparse — single OpenCode running
  solo_opencode: {
    label: '1 session · OpenCode only',
    focus: 0,
    sessions: [
      { agent: 'opencode',   name: 'opencode · main',  project: 'rk3566',     model: 'qwen3:30b',state: 'PROC',  tool: 'Bash · cmake --build', since: '1h 12m' },
    ],
  },
};

// =====================================================================
// SCREEN
// =====================================================================
const SCR_W = 936;
const SCR_H = 702;

function EinkScreen({ variant, scenario, t, override }) {
  const sc = SCENARIOS[scenario];
  const sessions = sc.sessions;
  const focusIdx = override?.focus ?? sc.focus ?? 0;
  const focus = sessions[focusIdx];
  const attentionId = sc.attentionId;
  const isAwait = focus?.state === 'AWAIT';
  const isProc = focus?.state === 'PROC';

  return (
    <div style={{
      width: SCR_W, height: SCR_H,
      background: t.paper, color: t.ink,
      fontFamily: baseFont,
      position: 'relative', boxSizing: 'border-box', overflow: 'hidden',
    }}>
      {/* CHROME — top bar */}
      <div style={{
        height: 56, borderBottom: `2px solid ${t.ink}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'baseline' }}>
          <div style={{ fontFamily: serifFont, fontWeight: 700, fontSize: 26, letterSpacing: '-0.01em' }}>AgentDeck</div>
          <div style={{ fontFamily: monoFont, fontSize: 14, color: t.ink3 }}>14:32</div>
          <div style={{ fontFamily: monoFont, fontSize: 12, color: t.ink3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{sc.label}</div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontFamily: monoFont, fontSize: 13, color: t.ink3 }}>
          {isAwait && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '4px 10px', border: `2px solid ${variant === 'color' ? t.hi : t.ink}`,
              fontFamily: monoFont, fontSize: 12, fontWeight: 700,
              letterSpacing: '0.16em', textTransform: 'uppercase',
              color: variant === 'color' ? t.hi : t.ink,
            }}>
              {stateGlyph('AWAIT', 12, variant === 'color' ? t.hi : t.ink)}
              ATTENTION
            </div>
          )}
          <span>● 84%</span>
          <span style={{ fontSize: 18 }}>↻</span>
          <span style={{ fontSize: 18 }}>⚙</span>
        </div>
      </div>

      {/* BODY */}
      <div style={{
        display: 'grid', gridTemplateColumns: '252px 1fr',
        height: SCR_H - 56,
      }}>
        {/* sessions list — variable count */}
        <div style={{
          borderRight: `2px solid ${t.ink}`,
          padding: '14px 14px 14px 16px',
          display: 'flex', flexDirection: 'column', gap: 6,
          overflow: 'hidden',
        }}>
          <div style={{ fontFamily: monoFont, fontSize: 11, letterSpacing: '0.14em', color: t.ink3, textTransform: 'uppercase' }}>
            Sessions · {sessions.length}
          </div>
          {sessions.map((s, i) => (
            <SessionRow key={i} s={s} t={t} variant={variant}
              focus={i === focusIdx} attention={i === attentionId}/>
          ))}

          <div style={{ flex: 1 }}/>
          <div style={{ borderTop: `1px solid ${t.rule}`, paddingTop: 8, fontFamily: monoFont, fontSize: 11, color: t.ink3, lineHeight: 1.55 }}>
            <div style={{ letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>Topology</div>
            <div>↑ hooks · gateway :18789</div>
            <div>↓ SD+ · D200H · Pixoo · Tab</div>
          </div>
        </div>

        {/* main */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <FocusCard t={t} variant={variant} session={focus}/>
          {isAwait && <AttentionZone t={t} variant={variant} session={focus}/>}
          <Terrarium t={t} variant={variant} sessions={sessions} focusIdx={focusIdx} attentionId={attentionId} compact={isAwait}/>
          <Gauges t={t} variant={variant}/>
          <Timeline t={t} variant={variant} sessions={sessions} focus={focus}/>
        </div>
      </div>
    </div>
  );
}

function SessionRow({ s, t, variant, focus, attention }) {
  const cColor = focus ? t.paper : (variant === 'color' ? creatureColor(s.agent, t) : t.ink);
  const stateColor = s.state === 'AWAIT' ? (variant === 'color' ? t.hi : t.ink)
                    : s.state === 'PROC' ? (variant === 'color' ? t.ok : t.ink)
                    : t.ink3;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 8,
      alignItems: 'center', padding: '6px 8px',
      background: focus ? t.ink : 'transparent',
      color: focus ? t.paper : t.ink,
      borderLeft: attention && !focus ? `3px solid ${variant === 'color' ? t.hi : t.ink}` : '3px solid transparent',
    }}>
      <Creature kind={s.agent} size={18} color={cColor}/>
      <div style={{ overflow: 'hidden' }}>
        <div style={{
          fontFamily: baseFont, fontSize: 14, fontWeight: 600,
          color: focus ? t.paper : t.ink,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{s.name}</div>
        <div style={{
          fontFamily: monoFont, fontSize: 10.5,
          color: focus ? t.paper2 : t.ink3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{s.project}</div>
      </div>
      <div style={{
        fontFamily: monoFont, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4,
        color: focus ? t.paper : stateColor,
      }}>
        {stateGlyph(s.state, 10, focus ? t.paper : stateColor)}
        {s.state}
      </div>
    </div>
  );
}

function FocusCard({ t, variant, session: s }) {
  if (!s) return null;
  const stateColor = s.state === 'AWAIT' ? (variant === 'color' ? t.hi : t.ink)
                    : s.state === 'PROC' ? (variant === 'color' ? t.ok : t.ink)
                    : t.ink3;
  const stateLabel = s.state === 'PROC' ? 'PROCESSING' : s.state === 'AWAIT' ? 'AWAITING' : 'IDLE';
  return (
    <div style={{ padding: '14px 22px', borderBottom: `2px solid ${t.ink}` }}>
      <div style={{ fontFamily: monoFont, fontSize: 11, letterSpacing: '0.12em', color: t.ink3, textTransform: 'uppercase' }}>
        PROJECT · {s.project}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
        <Creature kind={s.agent} size={26} color={variant === 'color' ? creatureColor(s.agent, t) : t.ink}/>
        <div style={{ fontFamily: serifFont, fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{s.name}</div>
      </div>
      <div style={{ display: 'flex', gap: 22, marginTop: 6, fontFamily: monoFont, fontSize: 13, color: t.ink3, alignItems: 'center', flexWrap: 'wrap' }}>
        <span><b style={{ color: t.ink }}>{s.model}</b></span>
        <span style={{ color: stateColor, fontWeight: 700, letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5 }}>
          {stateGlyph(s.state, 11, stateColor)} {stateLabel}
        </span>
        <span>started {s.since} ago</span>
        {s.tool && <span style={{ color: t.ink2 }}>· {s.tool}</span>}
      </div>
    </div>
  );
}

function AttentionZone({ t, variant, session: s }) {
  const accent = variant === 'color' ? t.hi : t.ink;
  return (
    <div style={{
      padding: '14px 22px',
      borderBottom: `2px solid ${t.ink}`,
      borderLeft: `8px solid ${accent}`,
      background: variant === 'color'
        ? 'repeating-linear-gradient(45deg, transparent 0 6px, rgba(200,67,31,0.06) 6px 7px)'
        : 'repeating-linear-gradient(45deg, transparent 0 6px, rgba(21,20,15,0.05) 6px 7px)',
    }}>
      <div style={{
        fontFamily: monoFont, fontSize: 11, letterSpacing: '0.18em',
        color: accent, textTransform: 'uppercase', fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {stateGlyph('AWAIT', 12, accent)} Permission · {s.name}
      </div>
      <div style={{ fontFamily: serifFont, fontSize: 19, fontWeight: 600, marginTop: 4, lineHeight: 1.25 }}>
        {s.attention}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <Opt t={t} k="Y" label="Approve once" primary accent={accent}/>
        <Opt t={t} k="A" label="Always for this project" accent={accent}/>
        <Opt t={t} k="N" label="Deny" accent={accent}/>
      </div>
    </div>
  );
}
function Opt({ t, k, label, primary, accent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 12px',
      border: `2px solid ${primary ? accent : t.ink}`,
      background: primary ? accent : 'transparent',
      color: primary ? t.paper : t.ink,
      fontFamily: monoFont, fontSize: 13,
    }}>
      <span style={{ fontWeight: 700 }}>[{k}]</span>
      <span>{label}</span>
    </div>
  );
}

// --- TERRARIUM — uses real Creature SVGs as inhabitants ---------------
function Terrarium({ t, variant, sessions, focusIdx, attentionId, compact }) {
  const h = compact ? 110 : 175;
  // place creatures along x by index
  const slots = sessions.length;
  const positions = Array.from({ length: slots }).map((_, i) => {
    const usable = SCR_W - 232 - 80;
    return 50 + (i * usable / Math.max(slots - 1, 1));
  });

  return (
    <div style={{
      position: 'relative', height: h,
      borderBottom: `2px solid ${t.ink}`,
      background: t.bgWater, overflow: 'hidden',
    }}>
      <svg width="100%" height="100%" viewBox={`0 0 1000 ${h}`} preserveAspectRatio="xMidYMid slice">
        {/* sand floor */}
        <rect x="0" y={h - 36} width="1000" height="36" fill={t.sand}/>
        <line x1="0" y1={h - 36} x2="1000" y2={h - 36} stroke={t.ink} strokeWidth="1.5"/>
        {[...Array(20)].map((_, i) => (
          <line key={i} x1={20 + i * 50} y1={h - 20} x2={50 + i * 50} y2={h - 20}
            stroke={t.ink3} strokeWidth="0.8" opacity="0.4"/>
        ))}
        {/* seaweed */}
        <Seaweed x={30} h={h - 50} t={t}/>
        <Seaweed x={50} h={h - 60} t={t}/>
        <Seaweed x={965} h={h - 55} t={t}/>
        <Seaweed x={985} h={h - 70} t={t}/>
      </svg>

      {/* HTML overlay so we can drop real Creature SVGs in */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {sessions.map((s, i) => {
          const x = (positions[i] / 1000) * 100;
          const y = i % 2 === 0 ? (compact ? 12 : 22) : (compact ? 36 : 64);
          const focus = i === focusIdx;
          const await_ = i === attentionId;
          const size = focus || await_ ? 64 : 48;
          const c = variant === 'color' ? creatureColor(s.agent, t) : t.ink;
          return (
            <div key={i} style={{
              position: 'absolute', left: `${x}%`, top: y,
              transform: 'translate(-50%, 0)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <div style={{
                padding: '2px 8px',
                background: t.paper,
                border: `${await_ ? 2.5 : focus ? 2 : 1.5}px solid ${await_ ? (variant === 'color' ? t.hi : t.ink) : t.ink}`,
                fontFamily: monoFont, fontSize: 10,
                color: t.ink, whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {await_ && stateGlyph('AWAIT', 9, variant === 'color' ? t.hi : t.ink)}
                {s.name}
              </div>
              <Creature kind={s.agent} size={size} color={c} state={s.state === 'PROC' ? 'processing' : s.state === 'AWAIT' ? 'awaiting' : 'idle'} animate={false}/>
              <div style={{
                fontFamily: monoFont, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                color: s.state === 'AWAIT' ? (variant === 'color' ? t.hi : t.ink) : s.state === 'PROC' ? (variant === 'color' ? t.ok : t.ink2) : t.ink3,
                background: t.paper, padding: '1px 5px',
              }}>{s.state}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Seaweed({ x, h, t }) {
  const segs = Math.floor(h / 14);
  const path = Array.from({ length: segs }).map((_, i) => {
    const sx = (i % 2 === 0) ? -3 : 3;
    return `${i === 0 ? 'M' : 'L'} ${sx} ${-i * 14}`;
  }).join(' ');
  return (
    <g transform={`translate(${x}, ${h + 20})`}>
      <path d={path} stroke={variant => t.ink2 || '#3d3a30'} strokeWidth={3} fill="none" strokeLinecap="round"
        style={{ stroke: t.ink2 }}/>
    </g>
  );
}

function Gauges({ t, variant }) {
  return (
    <div style={{
      padding: '12px 22px 14px',
      borderBottom: `2px solid ${t.ink}`,
      display: 'grid',
      gridTemplateColumns: '180px 180px 1fr',
      gap: 24, alignItems: 'flex-start',
    }}>
      <GaugeCol t={t} label="Limits · 5h" pct={62} reset="↻ 2h 14m"/>
      <GaugeCol t={t} label="Limits · 7d" pct={34} reset="↻ 4d 08h"/>
      <div>
        <div style={{ fontFamily: monoFont, fontSize: 11, letterSpacing: '0.14em', color: t.ink3, textTransform: 'uppercase' }}>Models</div>
        <div style={{ marginTop: 6, fontFamily: monoFont, fontSize: 13, lineHeight: 1.55, color: t.ink2 }}>
          <div><b style={{ color: t.ink }}>OAuth</b>&nbsp;&nbsp;opus-4.6 · sonnet-4.5 · haiku-4.5 · gpt-5.4 · glm-5.1</div>
          <div><b style={{ color: t.ink }}>Local</b>&nbsp;&nbsp;<span style={{ color: variant === 'color' ? t.ok : t.ink }}>● mlx</span> qwen3:30b · <span style={{ color: variant === 'color' ? t.warn : t.ink3 }}>○ ollama</span></div>
        </div>
      </div>
    </div>
  );
}
function GaugeCol({ t, label, pct, reset }) {
  return (
    <div>
      <div style={{ fontFamily: monoFont, fontSize: 11, letterSpacing: '0.14em', color: t.ink3, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <div style={{ fontFamily: monoFont, fontSize: 24, fontWeight: 700 }}>{pct}<span style={{ fontSize: 14, color: t.ink3 }}>%</span></div>
        <div style={{ fontFamily: monoFont, fontSize: 12, color: t.ink3, marginLeft: 'auto' }}>{reset}</div>
      </div>
      <div style={{ marginTop: 4 }}>
        <BlockBar pct={pct} t={t}/>
      </div>
    </div>
  );
}

function Timeline({ t, variant, sessions, focus }) {
  const ok = variant === 'color' ? t.ok : t.ink;
  const hi = variant === 'color' ? t.hi : t.ink;
  // Generate timeline based on focus state
  const rows = focus?.state === 'AWAIT' ? [
    ['14:31', '·', 'PROCESSING → AWAITING', t.ink2],
    ['14:32', '◆', `permission · ${focus.tool}`, hi],
    ['14:32', '·', `focus → ${focus.name}`, t.ink2],
  ] : focus?.state === 'PROC' ? [
    ['14:30', '·', `${focus.name} started`, t.ink2],
    ['14:31', '▶', focus.tool || 'tool call', ok],
    ['14:32', '·', `model call ${focus.model}`, t.ink2],
    ['14:32', '★', 'eval · 0.78', ok],
  ] : [
    ['14:18', '·', 'session_start', t.ink2],
    ['14:24', '·', 'IDLE', t.ink3],
    ['14:30', '·', 'no activity', t.ink3],
  ];
  return (
    <div style={{
      padding: '8px 22px 14px',
      fontFamily: monoFont, fontSize: 12, lineHeight: 1.55,
      color: t.ink2, flex: 1, overflow: 'hidden',
    }}>
      <div style={{ fontFamily: monoFont, fontSize: 11, letterSpacing: '0.14em', color: t.ink3, textTransform: 'uppercase', marginBottom: 4 }}>Timeline</div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '46px 14px 1fr', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: t.ink3, fontWeight: 600 }}>{r[0]}</span>
          <span style={{ color: r[3] }}>{r[1]}</span>
          <span style={{ color: r[3] }}>{r[2]}</span>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// PORTRAIT — 540×720
// =====================================================================
function EinkScreenPortrait({ t, variant, scenario }) {
  const W = 540, H = 720;
  const sc = SCENARIOS[scenario];
  const sessions = sc.sessions;
  const focusIdx = sc.focus ?? 0;
  const focus = sessions[focusIdx];
  const isAwait = focus?.state === 'AWAIT';
  return (
    <div style={{
      width: W, height: H, background: t.paper, color: t.ink,
      fontFamily: baseFont, position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 48, borderBottom: `2px solid ${t.ink}`, padding: '0 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <div style={{ fontFamily: serifFont, fontWeight: 700, fontSize: 20 }}>AgentDeck</div>
          <div style={{ fontFamily: monoFont, fontSize: 11, color: t.ink3 }}>14:32 · {sessions.length}</div>
        </div>
        {isAwait && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', border: `2px solid ${variant === 'color' ? t.hi : t.ink}`,
            fontFamily: monoFont, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            color: variant === 'color' ? t.hi : t.ink,
          }}>
            {stateGlyph('AWAIT', 10, variant === 'color' ? t.hi : t.ink)} ATTN
          </div>
        )}
      </div>

      {/* sessions strip */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${t.ink}`, overflow: 'hidden' }}>
        {sessions.slice(0, 5).map((s, i) => {
          const f = i === focusIdx;
          return (
            <div key={i} style={{
              flex: 1, padding: '8px 6px',
              borderRight: i < Math.min(sessions.length, 5) - 1 ? `1px solid ${t.rule}` : 'none',
              background: f ? t.ink : 'transparent',
              color: f ? t.paper : t.ink,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <Creature kind={s.agent} size={20} color={f ? t.paper : (variant === 'color' ? creatureColor(s.agent, t) : t.ink)}/>
              <div style={{ fontFamily: baseFont, fontSize: 10, fontWeight: 600, color: f ? t.paper : t.ink, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%', textOverflow: 'ellipsis' }}>
                {s.name.replace(/^[a-z]+ · /, '')}
              </div>
              <div style={{ fontFamily: monoFont, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                color: f ? t.paper : (s.state === 'AWAIT' ? (variant === 'color' ? t.hi : t.ink) : s.state === 'PROC' ? (variant === 'color' ? t.ok : t.ink) : t.ink3) }}>
                {s.state}
              </div>
            </div>
          );
        })}
      </div>

      <FocusCard t={t} variant={variant} session={focus}/>
      {isAwait && <AttentionZone t={t} variant={variant} session={focus}/>}

      <Terrarium t={t} variant={variant} sessions={sessions} focusIdx={focusIdx} attentionId={sc.attentionId} compact={isAwait}/>

      <div style={{ padding: '8px 16px', borderBottom: `2px solid ${t.ink}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ fontFamily: monoFont, fontSize: 10, color: t.ink3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>5h · ↻ 2h 14m</div>
          <div style={{ fontFamily: monoFont, fontSize: 18, fontWeight: 700 }}>62%</div>
          <BlockBar pct={62} t={t} height={10}/>
        </div>
        <div>
          <div style={{ fontFamily: monoFont, fontSize: 10, color: t.ink3, letterSpacing: '0.12em', textTransform: 'uppercase' }}>7d · ↻ 4d 08h</div>
          <div style={{ fontFamily: monoFont, fontSize: 18, fontWeight: 700 }}>34%</div>
          <BlockBar pct={34} t={t} height={10}/>
        </div>
      </div>

      <div style={{ padding: '6px 16px 12px', flex: 1, fontFamily: monoFont, fontSize: 11, lineHeight: 1.5, color: t.ink2, overflow: 'hidden' }}>
        <div style={{ fontFamily: monoFont, fontSize: 10, letterSpacing: '0.14em', color: t.ink3, textTransform: 'uppercase', marginBottom: 2 }}>Timeline</div>
        <div><span style={{ color: t.ink3 }}>14:31</span> · {focus?.name}</div>
        <div><span style={{ color: t.ink3 }}>14:32</span> ▶ {focus?.tool || '—'}</div>
      </div>
    </div>
  );
}

Object.assign(window, {
  EinkScreen, EinkScreenPortrait, tokensBW, tokensColor, SCENARIOS,
});
