import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { transcription, ipaSounds } from '../lib/content.js';
import { loc } from '../lib/loc.js';
import { speak } from '../lib/tts.js';
import { haptic } from '../lib/telegram.js';
import { TopBar, Icon, Mascot, Bar } from '../components.jsx';

export default function Courses({ nav, t, lang }) {
  const { state } = useStore();
  const u = transcription;
  const done = u.lessons.filter((l) => state.lessonsDone[l.id]).length;
  const passed = Boolean(state.unitsPassed[u.id]);
  return (
    <div className="screen with-nav">
      <TopBar title={t('coursesTitle')} />
      <div className="card col" style={{ gap: 12 }}>
        <div className="row">
          <div className="col grow" style={{ gap: 2 }}>
            <span className="pill" style={{ alignSelf: 'flex-start' }}>/ˈ/ IPA</span>
            <div className="h3" style={{ marginTop: 6 }}>{t('ipaCourse')}</div>
            <div className="small">{t('ipaCourseSub')}</div>
          </div>
          <Mascot emotion={passed ? 'badge' : 'listening'} size={90} />
        </div>
        <Bar value={((done + (passed ? 1 : 0)) / (u.lessons.length + 1)) * 100} />
        <div className="list">
          {u.lessons.map((l, i) => {
            const isDone = Boolean(state.lessonsDone[l.id]);
            const open = i === 0 || state.lessonsDone[u.lessons[i - 1].id] || passed;
            return (
              <button key={l.id} className={`option ${open ? '' : 'dim'}`} disabled={!open} onClick={() => nav.push({ name: 'lesson', mode: 'lesson', lessonId: l.id })}>
                <span className="ico" style={isDone ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : {}}>{isDone ? '✓' : open ? i + 1 : <Icon name="lock" size={16} />}</span>
                <span className="title grow">{loc(l.title, lang)}</span>
                <Icon name="chevron" />
              </button>
            );
          })}
          <button className={`option ${done === u.lessons.length || passed ? '' : 'dim'}`} disabled={!(done === u.lessons.length || passed)} onClick={() => nav.push({ name: 'lesson', mode: 'checkpoint', unitId: u.id })}>
            <span className="ico">{passed ? '🏅' : '🏁'}</span>
            <span className="title grow">{t('finalChallenge')}</span>
            <Icon name="chevron" />
          </button>
        </div>
      </div>
      <button className="card row" style={{ textAlign: 'left' }} onClick={() => nav.push({ name: 'sounds' })}>
        <span className="ico" style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--primary-soft)', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, color: 'var(--primary-2)' }}>ʃ</span>
        <span className="col grow" style={{ gap: 0 }}><b>{t('soundTable')}</b><span className="small">{t('soundTableSub')}</span></span>
        <Icon name="chevron" />
      </button>
      {[[t('ieltsSoon'), '🎓'], [t('nicheSoon'), '💼']].map(([title, em]) => (
        <div key={title} className="card soft row" style={{ opacity: 0.6 }}>
          <span style={{ fontSize: 24 }}>{em}</span>
          <span className="grow" style={{ fontWeight: 700 }}>{title}</span>
          <span className="tiny">{t('comingSoon')}</span>
        </div>
      ))}
    </div>
  );
}

export function SoundTable({ nav, t, lang }) {
  const { state } = useStore();
  const [active, setActive] = useState(null);
  const play = (s) => {
    haptic('light');
    setActive(s.ipa);
    speak(s.words.join(', '), { enabled: state.settings.sound, slow: true });
  };
  return (
    <div className="screen">
      <TopBar title={t('soundTable')} onBack={() => nav.back()} />
      <p className="small">{t('soundTableSub')}</p>
      {ipaSounds.groups.map((g) => (
        <section key={g.id} className="col" style={{ gap: 8 }}>
          <div className="h3">{loc(g.title, lang)}</div>
          <div className="grid3">
            {g.sounds.map((s) => (
              <button key={s.ipa} className="card col" onClick={() => play(s)}
                style={{ alignItems: 'center', gap: 2, padding: '12px 6px', outline: active === s.ipa ? '2px solid var(--primary)' : 'none', background: active === s.ipa ? 'var(--primary-soft)' : 'var(--surface)' }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary-2)' }}>/{s.ipa}/</span>
                <span className="tiny en" style={{ color: 'var(--text)' }}>{s.words.join(' · ')}</span>
                {active === s.ipa && <span className="tiny">{loc(s.hint, lang)}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
