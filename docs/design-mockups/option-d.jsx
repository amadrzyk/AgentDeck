// Option D: Unified Graph Dock
// - C-style attention theater at top with interactive YES/NO/ALWAYS that actually dispatch
// - Single unified graph: Bridge hub at center, Models on left, Sessions as creatures between,
//   Devices as a ring around. One view, one topology.
// - Clicking a session reveals a "Jump to…" chooser: iTerm tab, VSCode, Cursor, Stream Deck focus.

const { Creature: CreatureD } = window;

function OptionD({ scenario }) {
  const { AGENTS, STATE_COLOR, SCENARIOS, SERVICES, RATE_LIMITS, DEVICES } = window.AD;
  const sessions = SCENARIOS[scenario] || [];
  const [attnList, setAttnList] = React.useState(sessions.filter(s => s.state === 'awaiting'));
  const [jumpFor, setJumpFor] = React.useState(null); // sessionId
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    setAttnList(sessions.filter(s => s.state === 'awaiting'));
    setJumpFor(null);
  }, [scenario]);

  const featured = attnList[0];
  const remaining = sessions.filter(s => !(featured && s.id === featured.id));

  const respond = (choice) => {
    if (!featured) return;
    setToast(`${choice} → ${featured.project}`);
    setTimeout(() => setToast(null), 1400);
    setAttnList(attnList.slice(1));
  };

  const jump = (session, target) => {
    setToast(`${target} · ${session.project}`);
    setTimeout(() => setToast(null), 1400);
    setJumpFor(null);
  };

  return (
    <div style={{
      width: 380, height: 620,
      background: '#f6f3ee',
      color: '#1a1a1f',
      fontFamily: '-apple-system, "SF Pro", sans-serif',
      fontSize: 12,
      borderRadius: 14,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 18px 60px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(0,0,0,0.08)',
      position: 'relative',
    }}>
      {featured ? (
        <AttentionTheaterD session={featured} onRespond={respond} />
      ) : (
        <CalmHeaderD count={sessions.length} proc={sessions.filter(s=>s.state==='processing').length} />
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        <SectionTitle>Sessions</SectionTitle>
        {sessions.length === 0 ? (
          <div style={{ padding: '18px 6px', textAlign: 'center', color: '#7a7a82' }}>
            <div style={{ fontSize: 11 }}>No sessions running</div>
            <button style={launchBtnStyle}>▶ Launch session</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {remaining.map(s => (
              <SessionRowD
                key={s.id}
                session={s}
                open={jumpFor === s.id}
                onToggle={() => setJumpFor(jumpFor === s.id ? null : s.id)}
                onJump={(t) => jump(s, t)}
              />
            ))}
          </div>
        )}

        <SectionTitle>Topology</SectionTitle>
        <UnifiedGraph sessions={sessions} />

        <SectionTitle>Rate Limits</SectionTitle>
        <RateRowD label="5h" {...RATE_LIMITS.fiveHour} />
        <RateRowD label="7d" {...RATE_LIMITS.sevenDay} />
      </div>

      <div style={{
        padding: '8px 12px',
        borderTop: '0.5px solid rgba(0,0,0,0.08)',
        background: 'rgba(255,255,255,0.7)',
        display: 'flex', gap: 6, alignItems: 'center',
      }}>
        <PillBtnD primary>Launch</PillBtnD>
        <PillBtnD>Dashboard</PillBtnD>
        <PillBtnD>Evaluation</PillBtnD>
        <div style={{ flex: 1 }} />
        <PillBtnD icon><GearIcon size={15} color="#1a1a1f" /></PillBtnD>
      </div>

      {toast && (
        <div style={{
          position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1f', color: 'white',
          padding: '6px 12px', borderRadius: 8, fontSize: 11,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s',
        }}>{toast}</div>
      )}
    </div>
  );
}

function AttentionTheaterD({ session, onRespond }) {
  const { AGENTS } = window.AD;
  const a = AGENTS[session.agent];
  return (
    <div style={{
      padding: '14px',
      background: 'linear-gradient(135deg, #FFE9C7 0%, #FFD9A0 100%)',
      borderBottom: '0.5px solid rgba(0,0,0,0.08)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -30, right: -30, width: 140, height: 140,
        background: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent)',
      }}/>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
        <div style={{
          width: 54, height: 54, borderRadius: 14,
          background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          animation: 'breathe 1.8s ease-in-out infinite',
          flexShrink: 0,
        }}>
          <CreatureD kind={a.creature} size={38} color={a.color} animate state="awaiting" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, color: '#8a6a20', letterSpacing: 1.2, fontWeight: 700 }}>NEEDS ATTENTION</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{session.project}</div>
          <div style={{ fontSize: 10.5, color: '#6a5a30', marginTop: 1 }}>{a.label} · {session.model} · {session.started}</div>
          <div style={{
            marginTop: 8, padding: '7px 10px',
            background: 'rgba(255,255,255,0.75)',
            borderRadius: 8, fontSize: 12, color: '#1a1a1f', lineHeight: 1.4,
          }}>{session.attention}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <BigBtnD bg="#1a9d4a" onClick={() => onRespond('YES')} label="Yes" hint="⌘Y" />
        <BigBtnD bg="#c93030" onClick={() => onRespond('NO')} label="No" hint="⌘N" />
        <BigBtnD bg="#2a6fd8" onClick={() => onRespond('ALWAYS')} label="Always" hint="⌘A" />
      </div>
    </div>
  );
}

function CalmHeaderD({ count, proc }) {
  return (
    <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'linear-gradient(135deg, #0a6a8a, #0a3a5a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CreatureD kind="claudecode" size={18} color="#9ad8f0" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>All calm</div>
        <div style={{ fontSize: 10, color: '#7a7a82' }}>
          {count} session{count !== 1 ? 's' : ''}{proc > 0 ? ` · ${proc} active` : ''}
        </div>
      </div>
      <div style={{
        fontSize: 10, color: '#1a9d4a', padding: '3px 8px',
        background: 'rgba(82,217,136,0.15)', borderRadius: 10, fontFamily: 'ui-monospace, monospace',
      }}>● :9120</div>
    </div>
  );
}

function SessionRowD({ session, open, onToggle, onJump }) {
  const { AGENTS, STATE_COLOR, STATE_LABEL } = window.AD;
  const a = AGENTS[session.agent];
  const color = STATE_COLOR[session.state];
  const targets = [
    { id: 'iterm',    label: 'iTerm2',       icon: '▣' },
    { id: 'vscode',   label: 'VS Code',      icon: '⌗' },
    { id: 'cursor',   label: 'Cursor',       icon: '↗' },
    { id: 'dash',     label: 'Dashboard',    icon: '◰' },
    { id: 'finder',   label: 'Reveal folder',icon: '📁' },
  ];
  return (
    <div style={{
      background: open ? 'rgba(0,0,0,0.04)' : 'white',
      borderRadius: 8,
      border: '0.5px solid rgba(0,0,0,0.06)',
      overflow: 'hidden',
      transition: 'background 0.15s',
    }}>
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', cursor: 'pointer',
      }}>
        <div style={{ position: 'relative' }}>
          <CreatureD kind={a.creature} size={22} color={a.color} animate state={session.state} />
          <div style={{
            position: 'absolute', top: -2, right: -3,
            width: 7, height: 7, borderRadius: '50%', background: color,
            border: '1.5px solid white',
          }}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.project}</div>
          <div style={{ fontSize: 10, color: '#7a7a82', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {a.label} · {session.model}
            {session.tool ? ` · ${session.tool}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 9.5, color: '#7a7a82', fontFamily: 'ui-monospace, monospace' }}>{session.started}</div>
        <div style={{
          fontSize: 10, color: '#7a7a82',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
        }}>›</div>
      </div>
      {open && (
        <div style={{
          padding: '4px 8px 8px', borderTop: '0.5px solid rgba(0,0,0,0.05)',
        }}>
          <div style={{ fontSize: 9.5, color: '#9a9aa2', padding: '3px 4px 5px', letterSpacing: 0.5 }}>JUMP TO</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {targets.map(t => (
              <button key={t.id} onClick={(e) => { e.stopPropagation(); onJump(t.label); }} style={{
                background: 'white',
                border: '0.5px solid rgba(0,0,0,0.08)',
                borderRadius: 6,
                padding: '6px 2px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span style={{ fontSize: 13 }}>{t.icon}</span>
                <span style={{ fontSize: 9, color: '#4a4a52' }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UnifiedGraph({ sessions }) {
  const { AGENTS, SERVICES, DEVICES, STATE_COLOR } = window.AD;
  // Single view: left column = models/services, center = bridge hub,
  // right of hub = sessions (creatures), ring around = devices.
  const W = 340, H = 280;
  const bridge = { x: W/2, y: H/2 };

  const modelPts = SERVICES.map((s, i) => ({
    ...s,
    x: 34,
    y: 42 + i * ((H - 80) / Math.max(SERVICES.length - 1, 1)),
  }));

  const sessionPts = sessions.slice(0, 6).map((s, i, arr) => {
    const angle = (-Math.PI / 3) + (i / Math.max(arr.length - 1, 1)) * (2 * Math.PI / 3);
    const r = 72;
    return { ...s, x: bridge.x + Math.cos(angle) * r * 0.7 + 20, y: bridge.y + Math.sin(angle) * r };
  });

  // device ring around bridge
  const devicePts = DEVICES.map((d, i) => {
    const angle = (i / DEVICES.length) * Math.PI * 2 - Math.PI/2;
    const rx = 130, ry = 110;
    return { ...d, x: bridge.x + Math.cos(angle) * rx, y: bridge.y + Math.sin(angle) * ry };
  });

  return (
    <div style={{
      background: 'white', borderRadius: 10,
      border: '0.5px solid rgba(0,0,0,0.06)',
      padding: 4, marginBottom: 10, overflow: 'hidden',
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
        <defs>
          <radialGradient id="hubAura">
            <stop offset="0" stopColor="#3ED6E8" stopOpacity="0.25"/>
            <stop offset="1" stopColor="#3ED6E8" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="flowL" x1="0" x2="1">
            <stop offset="0" stopColor="#3ED6E8" stopOpacity="0.1"/>
            <stop offset="1" stopColor="#3ED6E8" stopOpacity="0.4"/>
          </linearGradient>
        </defs>

        {/* device ring guide */}
        <ellipse cx={bridge.x} cy={bridge.y} rx="130" ry="110" fill="none" stroke="rgba(0,0,0,0.05)" strokeDasharray="2 3"/>

        {/* hub aura */}
        <circle cx={bridge.x} cy={bridge.y} r="36" fill="url(#hubAura)"/>

        {/* model → AgentDeck */}
        {modelPts.map((m) => (
          <line key={m.key} x1={m.x + 4} y1={m.y} x2={bridge.x - 18} y2={bridge.y}
            stroke="url(#flowL)" strokeWidth="1" />
        ))}

        {/* AgentDeck → session */}
        {sessionPts.map((s) => {
          const a = AGENTS[s.agent];
          const active = s.state === 'processing' || s.state === 'awaiting';
          return (
            <line key={s.id} x1={bridge.x + 18} y1={bridge.y} x2={s.x} y2={s.y}
              stroke={a.color} strokeOpacity={active ? 0.6 : 0.2}
              strokeWidth={active ? 1.3 : 0.8}
              strokeDasharray={s.state === 'awaiting' ? '3 2' : ''}
            />
          );
        })}

        {/* device spokes */}
        {devicePts.map((d) => {
          const color = d.status === 'connected' ? '#52D988' : d.status === 'reconnecting' ? '#FFA93D' : '#9a9aa2';
          return (
            <line key={d.kind} x1={bridge.x} y1={bridge.y} x2={d.x} y2={d.y}
              stroke={color} strokeOpacity="0.18" strokeWidth="0.6"
              strokeDasharray={d.status === 'reconnecting' ? '2 2' : ''}
            />
          );
        })}

        {/* model nodes */}
        {modelPts.map((m) => {
          const c = m.status === 'ok' ? '#52D988' : m.status === 'warn' ? '#FFA93D' : '#FF6B6B';
          return (
            <g key={m.key}>
              <circle cx={m.x} cy={m.y} r="3.5" fill={c}/>
              <text x={m.x + 8} y={m.y + 3} fontSize="9" fill="#4a4a52" fontWeight="600">{m.label}</text>
            </g>
          );
        })}

        {/* device nodes */}
        {devicePts.map((d) => {
          const color = d.status === 'connected' ? '#52D988' : d.status === 'reconnecting' ? '#FFA93D' : '#9a9aa2';
          return (
            <g key={d.kind}>
              <circle cx={d.x} cy={d.y} r="3" fill={color}/>
              <text x={d.x} y={d.y + (d.y > bridge.y ? 11 : -6)} fontSize="7.5" fill="#7a7a82" textAnchor="middle">{d.name.split(' ')[0]}</text>
            </g>
          );
        })}

        {/* AgentDeck hub node */}
        <circle cx={bridge.x} cy={bridge.y} r="18" fill="#0a2030" stroke="#3ED6E8" strokeWidth="1"/>
        <foreignObject x={bridge.x - 8} y={bridge.y - 11} width="16" height="12">
          <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 12 }}>
            <CreatureD kind="claudecode" size={11} color="#3ED6E8" />
          </div>
        </foreignObject>
        <text x={bridge.x} y={bridge.y + 5} textAnchor="middle" fill="#d8e4ef" fontSize="6.5" fontWeight="600">AgentDeck</text>
        <text x={bridge.x} y={bridge.y + 13} textAnchor="middle" fill="#7a8a9c" fontSize="6" fontFamily="ui-monospace, monospace">:9120</text>

        {/* session creatures overlaid as foreignObject */}
        {sessionPts.map((s) => {
          const a = AGENTS[s.agent];
          const dot = STATE_COLOR[s.state];
          return (
            <g key={s.id}>
              <foreignObject x={s.x - 11} y={s.y - 11} width="22" height="22">
                <div xmlns="http://www.w3.org/1999/xhtml">
                  <CreatureD kind={a.creature} size={22} color={a.color} animate state={s.state}/>
                </div>
              </foreignObject>
              <circle cx={s.x + 8} cy={s.y - 8} r="3" fill={dot} stroke="white" strokeWidth="1"/>
              <text x={s.x} y={s.y + 20} fontSize="7.5" fill="#4a4a52" textAnchor="middle">{s.project.slice(0, 10)}</text>
            </g>
          );
        })}

        {/* legend */}
        <g>
          <text x="6" y="12" fontSize="8" fill="#9a9aa2" fontWeight="700" letterSpacing="1">MODELS</text>
          <text x={W - 6} y="12" fontSize="8" fill="#9a9aa2" fontWeight="700" letterSpacing="1" textAnchor="end">DEVICES · SESSIONS</text>
        </g>
      </svg>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
      color: '#7a7a82', marginBottom: 6, marginTop: 10,
      textTransform: 'uppercase',
    }}>{children}</div>
  );
}

function RateRowD({ label, pct, resetIn }) {
  const color = pct >= 90 ? '#c93030' : pct >= 70 ? '#d88930' : '#1a9d4a';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <div style={{ width: 22, fontSize: 11, color: '#7a7a82', fontFamily: 'ui-monospace, monospace' }}>{label}</div>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ width: pct+'%', height: '100%', background: color }}/>
      </div>
      <div style={{ fontSize: 10, color, fontFamily: 'ui-monospace, monospace', width: 30, textAlign: 'right' }}>{pct}%</div>
      <div style={{ fontSize: 10, color: '#9a9aa2', width: 44, textAlign: 'right' }}>{resetIn}</div>
    </div>
  );
}

function BigBtnD({ bg, label, hint, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, background: bg, color: 'white',
      border: 'none', borderRadius: 8,
      padding: '9px 6px',
      fontSize: 13, fontWeight: 600,
      fontFamily: 'inherit', cursor: 'pointer',
      boxShadow: `0 2px 6px ${bg}55`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    }}>
      <span>{label}</span>
      <span style={{ fontSize: 9, opacity: 0.8, fontFamily: 'ui-monospace, monospace' }}>{hint}</span>
    </button>
  );
}

function PillBtnD({ children, primary, icon }) {
  return (
    <button style={{
      background: primary ? '#1a1a1f' : 'rgba(0,0,0,0.05)',
      color: primary ? 'white' : '#1a1a1f',
      border: 'none', borderRadius: 14,
      padding: icon ? '6px 9px' : '5px 11px',
      fontSize: 11, fontWeight: 500,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'inherit', cursor: 'pointer',
    }}>{children}</button>
  );
}

const launchBtnStyle = {
  marginTop: 8,
  background: '#1a1a1f', color: 'white',
  border: 'none', borderRadius: 6,
  padding: '5px 12px', fontSize: 11,
  fontFamily: 'inherit', cursor: 'pointer',
};

window.OptionD = OptionD;
