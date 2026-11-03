// Badges & achievements (SPEC §9). Hidden ones show as «?» until earned.
export const BADGES = [
  { id: 'first-lesson', icon: '⭐', title: { ua: 'Перший урок', ru: 'Первый урок' }, desc: { ua: 'Пройдено перший урок', ru: 'Пройден первый урок' }, test: (s) => Object.keys(s.lessonsDone).length >= 1 },
  { id: 'perfect', icon: '💎', title: { ua: 'Без помилок', ru: 'Без ошибок' }, desc: { ua: 'Урок на 100%', ru: 'Урок на 100%' }, test: (s) => Object.values(s.lessonsDone).some((l) => l.acc === 1) },
  { id: 'streak-3', icon: '🔥', title: { ua: 'Стрік 3', ru: 'Стрик 3' }, desc: { ua: '3 дні поспіль', ru: '3 дня подряд' }, test: (s) => s.streak.best >= 3 },
  { id: 'streak-7', icon: '🔥', title: { ua: 'Стрік 7', ru: 'Стрик 7' }, desc: { ua: '7 днів поспіль', ru: '7 дней подряд' }, test: (s) => s.streak.best >= 7 },
  { id: 'unit-master', icon: '🏆', title: { ua: 'Unit Master', ru: 'Unit Master' }, desc: { ua: 'Здано перший чекпоінт', ru: 'Сдан первый чекпоинт' }, test: (s) => Object.keys(s.unitsPassed).some((id) => !id.startsWith('x-')) },
  { id: 'words-16', icon: '📚', title: { ua: 'Словниковий запас', ru: 'Словарный запас' }, desc: { ua: 'Вивчено 16 слів', ru: 'Выучено 16 слов' }, test: (s) => Object.values(s.vocab).filter((c) => c.learned).length >= 16 },
  { id: 'ipa-reader', icon: '🏅', title: { ua: 'Читаю транскрипцію', ru: 'Читаю транскрипцию' }, desc: { ua: 'Мінікурс транскрипції', ru: 'Мини-курс транскрипции' }, test: (s) => Boolean(s.unitsPassed['x-ipa']) },
  { id: 'xp-500', icon: '⚡', title: { ua: '500 XP', ru: '500 XP' }, desc: { ua: 'Набрано 500 XP', ru: 'Набрано 500 XP' }, test: (s) => s.xp >= 500 },
  { id: 'level-a1', icon: '👑', title: { ua: 'Рівень A1', ru: 'Уровень A1' }, desc: { ua: 'Пройдено рівень A1', ru: 'Пройден уровень A1' }, test: (s) => Boolean(s.levelsPassed.A1) },
  { id: 'comeback', icon: '🎁', hidden: true, title: { ua: 'Повернення', ru: 'Возвращение' }, desc: { ua: 'Виправлено 10 помилок', ru: 'Исправлено 10 ошибок' }, test: (s) => (s.fixedMistakes || 0) >= 10 },
];

export function badgeById(id) {
  return BADGES.find((b) => b.id === id);
}
