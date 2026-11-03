import { useEffect, useMemo, useState } from 'react';
import { speak } from './lib/tts.js';
import { haptic } from './lib/telegram.js';

// ---------- Mascot: 21 static emotions from Valeria + light CSS animation (SPEC §9) ----------
export const EMOTIONS = {
  idle: '01_idle_calm', greeting: '02_greeting_wave', sleeping: '03_sleeping', waking: '04_waking_up',
  explaining: '05_explaining', thinking: '06_thinking', listening: '07_listening', speaking: '08_speaking',
  correct: '09_correct_answer', celebration: '10_celebration', fire: '11_streak_on_fire', mistake: '12_small_mistake',
  encouragement: '13_encouragement', badge: '14_new_badge', levelup: '15_level_up', streak: '16_daily_streak',
  gift: '17_secret_gift', surprised: '18_surprised', sad: '19_streak_lost_sad', thanks: '20_thank_you', searching: '21_searching',
};

// Preload the emotions used mid-lesson so the swap is instant.
if (typeof window !== 'undefined') {
  for (const k of ['correct', 'mistake', 'encouragement', 'fire', 'celebration', 'explaining']) {
    const img = new Image();
    img.src = `./assets/mascot/${EMOTIONS[k]}.webp`;
  }
}

export function Mascot({ emotion = 'idle', size = 140, anim = 'float', sparkles = false, style, className = '' }) {
  const file = EMOTIONS[emotion] || EMOTIONS.idle;
  return (
    <span className={`mascot-wrap ${className}`} style={{ width: size, ...style }}>
      <img
        key={emotion}
        className={`mascot m-pop ${anim === 'float' ? '' : `m-${anim}`}`}
        src={`./assets/mascot/${file}.webp`}
        alt="Verbi"
        width={size}
        style={{ width: size, height: 'auto' }}
        draggable={false}
      />
      {sparkles && (
        <span className="sparkles" aria-hidden>
          <i style={{ left: '4%', top: '10%' }}>✦</i>
          <i style={{ right: '2%', top: '18%', animationDelay: '.4s' }}>✧</i>
          <i style={{ left: '12%', bottom: '10%', animationDelay: '.8s' }}>✧</i>
          <i style={{ right: '10%', bottom: '4%', animationDelay: '1.1s' }}>✦</i>
        </span>
      )}
    </span>
  );
}

export function FloatingMascot(props) {
  return (
    <div className="m-float" style={{ display: 'inline-block' }}>
      <Mascot {...props} anim={props.anim || 'pop'} />
    </div>
  );
}

// ---------- Icons (inline, stroke style like the mockups) ----------
const P = {
  back: 'M15 18l-6-6 6-6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  grad: 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4.5-6 8-6s7 2 8 6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  sound: 'M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  check: 'M5 12l5 5 9-10',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  flame: 'M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 1.5-4S9 12 11 12c0-4 1-7 1-9z',
  play: 'M8 5l11 7-11 7z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
  plane: 'M2 13l20-8-6 16-4-6-6-2zM12 15l4-6',
  cap: 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  gift: 'M3 9h18v4H3zM5 13h14v8H5zM12 9v12M12 9S10 4 7.5 5 9 9 12 9zM12 9s2-5 4.5-4S15 9 12 9z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  moon: 'M20 15A8 8 0 1 1 9 4a6.5 6.5 0 0 0 11 11z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  cards: 'M7 4h12v14H7zM4 7v13h12',
  chevron: 'M9 6l6 6-6 6',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 20h8',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
};

export function Icon({ name, size = 22, stroke = 2, fill = 'none', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden>
      <path d={P[name]} />
    </svg>
  );
}

export function TopBar({ title, onBack, right }) {
  return (
    <div className="topbar">
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="back"><Icon name="back" /></button>
      )}
      <div className="t">{title}</div>
      {right}
    </div>
  );
}

export function Bar({ value, style }) {
  return <div className="bar" style={style}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Dots({ n, i }) {
  return <div className="dots">{Array.from({ length: n }, (_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>;
}

export function Speak({ text, audio, enabled = true, lg = false, slow = false, label }) {
  return (
    <button
      className={`speak ${lg ? 'lg' : ''}`}
      aria-label={label || 'play'}
      onClick={(e) => { e.stopPropagation(); haptic('light'); speak(text, { audio, slow, enabled }); }}
    >
      <Icon name="sound" size={lg ? 34 : 18} />
    </button>
  );
}

export function Toggle({ on, onChange }) {
  return <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

export function Sheet({ children, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Confetti({ n = 40 }) {
  const pieces = useMemo(
    () => Array.from({ length: n }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.8 + Math.random() * 1.4,
      color: ['#f5b94a', '#a48bdc', '#7a62b0', '#f08fb1', '#7fd3a8', '#8ec5ff'][i % 6],
      rot: Math.random() * 360,
    })),
    [n]
  );
  const [show, setShow] = useState(true);
  useEffect(() => { const t = setTimeout(() => setShow(false), 3600); return () => clearTimeout(t); }, []);
  if (!show) return null;
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, background: p.color, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
}

export function Option({ icon, title, sub, selected, onClick, right, letter, state }) {
  return (
    <button className={`option ${selected ? 'sel' : ''} ${state || ''}`} onClick={onClick}>
      {letter && <span className="letter">{letter}</span>}
      {icon && <span className="ico">{typeof icon === 'string' && P[icon] ? <Icon name={icon} /> : icon}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="title" style={{ display: 'block' }}>{title}</span>
        {sub && <span className="small" style={{ display: 'block' }}>{sub}</span>}
      </span>
      {right}
      {selected && !right && <span className="check"><Icon name="check" size={14} stroke={3} /></span>}
    </button>
  );
}
