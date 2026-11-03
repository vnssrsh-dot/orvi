import { useEffect, useRef, useState } from 'react';
import { useStore, streakAlive, streakLost } from '../lib/store.jsx';
import { buildPath, levelPercent, levelUnlocked, nextStep } from '../lib/progress.js';
import { LEVELS, levelInfo } from '../lib/content.js';
import { loc } from '../lib/loc.js';
import { haptic } from '../lib/telegram.js';
import { Mascot, Icon, Bar, Sheet, Tile } from '../components.jsx';

const UNIT_COLORS = ['#8b6fd0', '#e58fb5', '#5fb3c9', '#f0a868', '#7bc08f', '#a08ae0'];
const OFFSETS = [0, 62, 92, 62, 0, -62, -92, -62];

export default function Home({ nav, t, lang }) {
  const { state, update } = useStore();
  const [level, setLevel] = useState(state.currentLevel);
  const [info, setInfo] = useState(null);
  const pct = levelPercent(state, level);
  const prevPct = useRef(pct);
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    if (pct > prevPct.current) { setCheer(true); const id = setTimeout(() => setCheer(false), 1600); prevPct.current = pct; return () => clearTimeout(id); }
  }, [pct]);

  const path = buildPath(state, level);
  const step = nextStep(state, level);
  const streak = streakAlive(state);
  const lost = streakLost(state);
  const name = state.profile.name;

  const openLesson = (unit, lesson) => nav.push({ name: 'lesson', mode: 'lesson', lessonId: lesson.id });
  const openCheckpoint = (unit) => nav.push({ name: 'lesson', mode: 'checkpoint', unitId: unit.id });

  const cont = () => {
    if (!step) return;
    haptic('medium');
    if (step.kind === 'lesson') openLesson(step.unit, step.lesson);
    else if (step.kind === 'checkpoint') openCheckpoint(step.unit);
    else nav.push({ name: 'lesson', mode: 'level', level });
  };

  const daily = state.daily;
  const missions = [
    { label: t('mLesson'), cur: Math.min(daily.lessons, 1), max: 1, icon: 'book' },
    { label: t('mWords'), cur: Math.min(daily.words, 5), max: 5, icon: 'cards' },
    { label: t('mCorrect'), cur: Math.min(daily.correct, 15), max: 15, icon: 'target' },
  ];

  return (
    <div className="screen with-nav">
      <div className="row between">
        <div className="logo" style={{ fontSize: 30 }}>verbora</div>
        <div className="row" style={{ gap: 6 }}>
          <span className="pill" title={t('streak')} style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><span className="ic"><Icon name="flame" size={15} /></span>{streak}</span>
          <span className="pill"><span className="ic"><Icon name="star" size={15} /></span>{state.xp}</span>
          <button className="icon-btn" onClick={() => nav.push({ name: 'settings' })} aria-label={t('settings')}><Icon name="gear" /></button>
        </div>
      </div>

      {/* greeting + level header with mascot holding the percentage (SPEC §4.6) */}
      <div className="card" style={{ background: 'linear-gradient(135deg, var(--surface) 30%, var(--primary-soft))', position: 'relative', overflow: 'hidden' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="col grow" style={{ gap: 4 }}>
            <div className="h3">{name ? t('hiName', { name }) : t('hiAnon')}</div>
            <div className="small">{t('readyToday')}</div>
            <div style={{ height: 10 }} />
            <div className="small">{t('yourLevel')}</div>
            <div className="h3">{level} — {loc(levelInfo(level).title, lang)}</div>
          </div>
          <div style={{ position: 'relative', marginRight: -6, marginTop: -6 }}>
            <Mascot emotion={lost ? 'sad' : cheer ? 'celebration' : pct >= 100 ? 'levelup' : 'idle'} size={104} anim={cheer ? 'bounce' : 'pop'} sparkles={cheer} className={cheer ? '' : 'm-float'} />
            <div style={{ position: 'absolute', left: -14, bottom: 4, background: 'var(--surface)', borderRadius: 12, padding: '3px 9px', fontWeight: 800, color: 'var(--primary-2)', boxShadow: 'var(--shadow)', border: '2px solid var(--primary-soft)', transform: cheer ? 'scale(1.15)' : 'none', transition: 'transform .3s' }}>{pct}%</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <Bar value={pct} style={{ flex: 1 }} />
          <b style={{ fontSize: 18 }}>{pct}%</b>
        </div>
      </div>

      <div className="chips" style={{ justifyContent: 'center' }}>
        {LEVELS.map((l) => (
          <button key={l} className={`chip ${l === level ? 'on' : ''}`} disabled={!levelUnlocked(state, l)} onClick={() => { haptic('select'); setLevel(l); }}>
            {!levelUnlocked(state, l) && <span className="ic" style={{ marginRight: 4 }}><Icon name="lock" size={13} /></span>}{l}
          </button>
        ))}
      </div>

      {step && (
        <button className="btn" style={{ minHeight: 64, justifyContent: 'flex-start', padding: '0 16px', gap: 14 }} onClick={cont}>
          <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.25)', display: 'grid', placeItems: 'center' }}><Icon name="play" size={18} fill="currentColor" /></span>
          <span className="col" style={{ gap: 0, alignItems: 'flex-start', minWidth: 0 }}>
            <span>{step.kind === 'lesson' ? (step.index === 0 && !state.lessonsDone[step.lesson.id] ? t('startLesson') : t('continueLesson')) : step.kind === 'checkpoint' ? t('checkpoint') : t('levelTest')}</span>
            <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
              {step.kind === 'lesson' ? `${loc(step.unit.title, lang)} · ${loc(step.lesson.title, lang)}` : step.kind === 'checkpoint' ? loc(step.unit.title, lang) : level}
            </span>
          </span>
        </button>
      )}

      {state.mistakes.length >= 3 && (
        <button className="card row" style={{ textAlign: 'left' }} onClick={() => nav.push({ name: 'lesson', mode: 'mistakes' })}>
          <Tile icon="refresh" tone="warn" />
          <span className="col grow" style={{ gap: 0 }}><b>{t('workOnMistakes')}</b><span className="small">{t('workOnMistakesSub', { n: Math.min(state.mistakes.length, 10) })}</span></span>
          <Icon name="chevron" />
        </button>
      )}

      <div className="card col" style={{ gap: 10 }}>
        <b>{t('missions')}</b>
        {missions.map((m) => (
          <div key={m.label} className="row" style={{ gap: 10 }}>
            <Tile icon={m.icon} size={34} tone={m.cur >= m.max ? 'ok' : 'primary'} />
            <div className="col grow" style={{ gap: 4 }}>
              <div className="row between"><span className="small" style={{ color: 'var(--text)' }}>{m.label}</span><span className="tiny">{m.cur}/{m.max}</span></div>
              <Bar value={(m.cur / m.max) * 100} style={{ height: 6 }} />
            </div>
          </div>
        ))}
      </div>

      {!path.anyContent && (
        <div className="card col" style={{ alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <Mascot emotion="searching" size={120} />
          <p className="small">{t('fromLevelComing', { level })}</p>
          <button className="btn ghost sm" onClick={() => nav.tab('courses')}>{t('ipaCourse')}</button>
        </div>
      )}

      <Serpentine path={path} state={state} t={t} lang={lang} level={level}
        onLesson={(u, l) => { haptic('light'); openLesson(u, l); }}
        onCheckpoint={(u) => { haptic('light'); openCheckpoint(u); }}
        onLevelTest={() => nav.push({ name: 'lesson', mode: 'level', level })}
        onLocked={(msg) => setInfo(msg)}
      />

      {info && (
        <Sheet onClose={() => setInfo(null)}>
          <div className="row"><Mascot emotion={info.emotion || 'idle'} size={90} /><div className="col" style={{ gap: 4 }}><b>{info.title}</b><span className="small">{info.text}</span></div></div>
          {info.action && <button className="btn" onClick={() => { setInfo(null); info.action(); }}>{info.actionLabel}</button>}
          <button className="btn line" onClick={() => setInfo(null)}>{t('close')}</button>
        </Sheet>
      )}
    </div>
  );
}

function Serpentine({ path, state, t, lang, level, onLesson, onCheckpoint, onLevelTest, onLocked }) {
  const NODE = 66;
  const ROW = 96;
  let colorIdx = 0;
  return (
    <div className="col" style={{ gap: 6 }}>
      {path.units.map((u, ui) => {
        const color = UNIT_COLORS[colorIdx++ % UNIT_COLORS.length];
        if (!u.data) {
          return (
            <div key={u.id} className="card soft row" style={{ opacity: 0.65, padding: '10px 14px' }}>
              <span style={{ width: 34, height: 34, borderRadius: 12, background: 'var(--bg-2)', display: 'grid', placeItems: 'center' }}><Icon name="lock" size={16} /></span>
              <span className="col grow" style={{ gap: 0 }}>
                <span className="tiny">{t('unit')} {ui + 1} · {u.kind === 'vocab' ? t('kindVocab') : t('kindGrammar')} · {u.planned} {t('lessons')}</span>
                <b style={{ fontSize: 14 }}>{loc(u.title, lang)}</b>
              </span>
              <span className="tiny">{t('comingSoon')}</span>
            </div>
          );
        }
        const nodes = [...u.lessons.map((l) => ({ ...l, type: 'lesson' })), { type: 'checkpoint', status: u.checkpoint, id: `${u.id}-cp` }];
        const height = nodes.length * ROW + 10;
        const pts = nodes.map((_, i) => ({ x: 150 + OFFSETS[i % OFFSETS.length], y: i * ROW + NODE / 2 + 6 }));
        const d = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `C${pts[i - 1].x},${pts[i - 1].y + ROW / 2} ${p.x},${p.y - ROW / 2} ${p.x},${p.y}`)).join(' ');
        return (
          <section key={u.id} className="col" style={{ gap: 12, marginTop: 8 }}>
            <div className="card row" style={{ background: color, color: '#fff', boxShadow: `0 8px 20px ${color}55` }}>
              <div className="col grow" style={{ gap: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.85 }}>{t('unit')} {ui + 1} · {u.kind === 'vocab' ? t('kindVocab') : t('kindGrammar')}</span>
                <b style={{ fontSize: 18 }}>{loc(u.title, lang)}</b>
              </div>
              <Tile icon={u.complete ? 'trophy' : u.kind === 'vocab' ? 'book' : 'grammar'} size={42} tone="white" />
              {u.canJump && (
                <button className="btn sm" style={{ background: 'rgba(255,255,255,.25)', boxShadow: 'none', color: '#fff' }}
                  onClick={() => onLocked({ title: t('skipUnit'), text: t('jumpHint'), emotion: 'surprised', action: () => onCheckpoint(u.data), actionLabel: t('checkpoint') })}>
                  <Icon name="jump" size={16} /> {t('checkpoint')}
                </button>
              )}
            </div>
            <div style={{ position: 'relative', width: 300, maxWidth: '100%', height, margin: '0 auto' }}>
              <svg width="300" height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
                <path d={d} fill="none" stroke="var(--line)" strokeWidth="10" strokeLinecap="round" />
                <path d={d} fill="none" stroke={color} strokeOpacity=".35" strokeWidth="4" strokeDasharray="2 12" strokeLinecap="round" />
              </svg>
              {nodes.map((n, i) => {
                const p = pts[i];
                const isCp = n.type === 'checkpoint';
                const st = n.status;
                const bg = st === 'locked' ? 'var(--bg-2)' : st === 'done' ? color : st === 'refresh' ? 'var(--warn)' : color;
                const iconName = isCp ? (st === 'done' ? 'trophy' : st === 'locked' ? 'lock' : 'gift') : st === 'done' ? 'check' : st === 'locked' ? 'lock' : st === 'refresh' ? 'refresh' : 'star';
                const click = () => {
                  if (st === 'locked') return onLocked({ title: t('locked'), text: isCp ? t('checkpointSub') : loc(n.title, lang), emotion: 'thinking' });
                  if (isCp) onCheckpoint(u.data); else onLesson(u.data, u.data.lessons[n.index]);
                };
                return (
                  <div key={n.id} style={{ position: 'absolute', left: p.x - NODE / 2, top: p.y - NODE / 2, width: NODE, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <button onClick={click} aria-label={isCp ? t('checkpoint') : loc(n.title, lang)}
                      className={st === 'current' ? 'pulse' : ''}
                      style={{
                        width: NODE, height: NODE, borderRadius: isCp ? 22 : '50%', background: bg,
                        color: st === 'locked' ? 'var(--muted)' : '#fff', display: 'grid', placeItems: 'center',
                        boxShadow: st === 'locked' ? 'inset 0 -5px 0 rgba(0,0,0,.06)' : `inset 0 -6px 0 rgba(0,0,0,.15), 0 6px 14px ${color}55`,
                        border: st === 'current' ? '4px solid var(--surface)' : 'none', outline: st === 'current' ? `3px solid ${color}` : 'none',
                      }}>
                      <Icon name={iconName} size={isCp ? 28 : 26} stroke={st === 'done' ? 3 : 2.2} fill={st === 'current' || st === 'available' ? (isCp ? 'none' : 'currentColor') : 'none'} />
                    </button>
                    <span className="tiny" style={{ marginTop: 4, width: 120, textAlign: 'center', fontWeight: 700, color: st === 'locked' ? 'var(--muted)' : 'var(--text-2)', lineHeight: 1.15 }}>
                      {isCp ? t('checkpoint') : loc(n.title, lang)}
                    </span>
                    {st === 'current' && (
                      <div style={{ position: 'absolute', top: -14, [p.x > 150 ? 'right' : 'left']: NODE + 8 }} className="m-float">
                        <Mascot emotion="greeting" size={76} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {path.anyContent && (
        <button className="card row" style={{ marginTop: 10, opacity: path.finalTest === 'locked' ? 0.6 : 1 }}
          onClick={() => (path.finalTest === 'locked' ? onLocked({ title: t('levelTest'), text: t('locked'), emotion: 'thinking' }) : onLevelTest())}>
          <Tile icon={path.finalTest === 'done' ? 'crown' : 'flag'} size={44} tone={path.finalTest === 'locked' ? 'plain' : 'primary'} />
          <span className="col grow" style={{ gap: 0, textAlign: 'left' }}><b>{t('levelTest')} {level}</b><span className="small">25 · {t('checkpointSub')}</span></span>
          {path.finalTest === 'locked' ? <Icon name="lock" /> : <Icon name="chevron" />}
        </button>
      )}
    </div>
  );
}
