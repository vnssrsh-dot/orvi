import { useState } from 'react';
import { useStore, streakAlive, freshState, today } from '../lib/store.jsx';
import { LEVELS } from '../lib/content.js';
import { levelPercent, currentLevel } from '../lib/progress.js';
import { BADGES } from '../lib/badges.js';
import { TOPIC_NAMES } from '../lib/i18n.js';
import { loc } from '../lib/loc.js';
import { tgUser } from '../lib/telegram.js';
import { TopBar, Icon, Mascot, Bar, Toggle, Sheet, Tile } from '../components.jsx';

function weekDates() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() - dow + i); return today(x); });
}

export default function Profile({ nav, t, lang }) {
  const { state } = useStore();
  const lvl = currentLevel(state);
  const pct = levelPercent(state, lvl);
  const streak = streakAlive(state);
  const name = state.profile.name || tgUser()?.first_name || t('learner');
  const learned = Object.values(state.vocab).filter((c) => c.learned).length;
  const week = weekDates();
  const topics = Object.entries(state.topics).filter(([, r]) => r.ok + r.bad > 0);
  return (
    <div className="screen with-nav">
      <TopBar title={t('profile')} right={<button className="icon-btn" onClick={() => nav.push({ name: 'settings' })}><Icon name="gear" /></button>} />
      <div className="col" style={{ alignItems: 'center', gap: 6 }}>
        <div style={{ width: 112, height: 112, borderRadius: '50%', background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
          <Mascot emotion={streak >= 3 ? 'fire' : 'idle'} size={100} />
        </div>
        <div className="h2">{name}</div>
        <div className="small">{lvl} · {pct}%</div>
        <Bar value={pct} style={{ width: 160 }} />
      </div>
      <div className="row" style={{ gap: 10 }}>
        <div className="card stat"><Tile icon="flame" size={36} tone="warn" /><b>{streak}</b><span>{t('days')}</span></div>
        <div className="card stat"><Tile icon="star" size={36} /><b>{state.xp}</b><span>{t('xp')}</span></div>
        <div className="card stat"><Tile icon="books" size={36} tone="ok" /><b>{learned}</b><span>{t('learned')}</span></div>
      </div>

      <div className="card col" style={{ gap: 12 }}>
        <div className="row between"><b>{t('streak')}</b><span className="small">{t('streakDays', { n: streak })} · best {state.streak.best}</span></div>
        <div className="row between">
          {week.map((d, i) => {
            const on = state.week[d];
            const isToday = d === today();
            return (
              <div key={d} className="col" style={{ alignItems: 'center', gap: 4 }}>
                <span className="tiny">{t('weekDays')[i]}</span>
                <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: on ? 'var(--primary)' : 'var(--bg-2)', color: on ? '#fff' : 'var(--muted)', fontSize: 14, outline: isToday ? '2px solid var(--primary)' : 'none', outlineOffset: 2 }}>{on ? <Icon name="check" size={15} stroke={3} /> : null}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card col" style={{ gap: 10 }}>
        <b>{t('overall')}</b>
        {LEVELS.map((l) => (
          <div key={l} className="row" style={{ gap: 10 }}>
            <span style={{ width: 28, fontWeight: 800 }}>{l}</span>
            <Bar value={levelPercent(state, l)} style={{ flex: 1 }} />
            <span className="tiny" style={{ width: 34, textAlign: 'right' }}>{levelPercent(state, l)}%</span>
          </div>
        ))}
      </div>

      {topics.length > 0 && (
        <div className="card col" style={{ gap: 10 }}>
          <b>{t('topicsStats')}</b>
          {topics.map(([tp, r]) => {
            const acc = Math.round((r.ok / (r.ok + r.bad)) * 100);
            return (
              <div key={tp} className="col" style={{ gap: 4 }}>
                <div className="row between"><span className="small" style={{ color: 'var(--text)' }}>{loc(TOPIC_NAMES[tp], lang) || tp}</span><span className="tiny">{acc}%</span></div>
                <Bar value={acc} style={{ height: 6 }} />
              </div>
            );
          })}
        </div>
      )}

      <div className="col" style={{ gap: 8 }}>
        <div className="h3">{t('badgesAll')}</div>
        <div className="grid3">
          {BADGES.map((b) => {
            const got = state.badges[b.id];
            if (b.hidden && !got) return <div key={b.id} className="card badge-tile off"><Tile icon="question" size={52} tone="plain" /><span className="tiny">???</span></div>;
            return (
              <div key={b.id} className={`card badge-tile ${got ? '' : 'off'}`}>
                <Tile icon={b.icon} size={52} tone={got ? 'primary' : 'plain'} />
                <b style={{ fontSize: 12 }}>{loc(b.title, lang)}</b>
                <span className="tiny">{loc(b.desc, lang)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Settings({ nav, t, lang }) {
  const { state, update, replace } = useStore();
  const [confirm, setConfirm] = useState(false);
  const row = (icon, title, right, onClick) => (
    <button className="row" style={{ padding: '14px 4px', width: '100%', textAlign: 'left' }} onClick={onClick}>
      <span style={{ color: 'var(--primary-2)' }}><Icon name={icon} /></span>
      <span className="grow" style={{ fontWeight: 700 }}>{title}</span>
      {right}
    </button>
  );
  return (
    <div className="screen">
      <TopBar title={t('settings')} onBack={() => nav.back()} />
      <div className="card col" style={{ gap: 10 }}>
        <b>{t('language')}</b>
        <div className="grid2">
          {[['ua', 'Українська'], ['ru', 'Русский']].map(([id, label]) => (
            <button key={id} className={`option ${lang === id ? 'sel' : ''}`} style={{ minHeight: 50, justifyContent: 'center' }} onClick={() => update((s) => { s.lang = id; })}>
              <span className="title">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="card col" style={{ gap: 8 }}>
        <b>{t('yourName')}</b>
        <input className="input" value={state.profile.name} maxLength={40} placeholder={t('learner')} onChange={(e) => { const v = e.target.value; update((s) => { s.profile.name = v; }); }} />
      </div>
      <div className="card" style={{ padding: '2px 14px' }}>
        {row('sound', t('sound'), <Toggle on={state.settings.sound} onChange={(v) => update((s) => { s.settings.sound = v; })} />)}
        <div className="sep" />
        {row('moon', t('theme'), <span className="small">{state.settings.theme === 'dark' ? t('themeDark') : t('themeLight')}</span>, () => update((s) => { s.settings.theme = s.settings.theme === 'dark' ? 'light' : 'dark'; }))}
        <div className="sep" />
        {row('trash', t('reset'), <Icon name="chevron" />, () => setConfirm(true))}
      </div>
      <div className="card row">
        <Mascot emotion="thanks" size={80} />
        <div className="col" style={{ gap: 4 }}><b>{t('about')}</b><span className="small">{t('aboutText')}</span><span className="tiny">v0.1 · @verbora_englishbot</span></div>
      </div>
      {confirm && (
        <Sheet onClose={() => setConfirm(false)}>
          <div className="row"><Mascot emotion="surprised" size={80} /><span className="small" style={{ color: 'var(--text)' }}>{t('resetConfirm')}</span></div>
          <button className="btn bad" onClick={() => { const f = freshState(); f.lang = state.lang; replace(f); nav.tab('home'); }}>{t('reset')}</button>
          <button className="btn line" onClick={() => setConfirm(false)}>{t('close')}</button>
        </Sheet>
      )}
    </div>
  );
}
