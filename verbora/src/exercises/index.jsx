import { useEffect, useMemo, useRef, useState } from 'react';
import { loc } from '../lib/loc.js';
import { matches, normalize, shuffle, hashSeed, gapSentences, answerIndex } from '../lib/check.js';
import { speak } from '../lib/tts.js';
import { haptic } from '../lib/telegram.js';
import { Icon, Speak } from '../components.jsx';

/*
  Every exercise component gets { ex, lang, t, locked, sound, onChange }.
  onChange({ ready, evaluate }) — `evaluate()` returns { ok, answer } where `answer` is the
  correct answer to show in the feedback panel. `locked` = feedback is visible, inputs frozen.
  Components that check themselves (match) call onChange({ ready: true, auto: true, evaluate }).
*/

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];



function Question({ text }) {
  // highlight the gap
  const parts = String(text).split('___');
  return (
    <div className="h2 en" style={{ lineHeight: 1.35 }}>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span style={{ display: 'inline-block', minWidth: 56, borderBottom: '3px solid var(--primary)', margin: '0 4px' }}>&nbsp;</span>}
        </span>
      ))}
    </div>
  );
}

function Choices({ options, lang, picked, setPicked, locked, answer, seed }) {
  const order = useMemo(() => shuffle(options.map((o, i) => i), seed), [options, seed]);
  const right = answerIndex(options, answer, lang);
  return (
    <div className="list">
      {order.map((i, k) => {
        const o = loc(options[i], lang);
        const isAns = i === right;
        let state = '';
        if (locked) state = isAns ? 'ok' : picked === i ? 'bad' : 'dim';
        return (
          <button key={i} className={`option ${picked === i && !locked ? 'sel' : ''} ${state}`} disabled={locked} onClick={() => { haptic('select'); setPicked(i); }}>
            <span className="letter">{LETTERS[k]}</span>
            <span className="title en">{o}</span>
            {picked === i && !locked && <span className="check"><Icon name="check" size={14} stroke={3} /></span>}
            {locked && isAns && <span className="check mark-ok"><Icon name="check" size={14} stroke={3} /></span>}
            {locked && !isAns && picked === i && <span className="check mark-bad"><Icon name="close" size={13} stroke={3} /></span>}
          </button>
        );
      })}
    </div>
  );
}

function useChoice(ex, lang, onChange) {
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    onChange({
      ready: picked !== null,
      evaluate: () => ({ ok: picked === answerIndex(ex.options, ex.answer, lang), answer: loc(ex.answer, lang) }),
    });
  }, [picked]);
  return [picked, setPicked];
}

export function Choose({ ex, lang, t, locked, onChange }) {
  const [picked, setPicked] = useChoice(ex, lang, onChange);
  return (
    <>
      <div className="small">{t('chooseRight')}</div>
      <Question text={loc(ex.question, lang)} />
      <Choices options={ex.options} lang={lang} picked={picked} setPicked={setPicked} locked={locked} answer={ex.answer} seed={hashSeed(ex.id)} />
    </>
  );
}

export function Listen({ ex, lang, t, locked, sound, onChange }) {
  const [picked, setPicked] = useChoice(ex, lang, onChange);
  useEffect(() => { const id = setTimeout(() => speak(ex.audio_text, { audio: ex.audio, enabled: sound }), 350); return () => clearTimeout(id); }, [ex.id]);
  return (
    <>
      <div className="small">{t('listenChoose')}</div>
      <div className="row" style={{ justifyContent: 'center', gap: 18, padding: '8px 0' }}>
        <Speak lg text={ex.audio_text} audio={ex.audio} enabled={sound} label={t('listen')} />
        <button className="speak" onClick={() => speak(ex.audio_text, { audio: ex.audio, slow: true, enabled: sound })} aria-label={t('slow')}>
          <Icon name="slow" size={18} />
        </button>
      </div>
      {!sound && <div className="tiny row" style={{ justifyContent: 'center', gap: 6 }}><Icon name="mute" size={16} />{ex.audio_text}</div>}
      <Choices options={ex.options} lang={lang} picked={picked} setPicked={setPicked} locked={locked} answer={ex.answer} seed={hashSeed(ex.id)} />
    </>
  );
}

export function Ipa({ ex, lang, t, locked, sound, onChange }) {
  const [picked, setPicked] = useChoice(ex, lang, onChange);
  useEffect(() => { if (locked) speak(ex.answer, { enabled: sound }); }, [locked]);
  return (
    <>
      <div className="small">{t('readIpa')}</div>
      <div className="card" style={{ textAlign: 'center', padding: '28px 16px' }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--primary-2)', fontFamily: "'Nunito', 'Noto Sans', 'Segoe UI', sans-serif" }}>{ex.ipa}</div>
      </div>
      <Choices options={ex.options} lang={lang} picked={picked} setPicked={setPicked} locked={locked} answer={ex.answer} seed={hashSeed(ex.id)} />
    </>
  );
}

function TextAnswer({ value, setValue, locked, ok, placeholder, multiline, autoFocus = true }) {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus && !locked) setTimeout(() => ref.current?.focus({ preventScroll: true }), 250); }, []);
  const props = {
    ref,
    className: `input ${locked ? (ok ? 'ok' : 'bad') : ''}`,
    value,
    disabled: locked,
    placeholder,
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    autoComplete: 'off',
    enterKeyHint: 'done',
    onChange: (e) => setValue(e.target.value),
    onKeyDown: (e) => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); e.currentTarget.blur(); document.dispatchEvent(new CustomEvent('verbora:submit')); } },
  };
  return multiline ? <textarea {...props} rows={3} style={{ resize: 'none' }} /> : <input {...props} />;
}

function useText(ex, onChange, answer, accept, initial = '', opts) {
  const [value, setValue] = useState(initial);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    onChange({
      ready: normalize(value).length > 0 && normalize(value) !== normalize(initial),
      evaluate: () => { const r = matches(value, answer, accept, opts); setOk(r); return { ok: r, answer }; },
    });
  }, [value]);
  return [value, setValue, ok];
}

export function Fill({ ex, lang, t, locked, onChange }) {
  const variants = [ex.answer, ...(ex.accept || [])];
  const [value, setValue, ok] = useText(ex, onChange, ex.answer, [...(ex.accept || []), ...gapSentences(ex.question, variants)]);
  const parts = String(ex.question).split('___');
  return (
    <>
      <div className="small">{t('fillGap')}</div>
      <div className="h2 en" style={{ lineHeight: 1.5 }}>
        {parts[0]}
        <span style={{ color: locked ? (ok ? 'var(--ok)' : 'var(--bad)') : 'var(--primary-2)', borderBottom: '3px solid currentColor', padding: '0 6px' }}>{locked && ok ? ex.answer : value.trim().split(/\s+/).length > 2 ? '\u00a0…\u00a0' : value || '    '}</span>
        {parts.slice(1).join('___')}
      </div>
      {ex.hint && <div className="pill" style={{ alignSelf: 'flex-start' }}><span className="ic"><Icon name="bulb" size={15} /></span>{t('hint')}: {loc(ex.hint, lang)}</div>}
      <TextAnswer value={value} setValue={setValue} locked={locked} ok={ok} placeholder={t('typeHere')} />
    </>
  );
}

export function Fix({ ex, lang, t, locked, onChange }) {
  const [value, setValue, ok] = useText(ex, onChange, ex.answer, ex.accept, ex.sentence, { shortForms: true });
  return (
    <>
      <div className="small">{t('fixError')}</div>
      <div className="card soft"><div className="h3 en" style={{ textDecoration: 'line-through wavy var(--bad)', textDecorationThickness: 1 }}>{ex.sentence}</div></div>
      <TextAnswer value={value} setValue={setValue} locked={locked} ok={ok} placeholder={t('typeHere')} />
    </>
  );
}

export function Translate({ ex, lang, t, locked, onChange }) {
  const [value, setValue, ok] = useText(ex, onChange, ex.answer, ex.accept, '', { shortForms: true });
  return (
    <>
      <div className="small">{t('translateTo')}</div>
      <div className="card soft"><div className="h2">{loc(ex.prompt, lang)}</div></div>
      <TextAnswer value={value} setValue={setValue} locked={locked} ok={ok} placeholder="English…" multiline />
    </>
  );
}

export function Define({ ex, lang, t, locked, onChange }) {
  const [value, setValue, ok] = useText(ex, onChange, ex.answer, ex.accept);
  return (
    <>
      <div className="small">{t('defineTitle')}</div>
      <div className="card soft"><div className="h3 en">{loc(ex.definition, lang)}</div></div>
      <TextAnswer value={value} setValue={setValue} locked={locked} ok={ok} placeholder={t('typeHere')} />
    </>
  );
}

export function Associate({ ex, lang, t, locked, onChange }) {
  const [value, setValue, ok] = useText(ex, onChange, ex.answer, ex.accept);
  return (
    <>
      <div className="small">{t('associateTitle')}</div>
      <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
        <div className="card" style={{ padding: '18px 24px' }}><div className="h2 en">{loc(ex.cue, lang)}</div></div>
        <Icon name="arrow" size={28} />
        <div className="card soft" style={{ padding: '18px 24px' }}><div className="h2">?</div></div>
      </div>
      <TextAnswer value={value} setValue={setValue} locked={locked} ok={ok} placeholder={t('typeHere')} />
    </>
  );
}

export function Build({ ex, lang, t, locked, onChange }) {
  const tiles = useMemo(() => {
    let order = shuffle(ex.words.map((w, i) => i), hashSeed(ex.id));
    // never start already solved
    if (order.map((i) => ex.words[i]).join(' ').toLowerCase() === normalize(ex.answer)) order = [...order.slice(1), order[0]];
    return order;
  }, [ex.id]);
  const [picked, setPicked] = useState([]);
  const sentence = picked.map((i) => ex.words[i]).join(' ');
  useEffect(() => {
    onChange({ ready: picked.length === ex.words.length, evaluate: () => ({ ok: matches(sentence, ex.answer, ex.accept), answer: ex.answer }) });
  }, [picked]);
  const tile = (i, inLine) => (
    <button
      key={i}
      disabled={locked}
      onClick={() => { haptic('select'); setPicked(inLine ? picked.filter((x) => x !== i) : [...picked, i]); }}
      className="chip"
      style={{ fontSize: 17, padding: '10px 16px', color: 'var(--text)', background: 'var(--surface)', boxShadow: 'var(--shadow), inset 0 0 0 1px var(--line)' }}
    >
      {ex.words[i]}
    </button>
  );
  return (
    <>
      <div className="small">{t('buildSentence')}</div>
      {ex.prompt && <div className="card soft"><div className="h3">{loc(ex.prompt, lang)}</div></div>}
      <div className="card soft chips" style={{ minHeight: 76, alignContent: 'flex-start' }}>
        {picked.map((i) => tile(i, true))}
      </div>
      <div className="chips" style={{ justifyContent: 'center', minHeight: 50 }}>
        {tiles.filter((i) => !picked.includes(i)).map((i) => tile(i, false))}
      </div>
    </>
  );
}

export function Match({ ex, lang, t, locked, onChange }) {
  const pairs = ex.pairs.map((p) => ({ left: loc(p.left, lang), right: loc(p.right, lang) }));
  const rightOrder = useMemo(() => shuffle(pairs.map((_, i) => i), hashSeed(ex.id)), [ex.id]);
  const [sel, setSel] = useState(null); // left index
  const [done, setDone] = useState([]); // left indexes matched
  const [wrong, setWrong] = useState(null); // right index flashed red
  const [mistakes, setMistakes] = useState(0);
  const pick = (ri) => {
    if (sel === null || done.includes(ri)) return;
    if (normalize(pairs[ri].right) === normalize(pairs[sel].right)) {
      haptic('success');
      const nd = [...done, sel];
      setDone(nd);
      setSel(null);
      if (nd.length === pairs.length) onChange({ ready: true, auto: true, evaluate: () => ({ ok: mistakes === 0, answer: pairs.map((p) => `${p.left} — ${p.right}`).join(' · ') }) });
    } else {
      haptic('error');
      setMistakes((m) => m + 1);
      setWrong(ri);
      setTimeout(() => setWrong(null), 450);
    }
  };
  useEffect(() => { onChange({ ready: false }); }, []);
  const cell = (label, { on, ok, bad, onClick, en }) => (
    <button className={`option ${on ? 'sel' : ''} ${ok ? 'ok dim' : ''} ${bad ? 'bad m-shake' : ''}`} style={{ minHeight: 54, justifyContent: 'center', textAlign: 'center', padding: '10px 8px' }} onClick={onClick} disabled={locked || ok}>
      <span className={`title ${en ? 'en' : ''}`} style={{ fontSize: 15 }}>{label}</span>
    </button>
  );
  return (
    <>
      <div className="small">{t('matchPairs')}</div>
      <div className="grid2">
        <div className="list">
          {pairs.map((p, i) => <div key={i}>{cell(p.left, { on: sel === i, ok: done.includes(i), onClick: () => { haptic('select'); setSel(i); }, en: true })}</div>)}
        </div>
        <div className="list">
          {rightOrder.map((ri) => <div key={ri}>{cell(pairs[ri].right, { ok: done.includes(ri), bad: wrong === ri, onClick: () => pick(ri) })}</div>)}
        </div>
      </div>
    </>
  );
}

export function Wordbank({ ex, lang, t, locked, onChange }) {
  const [fills, setFills] = useState(() => ex.sentences.map(() => null)); // bank index per sentence
  const [active, setActive] = useState(0);
  const used = fills.filter((x) => x !== null);
  const results = useRef([]);
  useEffect(() => {
    onChange({
      ready: fills.every((f) => f !== null),
      evaluate: () => {
        results.current = fills.map((f, i) => normalize(ex.bank[f]) === normalize(ex.answers[i]));
        return { ok: results.current.every(Boolean), answer: ex.sentences.map((s, i) => s.replace('___', ex.answers[i])).join(' ') };
      },
    });
  }, [fills]);
  const put = (bi) => {
    if (locked) return;
    haptic('select');
    const nf = [...fills];
    let target = active ?? nf.findIndex((x) => x === null);
    if (target < 0) target = 0;
    nf[target] = bi;
    setFills(nf);
    const nextEmpty = nf.findIndex((x) => x === null);
    setActive(nextEmpty >= 0 ? nextEmpty : null);
  };
  return (
    <>
      <div className="small">{t('wordbankTitle')}</div>
      <div className="list">
        {ex.sentences.map((s, i) => {
          const [a, b] = s.split('___');
          const res = locked ? results.current[i] : undefined;
          return (
            <div key={i} className="card" style={{ padding: '14px 16px' }}>
              <span className="h3 en" style={{ fontWeight: 700 }}>
                {a}
                <button
                  disabled={locked}
                  onClick={() => { setActive(i); if (fills[i] !== null) { const nf = [...fills]; nf[i] = null; setFills(nf); } }}
                  style={{
                    minWidth: 64, padding: '2px 10px', margin: '0 4px', borderRadius: 10, fontWeight: 800,
                    background: res === true ? 'var(--ok-soft)' : res === false ? 'var(--bad-soft)' : active === i ? 'var(--primary-soft)' : 'var(--bg-2)',
                    boxShadow: `inset 0 0 0 2px ${res === true ? 'var(--ok)' : res === false ? 'var(--bad)' : active === i ? 'var(--primary)' : 'var(--line)'}`,
                  }}
                >
                  {fills[i] !== null ? ex.bank[fills[i]] : ' '}
                </button>
                {b}
              </span>
              {res === false && <div className="tiny" style={{ marginTop: 4 }}>→ {ex.answers[i]}</div>}
            </div>
          );
        })}
      </div>
      <div className="chips" style={{ justifyContent: 'center' }}>
        {ex.bank.map((w, bi) => {
          const gone = !ex.reuse && used.includes(bi);
          return (
            <button key={bi} className="chip" disabled={locked || gone} onClick={() => put(bi)} style={{ fontSize: 17, padding: '10px 18px', color: 'var(--text)', opacity: gone ? 0.3 : 1 }}>{w}</button>
          );
        })}
      </div>
      <div className="tiny" style={{ textAlign: 'center' }}>{t('tapBlank')}</div>
    </>
  );
}

export function Brackets({ ex, lang, t, locked, onChange }) {
  const n = ex.answers.length;
  const [vals, setVals] = useState(() => Array(n).fill(''));
  const res = useRef([]);
  useEffect(() => {
    onChange({
      ready: vals.every((v) => normalize(v)),
      evaluate: () => {
        res.current = vals.map((v, i) => matches(v, ex.answers[i], ex.accept?.[i] || []));
        return { ok: res.current.every(Boolean), answer: ex.answers.join(', ') };
      },
    });
  }, [vals]);
  const parts = String(ex.text).split(/\{\{(\d+)\}\}/);
  return (
    <>
      <div className="small">{t('bracketsTitle')}</div>
      <div className="card" style={{ lineHeight: 2.4, fontSize: 17 }}>
        {parts.map((p, k) => {
          if (k % 2 === 0) return <span key={k} className="en">{p}</span>;
          const i = Number(p) - 1;
          const r = locked ? res.current[i] : undefined;
          return (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                className={`input ${r === true ? 'ok' : r === false ? 'bad' : ''}`}
                style={{ width: 120, minHeight: 38, padding: '4px 10px', fontSize: 16, display: 'inline-block' }}
                value={vals[i]} disabled={locked} autoCapitalize="off" autoCorrect="off" spellCheck={false}
                onChange={(e) => { const nv = [...vals]; nv[i] = e.target.value; setVals(nv); }}
              />
              <span className="tiny">({loc(ex.hints?.[i], lang)})</span>
            </span>
          );
        })}
      </div>
    </>
  );
}

function SubQuestions({ questions, lang, t, locked, onChange, extra }) {
  const [ans, setAns] = useState(() => questions.map(() => null));
  useEffect(() => {
    onChange({
      ready: ans.every((a) => a !== null),
      evaluate: () => {
        const ok = questions.every((q, i) => (q.type === 'truefalse' ? ans[i] === q.answer : ans[i] === answerIndex(q.options, q.answer, lang)));
        const answer = questions.map((q) => (q.type === 'truefalse' ? `${loc(q.statement, lang)} — ${q.answer ? t('true') : t('false')}` : loc(q.question, lang).replace('___', loc(q.answer, lang)))).join(' · ');
        return { ok, answer };
      },
    });
  }, [ans]);
  const set = (i, v) => { if (locked) return; haptic('select'); const n = [...ans]; n[i] = v; setAns(n); };
  return (
    <div className="list">
      {extra}
      {questions.map((q, i) => (
        <div key={i} className="card col" style={{ gap: 8 }}>
          {q.type === 'truefalse' ? (
            <>
              <div className="h3 en">{loc(q.statement, lang)}</div>
              <div className="grid2">
                {[true, false].map((v) => {
                  const st = locked ? (v === q.answer ? 'ok' : ans[i] === v ? 'bad' : 'dim') : '';
                  return <button key={String(v)} className={`option ${ans[i] === v && !locked ? 'sel' : ''} ${st}`} style={{ minHeight: 46, justifyContent: 'center' }} onClick={() => set(i, v)} disabled={locked}><span className="title">{v ? t('true') : t('false')}</span></button>;
                })}
              </div>
            </>
          ) : (
            <>
              <div className="h3 en">{loc(q.question, lang)}</div>
              <div className="chips">
                {q.options.map((o, k) => {
                  const isAns = k === answerIndex(q.options, q.answer, lang);
                  const bg = locked ? (isAns ? 'var(--ok)' : ans[i] === k ? 'var(--bad)' : '') : '';
                  return <button key={k} className={`chip ${ans[i] === k && !locked ? 'on' : ''}`} style={bg ? { background: bg, color: '#fff' } : {}} disabled={locked} onClick={() => set(i, k)}>{loc(o, lang)}</button>;
                })}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function Reading({ ex, lang, t, locked, sound, onChange }) {
  const fullText = ex.text || (ex.dialog || []).map((d) => d.line).join(' ');
  return (
    <>
      <div className="small">{t('readingTitle')}</div>
      <div className="card col" style={{ gap: 10 }}>
        <div className="row between">
          <span className="pill"><span className="ic"><Icon name="text" size={15} /></span>Text</span>
          <Speak text={fullText} audio={ex.audio} enabled={sound} />
        </div>
        {ex.text && <p className="en" style={{ fontSize: 17, lineHeight: 1.6, fontWeight: 600 }}>{ex.text}</p>}
        {ex.dialog && ex.dialog.map((d, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
            <b style={{ color: 'var(--primary-2)', minWidth: 54 }}>{d.speaker}:</b>
            <span className="en" style={{ fontWeight: 600 }}>{d.line}</span>
          </div>
        ))}
      </div>
      <SubQuestions questions={ex.questions} lang={lang} t={t} locked={locked} onChange={onChange} />
    </>
  );
}

export function Picture({ ex, lang, t, locked, onChange }) {
  return (
    <>
      <div className="small">{t('pictureTitle')}</div>
      {ex.image && <img src={ex.image} alt="" style={{ width: '100%', borderRadius: 18, boxShadow: 'var(--shadow)' }} />}
      <SubQuestions questions={ex.questions} lang={lang} t={t} locked={locked} onChange={onChange} />
    </>
  );
}

export function Write({ ex, lang, t, locked, onChange }) {
  const [value, setValue] = useState('');
  useEffect(() => { onChange({ ready: true, skip: true, evaluate: () => ({ ok: true, answer: '' }) }); }, []);
  return (
    <>
      <div className="small">{t('writeTitle')}</div>
      <div className="card soft"><div className="h3">{loc(ex.prompt, lang)}</div></div>
      <TextAnswer value={value} setValue={setValue} locked={locked} ok multiline placeholder="English…" autoFocus={false} />
      <div className="tiny">{t('writeSoon')}</div>
    </>
  );
}

export const EXERCISES = {
  choose: Choose, fill: Fill, build: Build, fix: Fix, listen: Listen, translate: Translate, ipa: Ipa,
  match: Match, wordbank: Wordbank, define: Define, associate: Associate, brackets: Brackets,
  reading: Reading, picture: Picture, write: Write,
};
