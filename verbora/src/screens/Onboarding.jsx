import { useMemo, useState } from 'react';
import { useStore, freshState } from '../lib/store.jsx';
import { suggestedLang, tgUser, haptic } from '../lib/telegram.js';
import { diagnostic, LEVELS, levelPath } from '../lib/content.js';
import { TOPIC_NAMES } from '../lib/i18n.js';
import { loc } from '../lib/loc.js';
import { shuffle } from '../lib/check.js';
import { Mascot, Icon, Dots, Option, Bar, Tile } from '../components.jsx';

const STEPS = ['splash', 'lang', 'hello', 'verbi', 'mission', 'experience', 'goal', 'minutes', 'diagIntro', 'diag', 'diagResult'];

export default function Onboarding({ t, lang }) {
  const { state, update, prevVisit } = useStore();
  const [step, setStep] = useState('splash');
  const [ans, setAns] = useState({ experience: null, goal: null, minutes: 15 });
  const [diag, setDiag] = useState(null);
  const go = (s) => { haptic('light'); setStep(s); };

  const finish = (placement, diagAnswers = []) => {
    update((s) => {
      s.onboarded = true;
      s.profile = { ...s.profile, ...ans, name: tgUser()?.first_name || s.profile.name };
      const idx = LEVELS.indexOf(placement);
      for (let i = 0; i < idx; i++) {
        s.levelsPassed[LEVELS[i]] = 'diag';
        for (const u of levelPath(LEVELS[i])) {
          if (!u.data) continue;
          s.unitsPassed[u.id] = { score: 1, at: Date.now(), viaDiag: true };
          for (const l of u.data.lessons) s.lessonsDone[l.id] = { acc: 1, at: Date.now(), viaDiag: true };
        }
      }
      for (const a of diagAnswers) {
        const r = s.topics[a.topic] || { ok: 0, bad: 0, last: null };
        if (a.ok) r.ok++; else r.bad++;
        r.last = a.ok;
        s.topics[a.topic] = r;
      }
      s.currentLevel = placement;
    });
  };

  // ---------- screens ----------
  if (step === 'splash') {
    return (
      <div className="screen center" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #fff 0%, var(--bg) 55%, #e6dcf6 100%)', gap: 10 }}>
        <div className="grow" />
        <div className="logo">verbora<span style={{ color: 'var(--accent)', fontSize: 24, verticalAlign: 'super' }}>✦</span></div>
        <p className="sub">Your language. Your universe.</p>
        <div className="m-float" style={{ marginTop: 18 }}><Mascot emotion={prevVisit ? 'waking' : 'idle'} size={230} anim="bounce" /></div>
        <div className="grow" />
        <button className="btn" onClick={() => go('lang')}>{t('start')} <Icon name="arrow" size={18} /></button>
        <p className="tiny">{t('slogan')}</p>
      </div>
    );
  }

  if (step === 'lang') {
    const sug = suggestedLang();
    const current = state.lang || sug;
    const opts = [
      { id: 'ua', flag: 'UA', title: 'Українська', sub: 'Пояснення українською' },
      { id: 'ru', flag: 'RU', title: 'Русский', sub: 'Объяснения на русском' },
    ];
    if (sug === 'ru') opts.reverse();
    return (
      <div className="screen">
        <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 8, paddingTop: 24 }}>
          <Mascot emotion="greeting" size={150} />
          <div className="h2">{t('chooseLang')}</div>
          <p className="small">{t('chooseLangSub')}</p>
        </div>
        <div className="list">
          {opts.map((o) => (
            <Option key={o.id} icon={<span style={{ fontWeight: 800, fontSize: 14 }}>{o.flag}</span>} title={o.title} sub={o.sub} selected={current === o.id} onClick={() => update((s) => { s.lang = o.id; })} />
          ))}
        </div>
        <div className="grow" />
        <button className="btn" onClick={() => { if (!state.lang) update((s) => { s.lang = current; }); go('hello'); }}>{t('next')} <Icon name="arrow" size={18} /></button>
      </div>
    );
  }

  const story = { hello: 0, verbi: 1, mission: 2 };
  if (step in story) {
    const i = story[step];
    const content = [
      { e: 'greeting', h: t('hello'), p: t('welcome') },
      { e: 'speaking', h: t('iAmVerbi'), p: t('verbiIntro') },
      { e: 'thanks', h: t('ourMission'), p: t('verbiMission') },
    ][i];
    const nextStep = ['verbi', 'mission', 'experience'][i];
    return (
      <div className="screen center" style={{ gap: 18 }}>
        <div className="grow" />
        <div key={step} className="m-float"><Mascot emotion={content.e} size={220} anim="bounce" sparkles={i === 2} /></div>
        <div className="h1">{content.h}</div>
        <p className="sub" style={{ fontSize: 17, maxWidth: 340 }}>{content.p}</p>
        <div className="grow" />
        <div className="row between" style={{ width: '100%' }}>
          <Dots n={3} i={i} />
          <button className="round-next" onClick={() => go(nextStep)} aria-label={t('next')}><Icon name="arrow" /></button>
        </div>
      </div>
    );
  }

  const survey = {
    experience: { q: t('qExperience'), key: 'experience', next: 'goal', opts: [
      { id: 'new', icon: 'star', title: t('expNew'), sub: t('expNewSub') },
      { id: 'forgot', icon: 'refresh', title: t('expForgot'), sub: t('expForgotSub') },
      { id: 'confident', icon: 'bolt', title: t('expConfident'), sub: t('expConfidentSub') },
    ] },
    goal: { q: t('qGoal'), sub: t('qGoalSub'), key: 'goal', next: 'minutes', opts: [
      { id: 'life', icon: 'plane', title: t('goalLife'), sub: t('goalLifeSub') },
      { id: 'work', icon: 'briefcase', title: t('goalWork'), sub: t('goalWorkSub') },
      { id: 'study', icon: 'cap', title: t('goalStudy'), sub: t('goalStudySub') },
    ] },
    minutes: { q: t('qMinutes'), sub: t('qMinutesSub'), key: 'minutes', next: null, opts: [
      { id: 5, icon: 'clock', title: t('min5'), sub: t('min5Sub') },
      { id: 15, icon: 'clock', title: t('min15'), sub: t('min15Sub') },
      { id: 30, icon: 'clock', title: t('min30'), sub: t('min30Sub') },
    ] },
  };
  if (step in survey) {
    const sv = survey[step];
    const order = ['experience', 'goal', 'minutes'];
    const idx = order.indexOf(step);
    const val = ans[sv.key];
    const onNext = () => {
      if (sv.next) return go(sv.next);
      if (ans.experience === 'new') finish('A1');
      else go('diagIntro');
    };
    return (
      <div className="screen">
        <div className="row" style={{ gap: 10 }}>
          <button className="icon-btn" onClick={() => go(idx ? order[idx - 1] : 'mission')}><Icon name="back" /></button>
          <Bar value={((idx + 1) / 3) * 100} style={{ flex: 1 }} />
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="h2">{sv.q}</div>
          {sv.sub && <p className="small">{sv.sub}</p>}
        </div>
        <div className="list">
          {sv.opts.map((o) => (
            <Option key={o.id} icon={o.icon} title={o.title} sub={o.sub} selected={val === o.id} onClick={() => { haptic('select'); setAns({ ...ans, [sv.key]: o.id }); }} />
          ))}
        </div>
        <div className="grow" />
        <div className="row" style={{ justifyContent: 'center' }}><Mascot emotion="idle" size={96} /></div>
        <button className="btn" disabled={val === null} onClick={onNext}>{t('next')} <Icon name="arrow" size={18} /></button>
      </div>
    );
  }

  if (step === 'diagIntro') {
    return (
      <div className="screen">
        <div className="row"><button className="icon-btn" onClick={() => go('minutes')}><Icon name="back" /></button></div>
        <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <Mascot emotion="thinking" size={170} />
          <div className="h1">{t('diagTitle')}</div>
          <p className="sub">{t('diagSub')}</p>
        </div>
        <div className="list">
          {LEVELS.slice(0, 4).map((l, i) => (
            <div key={l} className="card soft row"><span className="letter" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', fontWeight: 800 }}>{l}</span><span className="small">{[t('expNewSub'), t('expForgotSub'), t('goalLifeSub'), t('expConfidentSub')][i]}</span></div>
          ))}
        </div>
        <div className="grow" />
        <button className="btn" onClick={() => { setDiag(null); go('diag'); }}>{t('diagStart')} <Icon name="arrow" size={18} /></button>
        <button className="btn line" onClick={() => finish('A1')}>{t('diagSkip')}</button>
      </div>
    );
  }

  if (step === 'diag') {
    return <Diagnostic t={t} lang={lang} startLevel={ans.experience === 'confident' ? 2 : 1} onDone={(r) => { setDiag(r); go('diagResult'); }} onBack={() => go('diagIntro')} />;
  }

  if (step === 'diagResult' && diag) {
    const topics = [...new Map(diag.answers.map((a) => [a.topic, a])).keys()];
    const st = (tp) => {
      const list = diag.answers.filter((a) => a.topic === tp);
      const ok = list.filter((a) => a.ok).length;
      return ok === list.length ? 'know' : ok ? 'shaky' : 'gap';
    };
    return (
      <div className="screen">
        <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <Mascot emotion="celebration" size={160} anim="bounce" sparkles />
          <div className="sub">{t('diagResult')}</div>
          <div className="h1" style={{ fontSize: 44, color: 'var(--primary-2)' }}>{diag.placement}</div>
          <p className="small">{t('diagResultSub')}</p>
        </div>
        <div className="card col" style={{ gap: 10 }}>
          <b>{t('diagMapTitle')}</b>
          {topics.map((tp) => (
            <div key={tp} className="row" style={{ gap: 10 }}>
              <span className={`status-dot st-${st(tp)}`} />
              <span className="small" style={{ color: 'var(--text)' }}>{loc(TOPIC_NAMES[tp], lang) || tp.replace(/-/g, ' ')}</span>
            </div>
          ))}
        </div>
        <div className="grow" />
        <button className="btn" onClick={() => finish(diag.placement, diag.answers)}>{t('start')} <Icon name="arrow" size={18} /></button>
      </div>
    );
  }
  return null;
}

// Adaptive placement: right → harder, wrong → easier (SPEC §3).
function Diagnostic({ t, lang, startLevel, onDone, onBack }) {
  const byLevel = useMemo(() => {
    const m = {};
    for (const l of LEVELS) m[l] = shuffle(diagnostic.questions.filter((q) => q.level === l));
    return m;
  }, []);
  const total = diagnostic.length;
  const [lvl, setLvl] = useState(startLevel);
  const [answers, setAnswers] = useState([]);
  const [picked, setPicked] = useState(null);
  const [q, setQ] = useState(() => byLevel[LEVELS[startLevel]][0]);

  const pickNext = (levelIdx, asked) => {
    const usedIds = new Set(asked.map((a) => a.id));
    for (let d = 0; d < LEVELS.length; d++) {
      for (const i of [levelIdx - d, levelIdx + d]) {
        if (i < 0 || i >= LEVELS.length) continue;
        const cand = byLevel[LEVELS[i]].find((x) => !usedIds.has(x.id));
        if (cand) return cand;
      }
    }
    return null;
  };

  const submit = () => {
    const ok = q.options[picked] === q.answer;
    haptic(ok ? 'success' : 'warning');
    const na = [...answers, { id: q.id, level: q.level, topic: q.topic, ok }];
    setAnswers(na);
    setPicked(null);
    const li = LEVELS.indexOf(q.level);
    const nl = Math.max(0, Math.min(LEVELS.length - 1, li + (ok ? 1 : -1)));
    setLvl(nl);
    const nq = na.length < total ? pickNext(nl, na) : null;
    if (!nq) return onDone({ answers: na, placement: placementOf(na) });
    setQ(nq);
  };

  const opts = useMemo(() => shuffle(q.options.map((_, i) => i)), [q.id]);
  return (
    <div className="screen">
      <div className="row" style={{ gap: 10 }}>
        <button className="icon-btn" onClick={onBack}><Icon name="close" /></button>
        <Bar value={(answers.length / total) * 100} style={{ flex: 1 }} />
        <span className="tiny">{answers.length + 1}/{total}</span>
      </div>
      <div className="row between">
        <span className="small">{t('diagQuestion')} {answers.length + 1}</span>
        <Mascot emotion="thinking" size={70} />
      </div>
      <div className="h2 en" style={{ lineHeight: 1.35 }}>{q.question}</div>
      <div className="list">
        {opts.map((i, k) => (
          <button key={`${q.id}-${i}`} className={`option ${picked === i ? 'sel' : ''}`} onClick={() => { haptic('select'); setPicked(i); }}>
            <span className="letter">{'ABCD'[k]}</span><span className="title en">{q.options[i]}</span>
          </button>
        ))}
      </div>
      <div className="grow" />
      <button className="btn" disabled={picked === null} onClick={submit}>{t('next')} <Icon name="arrow" size={18} /></button>
    </div>
  );
}

export function placementOf(answers) {
  let highest = -1;
  LEVELS.forEach((l, i) => {
    const list = answers.filter((a) => a.level === l);
    const ok = list.filter((a) => a.ok).length;
    if (list.length >= 2 && ok / list.length >= 0.7) highest = Math.max(highest, i);
  });
  return LEVELS[Math.min(highest + 1, LEVELS.length - 1)];
}
