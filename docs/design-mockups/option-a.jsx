// Option A: Aquarium Control Tower
// Metaphor: a vertical tank. Sessions live in water zones (attention / processing / calm floor)
// with creature icons. Services shown as a connection diagram (bridge → models).
// Devices shown as a radial topology around a central hub.

const { Creature } = window;

function OptionA({ scenario }) {
  const { AGENTS, STATE_COLOR, STATE_LABEL, SCENARIOS, SERVICES, RATE_LIMITS, DEVICES } = window.AD;
  const sessions = SCENARIOS[scenario] || [];
  const attn = sessions.filter(s => s.state === 'awaiting');
  const proc = sessions.filter(s => s.state === 'processing');
  const idle = sessions.filter(s => s.state === 'idle' || s.state === 'disconnected');

  return (
    <div style={{
      width: 360, height: 600,
      background: 'linear-gradient(180deg, #0a1a2a 0%, #0a1520 50%, #061018 100%)',
      color: '#d8e4ef',
      fontFamily: '-apple-system, "SF Pro", sans-serif',
      fontSize: 12,
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      boxShadow: '0 18px 60px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(255,255,255,0.08)',
    }}>
      {/* animated caustics */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(ellipse 400px 80px at 50% 0%, rgba(80,180,255,0.12), transparent), radial-gradient(ellipse 300px 120px at 20% 100%, rgba(60,220,200,0.08), transparent)',
        pointerEvents: 'none',
      }}/>

      {/* header */}
      <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
        <AquariumLogo />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>AgentDeck</div>
          <div style={{ fontSize: 10, color: '#7a8a9c', display: 'flex', gap: 6 }}>
            <span>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
            {proc.length > 0 && <span style={{ color: STATE_COLOR.processing }}>· {proc.length} active</span>}
            {attn.length > 0 && <span style={{ color: STATE_COLOR.awaiting }}>· {attn.length} attention</span>}
          </div>
        </div>
        <StatusPill color="#52D988" label=":9120" />
      </div>

      {/* tank zones */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 0' }}>
        {/* attention zone */}
        {attn.length > 0 && (
          <TankZone kind="attention" title="ATTENTION" color={STATE_COLOR.awaiting}>
            {attn.map(s => <AttentionCard key={s.id} session={s} />)}
          </TankZone>
        )}
        {sessions.length === 0 && <EmptyTank />}

        {/* swimming zone */}
        {proc.length > 0 && (
          <TankZone kind="swim" title="SWIMMING" color={STATE_COLOR.processing}>
            {proc.map(s => <SwimRow key={s.id} session={s} />)}
          </TankZone>
        )}

        {/* floor zone */}
        {idle.length > 0 && (
          <TankZone kind="floor" title="RESTING" color={STATE_COLOR.idle}>
            <div style={{ display: 'flex', gap: 10, padding: '4px 4px 8px' }}>
              {idle.map(s => <FloorChip key={s.id} session={s} />)}
            </div>
          </TankZone>
        )}

        {/* Gateway diagram */}
        <SectionLabel>AgentDeck → MODELS</SectionLabel>
        <GatewayDiagram />

        {/* Rate limits */}
        <SectionLabel>RATE LIMITS</SectionLabel>
        <RateLimitRow label="5h" {...RATE_LIMITS.fiveHour} />
        <RateLimitRow label="7d" {...RATE_LIMITS.sevenDay} />

        {/* Devices topology */}
        <SectionLabel>DEVICES · 13 SURFACES</SectionLabel>
        <DeviceTopology />

        <div style={{ height: 8 }} />
      </div>

      {/* action bar */}
      <div style={{
        padding: '8px 10px',
        borderTop: '0.5px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.25)',
        display: 'flex', gap: 6, alignItems: 'center',
      }}>
        <ActionBtn primary label="Launch" />
        <ActionBtn label="Dashboard" />
        <ActionBtn label="Evaluation" />
        <div style={{ flex: 1 }} />
        <IconBtn />
      </div>
    </div>
  );
}

function AquariumLogo() {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: 8,
      background: 'radial-gradient(circle at 30% 30%, #2a6a8a, #0a3a5a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 12px rgba(80,180,255,0.3), inset 0 0 6px rgba(255,255,255,0.2)',
      border: '0.5px solid rgba(120,200,255,0.4)',
    }}>
      <Creature kind="claudecode" size={16} color="#9ad8f0" />
    </div>
  );
}

function StatusPill({ color, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 10,
      background: 'rgba(255,255,255,0.06)',
      border: '0.5px solid rgba(255,255,255,0.1)',
      fontFamily: 'ui-monospace, monospace', fontSize: 10,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }}/>
      <span style={{ color: '#9aa8b8' }}>{label}</span>
    </div>
  );
}

function TankZone({ kind, title, color, children }) {
  const bg = kind === 'attention'
    ? 'linear-gradient(180deg, rgba(255,169,61,0.12), rgba(255,169,61,0.03))'
    : kind === 'swim'
    ? 'linear-gradient(180deg, rgba(62,214,232,0.08), rgba(62,214,232,0.02))'
    : 'linear-gradient(180deg, rgba(82,217,136,0.05), rgba(0,0,0,0.1))';
  return (
    <div style={{
      marginBottom: 8,
      background: bg,
      borderRadius: 10,
      border: `0.5px solid ${color}22`,
      overflow: 'hidden',
      padding: '8px 10px',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
        color, marginBottom: 6,
        fontFamily: 'ui-monospace, monospace',
      }}>{title}</div>
      {children}
    </div>
  );
}

function AttentionCard({ session }) {
  const { AGENTS } = window.AD;
  const a = AGENTS[session.agent];
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255,169,61,0.18), rgba(255,169,61,0.05))',
      border: '0.5px solid rgba(255,169,61,0.4)',
      borderRadius: 8,
      padding: 10,
      marginBottom: 6,
      position: 'relative',
      animation: 'glowPulse 2s ease-in-out infinite',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ filter: 'drop-shadow(0 0 4px rgba(255,169,61,0.5))' }}>
          <Creature kind={a.creature} size={22} color={a.color} animate state="awaiting" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{session.project}</div>
          <div style={{ fontSize: 10, color: '#d8e4ef99' }}>{a.label} · {session.model}</div>
        </div>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
          color: '#FFA93D', fontFamily: 'ui-monospace, monospace',
        }}>{session.started}</div>
      </div>
      <div style={{
        fontSize: 11, color: '#ffd89e', padding: '6px 8px',
        background: 'rgba(0,0,0,0.3)', borderRadius: 6,
        fontFamily: 'ui-monospace, monospace',
      }}>? {session.attention}</div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <MiniBtn color="#52D988">YES</MiniBtn>
        <MiniBtn color="#FF6B6B">NO</MiniBtn>
        <MiniBtn color="#3ED6E8">ALWAYS</MiniBtn>
      </div>
    </div>
  );
}

function SwimRow({ session }) {
  const { AGENTS } = window.AD;
  const a = AGENTS[session.agent];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 4px', cursor: 'pointer',
    }}>
      <div style={{ filter: 'drop-shadow(0 0 3px rgba(62,214,232,0.4))' }}>
        <Creature kind={a.creature} size={20} color={a.color} animate state="processing" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.project}</div>
        <div style={{ fontSize: 10, color: '#7a8a9c', fontFamily: 'ui-monospace, monospace' }}>
          {a.label} · {session.tool || '…'}
        </div>
      </div>
      <div style={{ fontSize: 9, color: '#3ED6E8', fontFamily: 'ui-monospace, monospace' }}>{session.started}</div>
    </div>
  );
}

function FloorChip({ session }) {
  const { AGENTS } = window.AD;
  const a = AGENTS[session.agent];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      padding: '4px 2px',
    }}>
      <Creature kind={a.creature} size={20} color={a.color} animate state="idle" />
      <div style={{ fontSize: 9, color: '#7a8a9c', maxWidth: 60, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {session.project}
      </div>
    </div>
  );
}

function EmptyTank() {
  return (
    <div style={{
      padding: '40px 20px', textAlign: 'center',
      border: '0.5px dashed rgba(255,255,255,0.12)',
      borderRadius: 10, margin: '10px 0',
    }}>
      <div style={{ fontSize: 22, marginBottom: 6, opacity: 0.3 }}>∅</div>
      <div style={{ fontSize: 11, color: '#7a8a9c', marginBottom: 10 }}>The tank is quiet.</div>
      <button style={{
        background: 'rgba(62,214,232,0.12)', color: '#3ED6E8',
        border: '0.5px solid rgba(62,214,232,0.4)',
        borderRadius: 6, padding: '5px 12px', fontSize: 11,
        fontFamily: 'inherit', cursor: 'pointer',
      }}>▶ Launch a session</button>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
      color: '#556675', marginTop: 12, marginBottom: 6,
      fontFamily: 'ui-monospace, monospace',
    }}>{children}</div>
  );
}

function GatewayDiagram() {
  const { SERVICES } = window.AD;
  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)', border: '0.5px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: 10,
    }}>
      <svg viewBox="0 0 320 110" style={{ width: '100%', height: 110 }}>
        <defs>
          <linearGradient id="flow" x1="0" x2="1">
            <stop offset="0" stopColor="#3ED6E8" stopOpacity="0.1"/>
            <stop offset="0.5" stopColor="#3ED6E8" stopOpacity="0.6"/>
            <stop offset="1" stopColor="#3ED6E8" stopOpacity="0.1"/>
          </linearGradient>
        </defs>
        {/* AgentDeck hub node */}
        <circle cx="60" cy="55" r="24" fill="#0a2030" stroke="#3ED6E8" strokeWidth="1"/>
        <foreignObject x="48" y="35" width="24" height="16">
          <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 16 }}>
            <Creature kind="claudecode" size={14} color="#3ED6E8" />
          </div>
        </foreignObject>
        <text x="60" y="62" textAnchor="middle" fill="#d8e4ef" fontSize="8" fontWeight="600">AgentDeck</text>
        <text x="60" y="72" textAnchor="middle" fill="#7a8a9c" fontSize="7.5" fontFamily="ui-monospace, monospace">:9120</text>

        {SERVICES.map((svc, i) => {
          const y = 12 + i * 24;
          const color = svc.status === 'ok' ? '#52D988' : svc.status === 'warn' ? '#FFA93D' : '#FF6B6B';
          return (
            <g key={svc.key}>
              <line x1="82" y1="55" x2="170" y2={y + 8} stroke="url(#flow)" strokeWidth="1" />
              <circle cx="170" cy={y + 8} r="3" fill={color}/>
              <text x="178" y={y + 11} fill="#d8e4ef" fontSize="10" fontWeight="600">{svc.label}</text>
              <text x="220" y={y + 11} fill="#7a8a9c" fontSize="9" fontFamily="ui-monospace, monospace">{svc.detail.length > 22 ? svc.detail.slice(0,22)+'…' : svc.detail}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RateLimitRow({ label, pct, resetIn, trend }) {
  const color = pct >= 90 ? '#FF6B6B' : pct >= 70 ? '#FFA93D' : '#52D988';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
      <div style={{ width: 22, fontSize: 10, color: '#7a8a9c', fontFamily: 'ui-monospace, monospace' }}>{label}</div>
      <div style={{
        flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative',
      }}>
        <div style={{ width: pct+'%', height: '100%', background: color, boxShadow: `0 0 6px ${color}66` }}/>
      </div>
      <div style={{ fontSize: 10, color, fontFamily: 'ui-monospace, monospace', width: 30, textAlign: 'right' }}>{pct}%</div>
      <div style={{ fontSize: 10, color: '#7a8a9c', fontFamily: 'ui-monospace, monospace', width: 48, textAlign: 'right' }}>{resetIn}</div>
    </div>
  );
}

function DeviceTopology() {
  const { DEVICES } = window.AD;
  // radial layout around a hub
  const size = 320, cx = size/2, cy = 90;
  const radius = 70;
  return (
    <div style={{
      background: 'rgba(0,0,0,0.3)', border: '0.5px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: 10, overflow: 'hidden',
    }}>
      <svg viewBox={`0 0 ${size} 180`} style={{ width: '100%', height: 180 }}>
        <defs>
          <radialGradient id="hub">
            <stop offset="0" stopColor="#3ED6E8" stopOpacity="0.4"/>
            <stop offset="1" stopColor="#3ED6E8" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r="40" fill="url(#hub)"/>
        <circle cx={cx} cy={cy} r="14" fill="#0a2030" stroke="#3ED6E8" strokeWidth="1"/>
        <text x={cx} y={cy+3} textAnchor="middle" fill="#3ED6E8" fontSize="8" fontFamily="ui-monospace, monospace" fontWeight="700">HUB</text>

        {DEVICES.map((d, i) => {
          const angle = (i / DEVICES.length) * Math.PI * 2 - Math.PI/2;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          const color = d.status === 'connected' ? '#52D988' : d.status === 'reconnecting' ? '#FFA93D' : '#6E7078';
          return (
            <g key={d.kind}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeOpacity="0.3" strokeWidth="0.7" strokeDasharray={d.status === 'reconnecting' ? '2 2' : ''}/>
              <circle cx={x} cy={y} r="5" fill={color} opacity="0.9"/>
              <circle cx={x} cy={y} r="5" fill="none" stroke={color} strokeOpacity="0.4" strokeWidth="1"/>
              <text x={x} y={y + (y > cy ? 14 : -8)} textAnchor="middle" fill="#d8e4ef" fontSize="8">{d.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ActionBtn({ label, primary }) {
  return (
    <button style={{
      background: primary ? 'rgba(62,214,232,0.18)' : 'rgba(255,255,255,0.06)',
      color: primary ? '#3ED6E8' : '#d8e4ef',
      border: primary ? '0.5px solid rgba(62,214,232,0.5)' : '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 500,
      fontFamily: 'inherit', cursor: 'pointer',
    }}>{label}</button>
  );
}

function IconBtn() {
  return (
    <button style={{
      background: 'rgba(255,255,255,0.06)', color: '#d8e4ef',
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 8, width: 32, height: 30,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit', cursor: 'pointer', padding: 0,
    }}>
      <GearIcon size={16} />
    </button>
  );
}

function MiniBtn({ color, children }) {
  return (
    <button style={{
      background: `${color}22`, color,
      border: `0.5px solid ${color}66`,
      borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700,
      letterSpacing: 0.5, fontFamily: 'ui-monospace, monospace', cursor: 'pointer',
    }}>{children}</button>
  );
}

window.OptionA = OptionA;
