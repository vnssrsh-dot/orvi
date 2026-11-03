import { useMemo, useState } from 'react';
import { useStore, reviewWord, isDue, awardBadges } from '../lib/store.jsx';
import { allVocab } from '../lib/content.js';
import { buildPath } from '../lib/progress.js';
import { loc } from '../lib/loc.js';
import { haptic } from '../lib/telegram.js';
import { speak } from '../lib/tts.js';
import { Mascot, Icon, TopBar, Speak, Sheet, Bar, Confetti, Tile } from '../components.jsx';
import { LEVELS } from '../lib/content.js';

// Words from units the learner has opened.
export function useMyWords() {
  const { state } = useStore();
  return useMemo(() => {
    const open = new Set();
    for (const l of LEVELS) for (const u of buildPath(state, l).units) if (u.unlocked) open.add(u.id);
    return allVocab().filter((w) => open.has(w.unitId));
  }, [state.unitsPassed, state.lessonsDone, state.levelsPassed]);
}

export default function Words({ nav, t, lang }) {
  const { state } = useStore();
  const words = useMyWords();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const due = words.filter((w) => isDue(state.vocab[w.word]));
  const list = words.filter((w) => {
    const c = state.vocab[w.word];
    if (filter === 'new' && c) return false;
    if (filter === 'learned' && !c?.learned) return false;
    if (filter === 'due' && !isDue(c)) return false;
    const n = q.trim().toLowerCase();
    return !n || w.word.toLowerCase().includes(n) || loc(w, lang).toLowerCase().includes(n);
  });
  const sound = state.settings.sound;

  return (
    <div className="screen with-nav">
      <TopBar title={t('wordsTitle')} />
      <button className="card row" style={{ background: 'linear-gradient(135deg, var(--primary), #a48bdc)', color: '#fff', textAlign: 'left' }} onClick={() => nav.push({ name: 'cards' })} disabled={!words.length}>
        <Tile icon="cards" size={44} tone="white" />
        <span className="col grow" style={{ gap: 0 }}>
          <b style={{ fontSize: 18 }}>{t('cardsReview')}</b>
          <span style={{ fontSize: 13, opacity: 0.9 }}>{due.length ? t('cardsDue', { n: due.length }) : t('cardsNone')}</span>
        </span>
        <Icon name="chevron" />
      </button>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, top: 16, color: 'var(--muted)' }}><Icon name="search" size={20} /></span>
        <input className="input" style={{ paddingLeft: 44, fontWeight: 600 }} placeholder={t('searchWord')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips">
        {[['all', t('all')], ['new', t('newW')], ['due', t('due')], ['learned', t('learned')]].map(([id, label]) => (
          <button key={id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      {!words.length && <div className="empty"><Mascot emotion="searching" size={110} /><p>{t('wordsEmpty')}</p></div>}
      <div className="list">
        {list.map((w) => {
          const c = state.vocab[w.word];
          return (
            <button key={w.word} className="card row" style={{ padding: '10px 14px', textAlign: 'left' }} onClick={() => setOpen(w)}>
              <Speak text={w.word} audio={w.audio} enabled={sound} />
              <span className="col grow" style={{ gap: 0 }}>
                <span className="row" style={{ gap: 8 }}><b className="en">{w.word}</b><span className="tiny">{w.ipa}</span></span>
                <span className="small">{loc(w, lang)}</span>
              </span>
              {c?.learned ? <span style={{ color: 'var(--ok)' }}><Icon name="check" size={18} stroke={2.6} /></span> : c ? <span className="tiny">{'●'.repeat(c.box)}{'○'.repeat(Math.max(0, 2 - c.box))}</span> : <span className="tiny">{t('newW')}</span>}
            </button>
          );
        })}
      </div>
      {open && (
        <Sheet onClose={() => setOpen(null)}>
          <div className="row between">
            <div className="col" style={{ gap: 2 }}>
              <div className="h1 en">{open.word}</div>
              <div className="sub">{open.ipa}</div>
            </div>
            <Speak lg text={open.word} audio={open.audio} enabled={sound} />
          </div>
          <div className="h3">{loc(open, lang)}</div>
          <div className="card soft row">
            <div className="col grow" style={{ gap: 2 }}><span className="tiny">{t('example')}</span><span className="en">{open.example}</span></div>
            <Speak text={open.example} enabled={sound} />
          </div>
          <button className="btn line" onClick={() => setOpen(null)}>{t('close')}</button>
        </Sheet>
      )}
    </div>
  );
}

// Flash cards with spaced repetition (Leitner boxes, Anki-like).
export function Cards({ nav, t, lang }) {
  const { state, update } = useStore();
  const words = useMyWords();
  const deck = useMemo(() => {
    const due = words.filter((w) => state.vocab[w.word] && isDue(state.vocab[w.word]));
    const fresh = words.filter((w) => !state.vocab[w.word]).slice(0, 10);
    return [...due, ...fresh];
  }, []);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [known, setKnown] = useState(0);
  const sound = state.settings.sound;
  const w = deck[i];

  const answer = (k) => {
    haptic(k ? 'success' : 'light');
    update((s) => { reviewWord(s, w.word, k); awardBadges(s); });
    if (k) setKnown(known + 1);
    setFlip(false);
    setI(i + 1);
  };

  if (!w) {
    return (
      <div className="screen center" style={{ gap: 14 }}>
        {deck.length > 0 && <Confetti />}
        <Mascot emotion={deck.length ? 'celebration' : 'sleeping'} size={180} anim="bounce" />
        <div className="h2">{deck.length ? t('cardsDone') : t('cardsNone')}</div>
        {deck.length > 0 && <p className="sub">{known} / {deck.length} ✓</p>}
        <button className="btn" onClick={() => nav.back()}>{t('continue')}</button>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="row" style={{ gap: 10 }}>
        <button className="icon-btn" onClick={() => nav.back()}><Icon name="close" /></button>
        <Bar value={(i / deck.length) * 100} style={{ flex: 1 }} />
        <span className="tiny">{i + 1}/{deck.length}</span>
      </div>
      <button key={i} className="card col" onClick={() => { setFlip(true); speak(w.word, { audio: w.audio, enabled: sound }); }}
        style={{ minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', animation: 'mPop .3s ease' }}>
        <div className="h1 en" style={{ fontSize: 38 }}>{w.word}</div>
        <div className="sub">{w.ipa}</div>
        <Speak text={w.word} audio={w.audio} enabled={sound} />
        {flip ? (
          <>
            <div className="sep" style={{ width: '60%' }} />
            <div className="h2" style={{ color: 'var(--primary-2)' }}>{loc(w, lang)}</div>
            <div className="small en">{w.example}</div>
          </>
        ) : (
          <div className="tiny row" style={{ marginTop: 20, gap: 6 }}><Icon name="hand" size={16} />{t('showAnswer')}</div>
        )}
      </button>
      <div className="grow" />
      {flip ? (
        <div className="row">
          <button className="btn ghost" onClick={() => answer(false)}>{t('dontKnow')}</button>
          <button className="btn ok" onClick={() => answer(true)}>{t('know')}</button>
        </div>
      ) : (
        <button className="btn" onClick={() => { setFlip(true); speak(w.word, { audio: w.audio, enabled: sound }); }}>{t('showAnswer')}</button>
      )}
    </div>
  );
}
