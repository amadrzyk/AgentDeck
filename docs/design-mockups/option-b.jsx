// Option B: Signal Tower
// Metaphor: a radar/HUD console. Monospace, terminal-like, with
// a central scope showing sessions as blips; services as a signal stack;
// devices as a mesh graph.

const { Creature: CreatureB } = window;

function OptionB({ scenario }) {
  const { AGENTS, STATE_COLOR, SCENARIOS, SERVICES, RATE_LIMITS, DEVICES } = window.AD;
  const sessions = SCENARIOS[scenario] || [];
  const attn = sessions.filter(s => s.state === 'awaiting');
  const proc = sessions.filter(s => s.state === 'processing');
  const idle = sessions.filter(s => s.state === 'idle');

  return (
    <div style={{
      width: 360, height: 600,
      background: '#0c0d10',
      backgroundImage: 'radial-gradient(circle at 50% 20%, #141820 0%, #0c0d10 70%)',
      color: '#c8d0d8',
      fontFamily: 'ui-monospace, "SF Mono", monospace',
      fontSize: 11,
      borderRadius: 10,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 18px 60px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.06)',
      position: 'relative',
    }}>
      {/* scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.01) 0, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 3px)',
        pointerEvents: 'none',
      }}/>

      {/* chrome header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <Dot c="#FF6B6B"/><Dot c="#FFA93D"/><Dot c="#52D988"/>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 10, letterSpacing: 1, color: '#7a8493' }}>
          AGENTDECK · CTRL
        </div>
        <div style={{ fontSize: 9, color: '#52D988' }}>◉ LIVE</div>
      </div>

      {/* data grid */}
      <div style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <Stat label="SESS" value={sessions.length} />
          <Stat label="PROC" value={proc.length} color="#3ED6E8" />
          <Stat label="ATTN" value={attn.length} color={attn.length ? '#FFA93D' : '#3a3f48'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SparkBar label="5H" pct={RATE_LIMITS.fiveHour.pct} />
          <SparkBar label="7D" pct={RATE_LIMITS.sevenDay.pct} />
        </div>
      </div>

      {/* sessions list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        <SigLabel text="SESSIONS" />
        {sessions.length === 0 && (
          <div style={{ padding: '20px 10px', textAlign: 'center', color: '#4a5060' }}>
            <div style={{ fontSize: 10, marginBottom: 6 }}>── NO SIGNAL ──</div>
            <button style={{
              background: 'transparent', color: '#3ED6E8',
              border: '0.5px solid #3ED6E866', padding: '4px 10px',
              fontFamily: 'inherit', fontSize: 10, cursor: 'pointer',
            }}>[ LAUNCH ]</button>
          </div>
        )}
        {sessions.map(s => <SigRow key={s.id} session={s} />)}

        <SigLabel text="SERVICES" />
        {SERVICES.map(svc => <ServiceLine key={svc.key} svc={svc} />)}

        <SigLabel text="MESH · 13 SURFACES" />
        <MeshGraph />
      </div>

      {/* command bar */}
      <div style={{
        padding: '6px 12px',
        background: '#000',
        borderTop: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: '#52D988' }}>&gt;</span>
        <span style={{ flex: 1, color: '#7a8493', fontSize: 10 }}>launch · dash · eval · stop · settings</span>
        <CmdKey>⌘L</CmdKey>
      </div>
    </div>
  );
}

function Dot({ c }) {
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}` }}/>;
}

function Stat({ label, value, color = '#c8d0d8' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '0.5px solid rgba(255,255,255,0.06)',
      padding: '6px 8px',
      borderRadius: 3,
    }}>
      <div style={{ fontSize: 9, color: '#4a5060', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color, lineHeight: 1 }}>{String(value).padStart(2, '0')}</div>
    </div>
  );
}

function SparkBar({ label, pct }) {
  const color = pct >= 90 ? '#FF6B6B' : pct >= 70 ? '#FFA93D' : '#52D988';
  const bars = 14;
  const filled = Math.round((pct / 100) * bars);
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '0.5px solid rgba(255,255,255,0.06)',
      padding: '6px 8px',
      borderRadius: 3,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#4a5060', marginBottom: 3 }}>
        <span style={{ letterSpacing: 1 }}>{label}</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ display: 'flex', gap: 1.5 }}>
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 8,
            background: i < filled ? color : '#1a1d24',
            boxShadow: i < filled ? `0 0 3px ${color}` : 'none',
          }}/>
        ))}
      </div>
    </div>
  );
}

function SigLabel({ text }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 9, color: '#4a5060', letterSpacing: 1.5,
      marginTop: 10, marginBottom: 4,
    }}>
      <span>{text}</span>
      <div style={{ flex: 1, height: 0.5, background: 'rgba(255,255,255,0.08)' }}/>
    </div>
  );
}

function SigRow({ session }) {
  const { AGENTS, STATE_COLOR } = window.AD;
  const a = AGENTS[session.agent];
  const color = STATE_COLOR[session.state];
  const glyph = session.state === 'awaiting' ? '?' : session.state === 'processing' ? '◉' : '·';
  const prefix = session.state === 'awaiting' ? 'ATTN' : session.state === 'processing' ? 'PROC' : 'IDLE';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 6px',
      marginBottom: 2,
      borderLeft: `2px solid ${color}`,
      background: session.state === 'awaiting' ? 'rgba(255,169,61,0.08)' : 'transparent',
      cursor: 'pointer',
      animation: session.state === 'awaiting' ? 'attnPulse 1.6s infinite' : 'none',
    }}>
      <span style={{ color, width: 10, textAlign: 'center', fontSize: 10 }}>{glyph}</span>
      <span style={{ color, fontSize: 9, width: 30 }}>{prefix}</span>
      <CreatureB kind={a.creature} size={14} color={a.color} animate state={session.state}/>
      <span style={{ color: '#c8d0d8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {session.project}
      </span>
      <span style={{ color: '#7a8493', fontSize: 9 }}>{session.model}</span>
      <span style={{ color: '#4a5060', fontSize: 9, width: 26, textAlign: 'right' }}>{session.started}</span>
    </div>
  );
}

function ServiceLine({ svc }) {
  const color = svc.status === 'ok' ? '#52D988' : svc.status === 'warn' ? '#FFA93D' : '#FF6B6B';
  return (
    <div style={{ display: 'flex', gap: 6, padding: '3px 6px', fontSize: 10 }}>
      <span style={{ color, width: 8 }}>{svc.status === 'ok' ? '●' : svc.status === 'warn' ? '◐' : '○'}</span>
      <span style={{ color: '#c8d0d8', width: 70 }}>{svc.label}</span>
      <span style={{ color: '#7a8493', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.detail}</span>
    </div>
  );
}

function MeshGraph() {
  const { DEVICES } = window.AD;
  const w = 320, h = 110;
  const nodes = DEVICES.map((d, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    return { ...d, x: 30 + col * 80, y: 20 + row * 35 };
  });
  return (
    <div style={{
      background: 'rgba(0,0,0,0.4)',
      border: '0.5px solid rgba(255,255,255,0.06)',
      padding: 6,
      marginBottom: 8,
    }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h }}>
        {nodes.map((n, i) =>
          nodes.slice(i+1).map((m, j) => (
            <line key={`${i}-${j}`} x1={n.x} y1={n.y} x2={m.x} y2={m.y}
              stroke="#2a3040" strokeWidth="0.3"/>
          ))
        )}
        {nodes.map((n) => {
          const color = n.status === 'connected' ? '#52D988' : n.status === 'reconnecting' ? '#FFA93D' : '#4a5060';
          return (
            <g key={n.kind}>
              <circle cx={n.x} cy={n.y} r="4" fill={color} opacity="0.9"/>
              <circle cx={n.x} cy={n.y} r="4" fill="none" stroke={color} strokeOpacity="0.3"/>
              <text x={n.x} y={n.y + 12} textAnchor="middle" fill="#7a8493" fontSize="7">{n.name.split(' ')[0]}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CmdKey({ children }) {
  return (
    <span style={{
      padding: '1px 5px',
      background: 'rgba(255,255,255,0.05)',
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 2, fontSize: 9, color: '#7a8493',
    }}>{children}</span>
  );
}

window.OptionB = OptionB;
