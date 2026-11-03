import { useEffect, useMemo, useState } from 'react';
import { useStore } from './lib/store.jsx';
import { makeT } from './lib/i18n.js';
import { getUnit, findLesson, levelPath, findExercise } from './lib/content.js';
import { buildRecap, levelTestExercises } from './lib/progress.js';
import { loc } from './lib/loc.js';
import { Icon } from './components.jsx';
import Onboarding from './screens/Onboarding.jsx';
import Home from './screens/Home.jsx';
import Lesson from './screens/Lesson.jsx';
import Words, { Cards } from './screens/Words.jsx';
import GrammarMap from './screens/GrammarMap.jsx';
import Courses, { SoundTable } from './screens/Courses.jsx';
import Profile, { Settings } from './screens/Profile.jsx';

const TABS = [
  { id: 'home', icon: 'home', label: 'tabHome' },
  { id: 'words', icon: 'book', label: 'tabWords' },
  { id: 'map', icon: 'map', label: 'tabMap' },
  { id: 'courses', icon: 'grad', label: 'tabCourses' },
  { id: 'profile', icon: 'user', label: 'tabProfile' },
];

let keySeq = 0;
const mk = (r) => ({ ...r, key: ++keySeq });

export default function App() {
  const { state } = useStore();
  const lang = state.lang || 'ua';
  const t = useMemo(() => makeT(lang), [lang]);
  const [stack, setStack] = useState(() => [mk({ name: 'home' })]);
  const current = stack[stack.length - 1];

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.lang = lang === 'ru' ? 'ru' : 'uk';
  }, [state.settings.theme, lang]);

  const nav = useMemo(() => ({
    current,
    push: (r) => setStack((s) => [...s, mk(r)]),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : [mk({ name: 'home' })])),
    replace: (r) => setStack((s) => [...s.slice(0, -1), mk(r)]),
    tab: (name) => setStack([mk({ name })]),
  }), [current]);

  // Telegram native back button
  useEffect(() => {
    const bb = window.Telegram?.WebApp?.BackButton;
    if (!bb || !window.Telegram.WebApp.initData) return;
    const handler = () => nav.back();
    if (stack.length > 1 && current.name !== 'lesson') { bb.show(); bb.onClick(handler); } else bb.hide();
    return () => bb.offClick(handler);
  }, [stack, nav]);

  useEffect(() => { window.scrollTo(0, 0); }, [current.key]);

  if (!state.onboarded) return <div className="app"><Onboarding t={t} lang={lang} /></div>;

  const props = { nav, t, lang };
  let body = null;
  switch (current.name) {
    case 'home': body = <Home {...props} />; break;
    case 'words': body = <Words {...props} />; break;
    case 'cards': body = <Cards {...props} />; break;
    case 'map': body = <GrammarMap {...props} />; break;
    case 'courses': body = <Courses {...props} />; break;
    case 'sounds': body = <SoundTable {...props} />; break;
    case 'profile': body = <Profile {...props} />; break;
    case 'settings': body = <Settings {...props} />; break;
    case 'lesson': body = <LessonRoute key={current.key} route={current} state={state} {...props} />; break;
    default: body = <Home {...props} />;
  }
  const showNav = TABS.some((x) => x.id === current.name);
  return (
    <div className="app">
      {body}
      {showNav && (
        <nav className="nav">
          {TABS.map((x) => (
            <button key={x.id} className={current.name === x.id ? 'on' : ''} onClick={() => nav.tab(x.id)}>
              <Icon name={x.icon} />
              {t(x.label)}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

// Resolves a lesson route into the data the player needs.
function LessonRoute({ route, state, nav, t, lang }) {
  const data = useMemo(() => {
    if (route.mode === 'lesson') {
      const f = findLesson(route.lessonId);
      if (!f) return null;
      const levelUnits = f.unit.level === 'extra' ? [] : levelPath(f.unit.level);
      return {
        unit: f.unit,
        lesson: f.lesson,
        recap: buildRecap(state, f.unit, f.index, levelUnits),
        title: `${t('lesson')} ${f.index + 1} · ${loc(f.lesson.title, lang)}`,
      };
    }
    if (route.mode === 'checkpoint') {
      const u = getUnit(route.unitId);
      return { unit: u, exercises: u.checkpoint, title: `${u.kind === 'course' ? t('finalChallenge') : t('checkpoint')} · ${loc(u.title, lang)}` };
    }
    if (route.mode === 'level') {
      return { exercises: levelTestExercises(route.level), level: route.level, title: `${t('levelTest')} ${route.level}` };
    }
    if (route.mode === 'mistakes') {
      return { exercises: state.mistakes.map(findExercise).filter(Boolean).slice(0, 10), title: t('workOnMistakes') };
    }
    return null;
  }, [route.key]);
  const empty = !data || (data.exercises && !data.exercises.length);
  useEffect(() => { if (empty) nav.back(); }, [empty]);
  if (empty) return null;
  return <Lesson mode={route.mode} {...data} nav={nav} t={t} lang={lang} />;
}
