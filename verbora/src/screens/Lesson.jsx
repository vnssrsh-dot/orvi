import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, recordAnswer, addXp, bumpStreak, awardBadges, streakAlive } from '../lib/store.jsx';
import { loc } from '../lib/loc.js';
import { haptic } from '../lib/telegram.js';
import { speak, stop } from '../lib/tts.js';
import { EXERCISES } from '../exercises/index.jsx';
import { Mascot, Icon, Bar, Speak, Sheet, Confetti, Tile } from '../components.jsx';
import { badgeById } from '../lib/badges.js';
import { LEVELS } from '../lib/content.js';

export const PASS = 0.8;

/*
  Plays a sequence built from content JSON:
  lesson     → [«Згадаймо» intro → recap tasks] → rule → tasks → (one retry of wrong tasks) → result
  checkpoint → tasks → result (pass ≥ 80% opens the unit, also used to «перестрибнути»)
  level      → final level test → result → level-up
  mistakes   → «робота над помилками»
*/
export default function Lesson({ mode, unit, lesson, recap, exercises: given, title, level, nav, t, lang }) {
  const { state, update } = useStore();
  const sound = state.settings.sound;

  const steps = useMemo(() => {
    const s = [];
    if (mode === 'lesson') {
      if (recap && (recap.exercises?.length || recap.rule)) {
        s.push({ kind: 'recapIntro', recap });
        for (const e of recap.exercises || []) s.push({ kind: 'ex', ex: e, phase: 'recap' });
      }
      if (lesson.rule) {
        const compare = lesson.rule.compare || (unit.lessons[0]?.id === lesson.id ? unit.rule?.compare : null);
        s.push({ kind: 'rule', rule: lesson.rule, compare });
      }
      for (const e of lesson.exercises) s.push({ kind: 'ex', ex: e, phase: 'main' });
    } else {
      for (const e of given) s.push({ kind: 'ex', ex: e, phase: 'main' });
    }
    return s;
  }, []);

  const [queue, setQueue] = useState(steps);
  const [pos, setPos] = useState(0);
  const [feedback, setFeedback] = useState(null); // { ok, answer }
  const [ctl, setCtl] = useState({ ready: false });
  const [results, setResults] = useState({}); // main exercise id -> first-try ok
  const [run, setRun] = useState(0); // consecutive correct
  const [missRun, setMissRun] = useState(0);
  const [finished, setFinished] = useState(null);
  const [askExit, setAskExit] = useState(false);
  const retried = useRef(new Set());

  const step = queue[pos];
  const mainTotal = steps.filter((x) => x.kind === 'ex' && x.phase === 'main').length;
  const mainDone = Object.keys(results).length;

  const onChange = useCallback((c) => setCtl(c), []);
  const goTo = (i) => { setFeedback(null); setCtl({ ready: false }); setPos(i); };
  useEffect(() => () => stop(), []);

  const doCheck = useCallback(() => {
    if (!step || step.kind !== 'ex' || feedback || !ctl.ready || !ctl.evaluate) return;
    const r = ctl.evaluate();
    const ex = step.ex;
    haptic(r.ok ? 'success' : 'error');
    update((s) => { recordAnswer(s, ex, r.ok); });
    if (step.phase === 'main' && !(ex.id in results)) setResults((m) => ({ ...m, [ex.id]: r.ok }));
    setRun(r.ok ? run + 1 : 0);
    setMissRun(r.ok ? 0 : missRun + 1);
    if (!r.ok && step.phase === 'main' && mode !== 'level' && !retried.current.has(ex.id)) {
      retried.current.add(ex.id);
      setQueue((q) => [...q, { kind: 'ex', ex, phase: 'retry' }]);
    }
    if (r.ok && ['listen', 'ipa', 'build', 'translate', 'fix'].includes(ex.type)) {
      const say = ex.type === 'listen' ? ex.audio_text : r.answer;
      if (ex.type !== 'ipa') speak(say, { enabled: sound });
    }
    setFeedback(r);
  }, [step, feedback, ctl, results, run, missRun, sound]);

  // Match checks itself once all pairs are joined.
  useEffect(() => { if (ctl.auto && ctl.ready && !feedback) doCheck(); }, [ctl]);
  // Enter in a text field submits.
  useEffect(() => {
    const h = () => { if (feedback) next(); else doCheck(); };
    document.addEventListener('verbora:submit', h);
    return () => document.removeEventListener('verbora:submit', h);
  });

  const next = () => {
    stop();
    if (pos + 1 < queue.length) { goTo(pos + 1); return; }
    finish();
  };

  const skipRecap = () => {
    let i = pos + 1;
    while (i < queue.length && queue[i].phase === 'recap') i++;
    if (i >= queue.length) finish(); else goTo(i);
  };

  const finish = () => {
    const okCount = Object.values(results).filter(Boolean).length;
    const total = mainTotal || 1;
    const acc = okCount / total;
    const passed = mode === 'lesson' || mode === 'mistakes' ? true : acc >= PASS;
    const xp = okCount * 10 + (acc === 1 ? 10 : 0) + (mode === 'checkpoint' && passed ? 30 : 0) + (mode === 'level' && passed ? 100 : 0);
    let streakUp = false;
    let badges = [];
    let levelUp = null;
    update((s) => {
      addXp(s, xp);
      if (mode === 'lesson') {
        const prev = s.lessonsDone[lesson.id];
        s.lessonsDone[lesson.id] = { acc: Math.max(acc, prev?.acc || 0), at: Date.now() };
        s.daily.lessons++;
      }
      if (mode === 'checkpoint' && passed) {
        s.unitsPassed[unit.id] = { score: acc, at: Date.now() };
        for (const l of unit.lessons) if (!s.lessonsDone[l.id]) s.lessonsDone[l.id] = { acc, at: Date.now(), viaCheckpoint: true };
      }
      if (mode === 'level' && passed) {
        s.levelsPassed[level] = Date.now();
        const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
        if (nextLevel) { s.currentLevel = nextLevel; levelUp = nextLevel; }
      }
      if (passed || mode === 'lesson') streakUp = bumpStreak(s);
      badges = awardBadges(s);
    });
    // update() is synchronous on the draft, values above are filled in by now
    setFinished({ okCount, total, acc, passed, xp, streakUp, badges, levelUp });
    haptic(passed ? 'success' : 'warning');
  };

  if (finished) return <Result {...{ finished, mode, nav, t, lang, steps, results, unit, level, title, state }} />;

  // ---------- mascot reaction ----------
  let emotion = 'idle';
  if (step?.kind === 'recapIntro' || step?.kind === 'rule') emotion = 'explaining';
  else if (feedback) emotion = feedback.ok ? (run >= 5 ? 'fire' : 'correct') : missRun >= 2 ? 'encouragement' : 'mistake';
  else if (step?.ex?.type === 'listen') emotion = 'listening';
  else if (step?.ex?.type === 'translate' || step?.ex?.type === 'build') emotion = 'thinking';

  const progress = mainTotal ? (mainDone / mainTotal) * 100 : 0;
  const phaseLabel = step?.phase === 'recap' ? t('recapTitle') : step?.phase === 'retry' ? t('mistakesReview') : null;

  return (
    <div className="screen" style={{ paddingBottom: 0, gap: 12 }}>
      <div className="row" style={{ gap: 10 }}>
        <button className="icon-btn" onClick={() => setAskExit(true)} aria-label={t('close')}><Icon name="close" /></button>
        <Bar value={progress} style={{ flex: 1, height: 10 }} />
        <span className="tiny" style={{ minWidth: 34, textAlign: 'right' }}>{mainDone}/{mainTotal}</span>
      </div>
      <div className="row between" style={{ minHeight: 24 }}>
        <span className="small" style={{ fontWeight: 700 }}>{title}</span>
        {phaseLabel && <span className="pill">{phaseLabel}</span>}
        {!phaseLabel && run >= 3 && <span className="pill" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><span className="ic"><Icon name="flame" size={15} /></span>{run}</span>}
      </div>

      <div key={pos} className="col grow" style={{ gap: 14, animation: 'screenIn .25s ease both', paddingBottom: 150 }}>
        {step?.kind === 'recapIntro' && <RecapIntro recap={step.recap} t={t} lang={lang} sound={sound} />}
        {step?.kind === 'rule' && <RuleCard rule={step.rule} compare={step.compare} t={t} lang={lang} sound={sound} />}
        {step?.kind === 'ex' && (() => {
          const C = EXERCISES[step.ex.type];
          if (!C) return <div className="empty">Unknown exercise type: {step.ex.type}</div>;
          return (
            <>
              <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'flex-end', marginBottom: -8, marginTop: -6 }}>
                <Mascot emotion={feedback ? 'idle' : emotion} size={72} anim="pop" />
              </div>
              <C key={`${pos}-${step.ex.id}`} ex={step.ex} lang={lang} t={t} locked={Boolean(feedback)} sound={sound} onChange={onChange} />
            </>
          );
        })()}
      </div>

      {/* footer */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 480, padding: feedback ? 0 : '12px 16px calc(16px + var(--safe-b))', background: feedback ? 'transparent' : 'linear-gradient(transparent, var(--bg) 30%)' }}>
          {step?.kind === 'recapIntro' && (
            <div className="row">
              <button className="btn line" onClick={skipRecap}>{t('recapRemember')}</button>
              <button className="btn" onClick={next}>{t('recapGo')}</button>
            </div>
          )}
          {step?.kind === 'rule' && <button className="btn" onClick={next}>{t('understood')} <Icon name="arrow" size={18} /></button>}
          {step?.kind === 'ex' && !feedback && (
            ctl.skip
              ? <button className="btn" onClick={() => { setResults((m) => ({ ...m, [step.ex.id]: true })); next(); }}>{t('skip')}</button>
              : <button className="btn" disabled={!ctl.ready} onClick={doCheck}>{t('check')}</button>
          )}
          {feedback && step?.kind === 'ex' && (
            <div className={`fb ${feedback.ok ? 'fb-ok' : 'fb-bad'}`}>
              <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                <span className="fb-icon"><Icon name={feedback.ok ? 'check' : 'close'} size={22} stroke={3} /></span>
                <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
                  <div className="fb-title">{feedback.ok ? t('correct') : t('wrong')}</div>
                  {!feedback.ok && feedback.answer && (
                    <div className="fb-answer">
                      <span className="tiny">{t('rightAnswer')}</span>
                      <span className="en">{feedback.answer}</span>
                    </div>
                  )}
                  {(!feedback.ok || step.ex.type === 'ipa') && step.ex.explain && <div className="small">{loc(step.ex.explain, lang)}</div>}
                </div>
                <Mascot emotion={emotion} size={64} anim={feedback.ok ? 'bounce' : 'shake'} />
              </div>
              <button className="btn" onClick={next}>{t('next')} <Icon name="arrow" size={18} /></button>
            </div>
          )}
        </div>
      </div>

      {askExit && (
        <Sheet onClose={() => setAskExit(false)}>
          <div className="row"><Mascot emotion="sad" size={80} /><div className="col" style={{ gap: 4 }}><div className="h3">{t('exit')}</div><div className="small">{t('exitSub')}</div></div></div>
          <button className="btn" onClick={() => setAskExit(false)}>{t('stay')}</button>
          <button className="btn line" onClick={() => { stop(); nav.back(); }}>{t('leave')}</button>
        </Sheet>
      )}
    </div>
  );
}

export function RuleCard({ rule, compare, t, lang, sound }) {
  return (
    <>
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="col grow" style={{ gap: 4 }}>
          <span className="pill" style={{ alignSelf: 'flex-start' }}><span className="ic"><Icon name="book" size={15} /></span>{t('ruleTitle')}</span>
        </div>
        <Mascot emotion="explaining" size={96} />
      </div>
      <div className="card" style={{ background: 'linear-gradient(135deg, var(--primary-soft), var(--surface))' }}>
        <div className="h3 en" style={{ color: 'var(--primary-2)', fontSize: 19, lineHeight: 1.45 }}>{rule.formula}</div>
      </div>
      {rule.explain && <p style={{ fontSize: 16, lineHeight: 1.55 }}>{loc(rule.explain, lang)}</p>}
      {rule.examples?.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <div className="small" style={{ fontWeight: 800 }}>{t('examples')}</div>
          {rule.examples.map((e, i) => (
            <div key={i} className="card row" style={{ padding: '12px 14px' }}>
              <div className="col grow" style={{ gap: 2 }}>
                <span className="en" style={{ fontSize: 17 }}>{e.en}</span>
                <span className="small">{loc(e, lang) === e.en ? '' : loc(e, lang)}</span>
              </div>
              <Speak text={e.en.replace(/\s*\/.*?\//g, ' ').replace(/—/g, ',')} enabled={sound} />
            </div>
          ))}
        </div>
      )}
      {compare && (
        <div className="card soft col" style={{ gap: 6 }}>
          <b className="row" style={{ gap: 8 }}><Tile icon="globe" size={30} />{t('compareTitle')}</b>
          <span className="small" style={{ color: 'var(--text)' }}>{loc(compare, lang)}</span>
        </div>
      )}
    </>
  );
}

function RecapIntro({ recap, t, lang, sound }) {
  const ex = recap.rule?.examples?.[0];
  return (
    <>
      <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 10, paddingTop: 8 }}>
        <Mascot emotion="explaining" size={150} />
        <div className="h1">{t('recapTitle')}</div>
        {recap.note && <p className="sub" style={{ fontSize: 17 }}>{loc(recap.note, lang).replace(/^\s*(Згадаймо|Вспомним)\s*:\s*/i, '')}</p>}
      </div>
      {recap.rule && (
        <div className="card col" style={{ gap: 10 }}>
          <div className="h3 en" style={{ color: 'var(--primary-2)' }}>{recap.rule.formula}</div>
          {ex && (
            <div className="row">
              <div className="col grow" style={{ gap: 2 }}><span className="en">{ex.en}</span><span className="small">{loc(ex, lang)}</span></div>
              <Speak text={ex.en} enabled={sound} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Result({ finished, mode, nav, t, lang, steps, results, unit, level, title, state }) {
  const { okCount, total, acc, passed, xp, streakUp, badges, levelUp } = finished;
  const wrong = steps.filter((s) => s.kind === 'ex' && s.phase === 'main' && results[s.ex.id] === false);
  // result first, then level-up and new badges, then back to the path
  const stages = ['result', ...(levelUp ? ['levelup'] : []), ...(badges.length ? ['badge'] : [])];
  const [si, setSi] = useState(0);
  const stage = stages[si];
  const advance = () => (si + 1 < stages.length ? setSi(si + 1) : nav.back());

  if (stage === 'levelup') {
    return (
      <div className="screen center" style={{ gap: 18 }}>
        <Confetti n={70} />
        <Mascot emotion="levelup" size={220} anim="bounce" sparkles />
        <div className="h1">{t('levelPassed', { level })}</div>
        <p className="sub">{t('levelNext', { level: levelUp })}</p>
        <button className="btn" onClick={advance}>{t('continue')} <Icon name="arrow" size={18} /></button>
      </div>
    );
  }
  if (stage === 'badge') {
    return (
      <div className="screen center" style={{ gap: 16 }}>
        <Confetti />
        <Mascot emotion="badge" size={190} anim="bounce" sparkles />
        <div className="h2">{t('newBadge')}</div>
        <div className="list" style={{ width: '100%' }}>
          {badges.map((id) => { const b = badgeById(id); return (
            <div key={id} className="card row"><Tile icon={b.icon} size={48} /><div className="col" style={{ gap: 2 }}><b>{loc(b.title, lang)}</b><span className="small">{loc(b.desc, lang)}</span></div></div>
          ); })}
        </div>
        <button className="btn" onClick={advance}>{t('continue')} <Icon name="arrow" size={18} /></button>
      </div>
    );
  }

  const great = acc >= 0.9;
  const head = mode === 'checkpoint' || mode === 'level' ? (passed ? t('cpPassed') : t('cpFailed')) : great ? t('resultGreat') : acc >= 0.6 ? t('resultGood') : t('resultTry');
  const emotion = passed ? (great ? 'celebration' : 'correct') : 'encouragement';
  return (
    <div className="screen" style={{ gap: 16 }}>
      {passed && great && <Confetti />}
      <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 10, paddingTop: 12 }}>
        <Mascot emotion={emotion} size={180} anim="bounce" sparkles={passed} />
        <div className="h1">{head}</div>
        <p className="sub">{t('resultDone', { ok: okCount, total })}</p>
        {!passed && <p className="small">{t('cpNeed', { need: Math.round(PASS * 100) })}</p>}
      </div>
      <div className="row" style={{ gap: 10 }}>
        <div className="card stat"><Tile icon="star" size={36} /><b>+{xp}</b><span>XP</span></div>
        {streakUp && <div className="card stat"><Tile icon="flame" size={36} tone="warn" /><b>{streakAlive(state)}</b><span>{t('streakDay')}</span></div>}
        <div className="card stat"><Tile icon="target" size={36} tone="ok" /><b>{Math.round(acc * 100)}%</b><span>{t('accuracy')}</span></div>
      </div>
      {wrong.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <div className="h3">{t('mistakesReview')}</div>
          {wrong.map(({ ex }) => (
            <div key={ex.id} className="card soft col" style={{ gap: 4 }}>
              <span className="en">{summarize(ex, lang)}</span>
              <span className="small">{loc(ex.explain, lang)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="grow" />
      {!passed && <button className="btn ghost" onClick={() => nav.replace(nav.current)}>{t('retry')}</button>}
      <button className="btn" onClick={advance}>{t('continue')} <Icon name="arrow" size={18} /></button>
    </div>
  );
}

function summarize(ex, lang) {
  switch (ex.type) {
    case 'choose': case 'fill': return `${loc(ex.question, lang).replace('___', `[${loc(ex.answer, lang)}]`)}`;
    case 'fix': return `${ex.sentence} → ${ex.answer}`;
    case 'translate': return `${loc(ex.prompt, lang)} → ${ex.answer}`;
    case 'build': return ex.answer;
    case 'listen': return ex.answer;
    case 'ipa': return `${ex.ipa} → ${ex.answer}`;
    case 'wordbank': return ex.sentences.map((s, i) => s.replace('___', `[${ex.answers[i]}]`)).join(' ');
    case 'match': return ex.pairs.map((p) => `${loc(p.left, lang)} — ${loc(p.right, lang)}`).join(' · ');
    default: return loc(ex.question || ex.prompt || ex.statement || '', lang) || ex.type;
  }
}
