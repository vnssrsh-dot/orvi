import { useStore } from '../lib/store.jsx';
import { LEVELS, levelInfo } from '../lib/content.js';
import { buildPath, topicStatus, levelUnlocked } from '../lib/progress.js';
import { unitTopics } from '../lib/content.js';
import { TOPIC_NAMES } from '../lib/i18n.js';
import { loc } from '../lib/loc.js';
import { TopBar, Icon } from '../components.jsx';

// Grammar map (SPEC §4.2): 🟢 know · 🟡 shaky · 🔴 gap · 🔒 locked
export default function GrammarMap({ nav, t, lang }) {
  const { state } = useStore();
  return (
    <div className="screen with-nav">
      <TopBar title={t('mapTitle')} />
      <div className="card soft chips" style={{ gap: 14 }}>
        {[['know', t('mapKnow')], ['shaky', t('mapShaky')], ['gap', t('mapGap')], ['locked', t('mapLocked')]].map(([k, l]) => (
          <span key={k} className="row" style={{ gap: 6 }}><span className={`status-dot st-${k}`} /><span className="small">{l}</span></span>
        ))}
      </div>
      {state.mistakes.length > 0 && (
        <button className="card row" style={{ textAlign: 'left' }} onClick={() => nav.push({ name: 'lesson', mode: 'mistakes' })}>
          <span style={{ fontSize: 24 }}>🔁</span>
          <span className="col grow" style={{ gap: 0 }}><b>{t('workOnMistakes')}</b><span className="small">{t('workOnMistakesSub', { n: Math.min(state.mistakes.length, 10) })}</span></span>
          <Icon name="chevron" />
        </button>
      )}
      {LEVELS.map((lvl) => {
        const path = buildPath(state, lvl);
        const open = levelUnlocked(state, lvl);
        return (
          <section key={lvl} className="col" style={{ gap: 8 }}>
            <div className="row between">
              <div className="h3">{lvl} · {loc(levelInfo(lvl).title, lang)}</div>
              {state.levelsPassed[lvl] && <span className="pill">✓</span>}
              {!open && <Icon name="lock" size={18} />}
            </div>
            <div className="card col" style={{ gap: 0, padding: '4px 14px' }}>
              {path.units.map((u, i) => {
                const topics = u.data ? unitTopics(u.data).filter((x) => x !== 'vocab') : [];
                let unitSt = 'locked';
                if (u.data && u.unlocked) {
                  const sts = topics.map((tp) => topicStatus(state, tp));
                  unitSt = u.complete && sts.every((s) => s !== 'gap') ? 'know' : sts.includes('shaky') || sts.includes('know') ? 'shaky' : 'gap';
                  if (u.complete && !sts.length) unitSt = 'know';
                }
                if (state.unitsPassed[u.id]?.viaDiag) unitSt = 'know';
                return (
                  <div key={u.id} className="col" style={{ gap: 6, padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                    <div className="row" style={{ gap: 10 }}>
                      <span className={`status-dot st-${unitSt}`} />
                      <span className="grow" style={{ fontWeight: 700, fontSize: 15, opacity: unitSt === 'locked' ? 0.55 : 1 }}>{u.kind === 'vocab' ? '📗' : '🔤'} {loc(u.title, lang)}</span>
                      {!u.data && <span className="tiny">{t('comingSoon')}</span>}
                    </div>
                    {u.data && u.unlocked && topics.length > 0 && (
                      <div className="col" style={{ gap: 4, paddingLeft: 22 }}>
                        {topics.map((tp) => {
                          const st = state.unitsPassed[u.id]?.viaDiag ? 'know' : topicStatus(state, tp);
                          const r = state.topics[tp];
                          return (
                            <div key={tp} className="row" style={{ gap: 8 }}>
                              <span className={`status-dot st-${st}`} style={{ width: 9, height: 9 }} />
                              <span className="small grow">{loc(TOPIC_NAMES[tp], lang) || tp}</span>
                              {r && <span className="tiny">{Math.round((r.ok / (r.ok + r.bad)) * 100)}%</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
