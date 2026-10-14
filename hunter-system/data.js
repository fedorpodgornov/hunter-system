var STORE_KEY = 'hunter-system-v1';
var DAY_BONUS = 120;
var FIRST_OF_DAY = 15;
var MAX_LEVEL = 100;
var STAT_CAP = 99;
var REROLL_LIMIT = 3;

var STATS = [
  { key: 'str', label: 'СИЛ', full: 'Сила' },
  { key: 'vit', label: 'ВЫН', full: 'Выносливость' },
  { key: 'agi', label: 'СКР', full: 'Скорость' },
  { key: 'wil', label: 'ВОЛ', full: 'Воля' }
];

var CLASSES = [
  { id: 'warrior', name: 'Воитель', desc: 'Тяжёлая база, железо и собственный вес.', bonus: { str: 4, vit: 2 } },
  { id: 'guard', name: 'Страж', desc: 'Долгая работа на выносливость, редко сдаёшься.', bonus: { vit: 4, str: 2 } },
  { id: 'scout', name: 'Следопыт', desc: 'Бег, прыжки, скорость и реакция.', bonus: { agi: 4, vit: 2 } },
  { id: 'tactician', name: 'Тактик', desc: 'Растяжка, дыхание, план и холодная голова.', bonus: { wil: 4, agi: 2 } }
];

var TYPES = {
  power: { name: 'Силовая', stat: 'str', mul: 1 },
  cardio: { name: 'Кардио', stat: 'vit', mul: 0.9 },
  run: { name: 'Бег', stat: 'agi', mul: 0.95 },
  fight: { name: 'Единоборства', stat: 'agi', mul: 1.1 },
  mobility: { name: 'Растяжка и мобильность', stat: 'wil', mul: 0.7 }
};

var INTENSITY = {
  low: { name: 'Низкая', mul: 0.8 },
  mid: { name: 'Средняя', mul: 1 },
  high: { name: 'Высокая', mul: 1.3 },
  max: { name: 'Предел', mul: 1.6 }
};

var SUPP_KINDS = [
  { key: 'protein', name: 'Протеин' },
  { key: 'creatine', name: 'Креатин' },
  { key: 'amino', name: 'Аминокислоты (BCAA/EAA)' },
  { key: 'vitamins', name: 'Витамины и минералы' },
  { key: 'electrolytes', name: 'Электролиты / изотоник' },
  { key: 'preworkout', name: 'Предтренировочный комплекс' },
  { key: 'omega', name: 'Омега-3' },
  { key: 'custom', name: 'Свой вариант' }
];

var SUPP_WHEN = [
  { key: 'morning', name: 'Утро' },
  { key: 'before', name: 'До тренировки' },
  { key: 'during', name: 'Во время тренировки' },
  { key: 'after', name: 'После тренировки' },
  { key: 'evening', name: 'Вечер' }
];

var LIMITS = {
  entryMinutes: 240,
  dayMinutes: 360,
  dayEntries: 6,
  flagsForFreeze: 3,
  freezeHours: 24
};

var REMIND_KEYS = ['train', 'supp', 'day'];

function remindDefaults() {
  return {
    trainOn: true, trainTime: '18:00',
    suppOn: false, suppTime: '09:00',
    dayOn: true, dayTime: '21:00',
    fired: {}
  };
}

function remindName(key) {
  if (key === 'train') return 'Тренировка';
  if (key === 'supp') return 'Добавки';
  return 'Итог дня';
}

function suppKindName(entry) {
  if (entry.kind === 'custom') return entry.custom || 'Свой вариант';
  var found = null;
  SUPP_KINDS.forEach(function (k) { if (k.key === entry.kind) found = k; });
  return found ? found.name : entry.kind;
}

function suppWhenName(key) {
  var found = null;
  SUPP_WHEN.forEach(function (w) { if (w.key === key) found = w; });
  return found ? found.name : key;
}

var RANKS = [
  { id: 'E', from: 1, title: 'Пробуждённый', color: '#8fb3c9' },
  { id: 'D', from: 10, title: 'Охотник', color: '#5ce1ff' },
  { id: 'C', from: 20, title: 'Ветеран', color: '#5ff0a8' },
  { id: 'B', from: 30, title: 'Элита', color: '#ffd166' },
  { id: 'A', from: 45, title: 'Мастер', color: '#ff9a3c' },
  { id: 'S', from: 60, title: 'Абсолют', color: '#ff5f7a' },
  { id: 'EX', from: 80, title: 'Легенда', color: '#c68cff' }
];

var QUEST_POOL = [
  { id: 'pushups', label: 'Отжимания', unit: 'повт.', step: 5, targets: [20, 30, 40, 50], stat: 'str', exp: 30 },
  { id: 'squats', label: 'Приседания', unit: 'повт.', step: 10, targets: [30, 40, 50, 60], stat: 'vit', exp: 30 },
  { id: 'plank', label: 'Планка', unit: 'сек', step: 15, targets: [60, 90, 120, 150], stat: 'wil', exp: 30 },
  { id: 'cardio', label: 'Кардио', unit: 'мин', step: 5, targets: [15, 20, 25, 30], stat: 'vit', exp: 35 },
  { id: 'stretch', label: 'Растяжка', unit: 'мин', step: 5, targets: [10, 15, 20, 25], stat: 'wil', exp: 25 },
  { id: 'burpees', label: 'Бёрпи', unit: 'повт.', step: 5, targets: [15, 20, 25, 30], stat: 'agi', exp: 40 },
  { id: 'run', label: 'Бег', unit: 'мин', step: 5, targets: [15, 20, 25, 30], stat: 'agi', exp: 35 },
  { id: 'stairs', label: 'Подъём по лестнице', unit: 'мин', step: 5, targets: [10, 15, 20, 25], stat: 'agi', exp: 25 },
  { id: 'pullups', label: 'Подтягивания', unit: 'повт.', step: 1, targets: [5, 8, 10, 12], stat: 'str', exp: 45 },
  { id: 'situps', label: 'Пресс (скручивания)', unit: 'повт.', step: 10, targets: [30, 40, 50, 60], stat: 'str', exp: 30 },
  { id: 'walk', label: 'Быстрая ходьба', unit: 'мин', step: 10, targets: [20, 30, 40, 50], stat: 'vit', exp: 20 },
  { id: 'jumprope', label: 'Скакалка', unit: 'мин', step: 5, targets: [10, 15, 20], stat: 'agi', exp: 30 }
];

var ACH = [
  { id: 'first', n: 'Первая кровь', d: 'Записать первую тренировку', exp: 30, test: function (c) { return c.workouts >= 1; } },
  { id: 'five', n: 'Разогрев', d: 'Пять тренировок в журнале', exp: 60, test: function (c) { return c.workouts >= 5; } },
  { id: 'twentyfive', n: 'Хроникёр', d: 'Двадцать пять тренировок', exp: 150, test: function (c) { return c.workouts >= 25; } },
  { id: 'streak3', n: 'Три дня подряд', d: 'Серия из трёх дней', exp: 70, test: function (c) { return c.best >= 3; } },
  { id: 'streak7', n: 'Неделя без пропусков', d: 'Серия из семи дней', exp: 200, test: function (c) { return c.best >= 7; } },
  { id: 'limit', n: 'За пределом', d: 'Тренировка с интенсивностью «Предел»', exp: 80, test: function (c) { return c.maxIntensity; } },
  { id: 'night', n: 'Ночной охотник', d: 'Тренировка после 22:00', exp: 60, test: function (c) { return c.night; } },
  { id: 'early', n: 'Рассветный рейд', d: 'Тренировка до 7:00', exp: 60, test: function (c) { return c.early; } },
  { id: 'hours5', n: 'Пять часов', d: 'Триста минут в сумме', exp: 120, test: function (c) { return c.minutes >= 300; } },
  { id: 'quests10', n: 'Исполнитель', d: 'Десять выполненных квестов', exp: 140, test: function (c) { return c.questsDone >= 10; } },
  { id: 'rankC', n: 'Ранг C', d: 'Достичь 20 уровня', exp: 120, test: function (c) { return c.level >= 20; } },
  { id: 'rankB', n: 'Ранг B', d: 'Достичь 30 уровня', exp: 180, test: function (c) { return c.level >= 30; } },
  { id: 'rankA', n: 'Ранг A', d: 'Достичь 45 уровня', exp: 260, test: function (c) { return c.level >= 45; } },
  { id: 'rankS', n: 'Ранг S', d: 'Достичь 60 уровня', exp: 400, test: function (c) { return c.level >= 60; } },
  { id: 'str30', n: 'Стальная хватка', d: 'Сила 30 и выше', exp: 90, test: function (c) { return c.stats.str >= 30; } }
];

var state = null;
var storageOk = true;

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function dateKey(d) {
  var dt = d || new Date();
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
}

function todayKey() { return dateKey(new Date()); }

function shiftDays(key, delta) {
  var p = key.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

var MONTH_NAMES = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function humanDate(key) {
  var p = key.split('-');
  return Number(p[2]) + ' ' + MONTH_NAMES[Number(p[1]) - 1] + ' ' + p[0];
}

function shortDate(key) {
  var p = key.split('-');
  return p[2] + '.' + p[1];
}

function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function needExp(level) { return Math.round(90 * Math.pow(level, 1.15)); }

function levelInfo(total) {
  var level = 1, acc = 0;
  while (level < MAX_LEVEL && total >= acc + needExp(level)) { acc += needExp(level); level++; }
  return { level: level, floor: acc, into: Math.min(total - acc, needExp(level)), toNext: needExp(level) };
}

function rankOf(level) {
  var r = RANKS[0], idx = 0;
  for (var i = 0; i < RANKS.length; i++) {
    if (level >= RANKS[i].from) { r = RANKS[i]; idx = i; }
  }
  return { rank: r, index: idx };
}

function defaultState() {
  return { v: 1, hunter: null, workouts: [], supps: [], quests: {}, ach: {}, remind: remindDefaults(), bestStreak: 0 };
}

function loadState() {
  var raw = null;
  try { raw = window.localStorage.getItem(STORE_KEY); } catch (e) { storageOk = false; }
  if (!raw) return defaultState();
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultState();
    var s = defaultState();
    s.hunter = parsed.hunter || null;
    s.workouts = Array.isArray(parsed.workouts) ? parsed.workouts : [];
    s.supps = Array.isArray(parsed.supps) ? parsed.supps : [];
    s.quests = parsed.quests && typeof parsed.quests === 'object' ? parsed.quests : {};
    s.ach = parsed.ach && typeof parsed.ach === 'object' ? parsed.ach : {};
    s.remind = Object.assign(remindDefaults(), parsed.remind && typeof parsed.remind === 'object' ? parsed.remind : {});
    s.bestStreak = Number(parsed.bestStreak) || 0;
    return s;
  } catch (e) { return defaultState(); }
}

function saveState() {
  if (!storageOk) return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    storageOk = false;
    renderStorageChip();
  }
}
