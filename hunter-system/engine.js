var notifyQueue = [];
var notifyBusy = false;

function questsFor(key) {
  if (!state.quests[key]) {
    state.quests[key] = { date: key, items: generateQuests(key), rerolls: 0 };
  }
  return state.quests[key];
}

function makeQuest(tpl, rnd) {
  return {
    tpl: tpl.id, label: tpl.label, unit: tpl.unit, step: tpl.step,
    target: tpl.targets[Math.floor(rnd() * tpl.targets.length)],
    stat: tpl.stat, exp: tpl.exp, progress: 0, done: false
  };
}

function generateQuests(key) {
  var rnd = mulberry32(hashStr('system:' + key));
  var pool = QUEST_POOL.slice();
  for (var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  var picked = [], used = {};
  for (var k = 0; k < pool.length && picked.length < 3; k++) {
    if (used[pool[k].stat]) continue;
    used[pool[k].stat] = true;
    picked.push(makeQuest(pool[k], rnd));
  }
  return picked;
}

function replaceQuest(day, index) {
  var busy = {};
  day.items.forEach(function (it) { busy[it.tpl] = true; });
  var candidates = QUEST_POOL.filter(function (q) { return !busy[q.id]; });
  if (!candidates.length) return;
  var rnd = mulberry32(hashStr('reroll:' + day.date + ':' + index + ':' + day.rerolls));
  day.items[index] = makeQuest(candidates[Math.floor(rnd() * candidates.length)], rnd);
}

function dayAllDone(day) {
  return day.items.length > 0 && day.items.every(function (it) { return it.done; });
}

function dayExp(key) {
  var total = 0;
  state.workouts.forEach(function (w) { if (dateKey(new Date(w.at)) === key) total += w.exp || 0; });
  var day = state.quests[key];
  if (day) {
    day.items.forEach(function (it) { if (it.done) total += it.exp; });
    if (dayAllDone(day)) total += DAY_BONUS;
  }
  return total;
}

function derive() {
  var totalExp = 0, minutes = 0, byType = {};
  var maxIntensity = false, night = false, early = false;

  var cleanMinutes = 0, cleanWorkouts = 0;
  state.workouts.forEach(function (w) {
    totalExp += w.exp || 0;
    minutes += w.minutes || 0;
    byType[w.type] = (byType[w.type] || 0) + 1;
    if (w.flag) return;
    cleanMinutes += w.minutes || 0;
    cleanWorkouts++;
    if (w.intensity === 'max') maxIntensity = true;
    var h = new Date(w.at).getHours();
    if (h >= 22) night = true;
    if (h < 7) early = true;
  });

  var questsDone = 0, questDates = {};
  Object.keys(state.quests).forEach(function (key) {
    var day = state.quests[key];
    if (!day || !Array.isArray(day.items)) return;
    day.items.forEach(function (it) {
      if (it.done) { questsDone++; totalExp += it.exp; }
    });
    if (dayAllDone(day)) { totalExp += DAY_BONUS; questDates[key] = true; }
  });

  Object.keys(state.ach).forEach(function (id) { totalExp += (state.ach[id] && state.ach[id].exp) || 0; });

  var li = levelInfo(totalExp);
  var ri = rankOf(li.level);

  var cls = null;
  CLASSES.forEach(function (c) { if (state.hunter && state.hunter.cls === c.id) cls = c; });

  var stats = {};
  STATS.forEach(function (s) { stats[s.key] = 10 + (cls && cls.bonus[s.key] ? cls.bonus[s.key] : 0); });
  state.workouts.forEach(function (w) {
    if (w.flag) return;
    var t = TYPES[w.type];
    if (!t) return;
    stats[t.stat] += Math.max(1, Math.round((w.minutes || 0) / 25));
  });
  Object.keys(state.quests).forEach(function (key) {
    var day = state.quests[key];
    if (!day || !Array.isArray(day.items)) return;
    day.items.forEach(function (it) { if (it.done) stats[it.stat] += 1; });
  });
  STATS.forEach(function (s) { stats[s.key] = Math.min(STAT_CAP, stats[s.key] + li.level - 1); });

  var active = {};
  state.workouts.forEach(function (w) { active[dateKey(new Date(w.at))] = true; });
  Object.keys(questDates).forEach(function (k) { active[k] = true; });

  var today = todayKey();
  var cursor = active[today] ? today : shiftDays(today, -1);
  var streak = 0;
  while (active[cursor] && streak < 3650) { streak++; cursor = shiftDays(cursor, -1); }

  var bestDay = 0, run = 0, prev = null;
  Object.keys(active).sort().forEach(function (k) {
    run = (prev && shiftDays(prev, 1) === k) ? run + 1 : 1;
    if (run > bestDay) bestDay = run;
    prev = k;
  });

  return {
    totalExp: totalExp,
    minutes: minutes,
    workouts: state.workouts.length,
    cleanMinutes: cleanMinutes,
    cleanWorkouts: cleanWorkouts,
    questsDone: questsDone,
    maxIntensity: maxIntensity,
    night: night,
    early: early,
    byType: byType,
    level: li.level,
    into: li.into,
    toNext: li.toNext,
    rank: ri.rank,
    rankIndex: ri.index,
    stats: stats,
    streak: streak,
    best: Math.max(bestDay, state.bestStreak || 0)
  };
}

function note(title, body, lines, tone) {
  notifyQueue.push({ title: title, body: body, lines: lines || [], tone: tone || '' });
  if (!notifyBusy) pumpNotes();
}

function pumpNotes() {
  if (!notifyQueue.length) { notifyBusy = false; return; }
  notifyBusy = true;
  var item = notifyQueue.shift();
  var host = $('notify');
  var el = document.createElement('div');
  el.className = 'note' + (item.tone ? ' note--' + item.tone : '');
  var html = '<div class="note__h">' + esc(item.title) + '</div>';
  if (item.body) html += '<div class="note__b">' + esc(item.body) + '</div>';
  item.lines.forEach(function (l, i) {
    html += '<div class="note__l" style="animation-delay:' + (i * 110) + 'ms">' + esc(l) + '</div>';
  });
  el.innerHTML = html;
  host.appendChild(el);
  window.setTimeout(function () {
    if (el.parentNode) el.parentNode.removeChild(el);
    window.setTimeout(pumpNotes, 200);
  }, 3400);
}

function achievementContext(d) {
  return {
    workouts: d.cleanWorkouts, minutes: d.cleanMinutes, level: d.level, stats: d.stats,
    streak: d.streak, best: d.best, questsDone: d.questsDone,
    maxIntensity: d.maxIntensity, night: d.night, early: d.early
  };
}

function checkAchievements(d) {
  var ctx = achievementContext(d);
  var unlocked = [];
  ACH.forEach(function (a) {
    if (state.ach[a.id]) return;
    var ok = false;
    try { ok = !!a.test(ctx); } catch (e) { ok = false; }
    if (ok) {
      state.ach[a.id] = { date: new Date().toISOString(), exp: a.exp };
      unlocked.push(a);
    }
  });
  unlocked.forEach(function (a) {
    note('Достижение разблокировано', a.n, [a.d, '+' + a.exp + ' опыта'], 'ember');
  });
  return unlocked.length > 0;
}

function expFor(minutes, type, intensity, firstToday) {
  var t = TYPES[type], i = INTENSITY[intensity];
  if (!t || !i) return 0;
  return Math.round(minutes * 1.6 * i.mul * t.mul) + (firstToday ? FIRST_OF_DAY : 0);
}

function hasWorkoutToday() {
  var k = todayKey();
  return state.workouts.some(function (w) { return dateKey(new Date(w.at)) === k; });
}

function hasSuppToday() {
  var k = todayKey();
  return state.supps.some(function (s) { return dateKey(new Date(s.at)) === k; });
}

function entriesOfDay(key) {
  return state.workouts.filter(function (w) { return dateKey(new Date(w.at)) === key; });
}

function checkPlausibility(minutes) {
  var today = todayKey();
  var todayList = entriesOfDay(today);
  var todayMinutes = todayList.reduce(function (a, w) { return a + (w.minutes || 0); }, 0);
  var reasons = [];
  if (minutes > LIMITS.entryMinutes) reasons.push('запись длиннее ' + LIMITS.entryMinutes + ' минут');
  if (todayMinutes + minutes > LIMITS.dayMinutes) reasons.push('больше ' + LIMITS.dayMinutes + ' минут за день');
  if (todayList.length + 1 > LIMITS.dayEntries) reasons.push('больше ' + LIMITS.dayEntries + ' записей за день');
  return reasons;
}

function flaggedEntries() {
  var out = [];
  state.workouts.forEach(function (w) { if (w.flag) out.push(w); });
  out.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  return out;
}

function freezeUntil() {
  var flags = flaggedEntries();
  if (flags.length < LIMITS.flagsForFreeze) return null;
  var third = flags[LIMITS.flagsForFreeze - 1];
  var until = new Date(new Date(third.at).getTime() + LIMITS.freezeHours * 3600000);
  return until.getTime() > Date.now() ? until : null;
}

function integrityState() {
  var flags = flaggedEntries();
  var frozen = freezeUntil();
  return {
    flags: flags,
    count: flags.length,
    frozenUntil: frozen,
    status: 'на проверке: ' + flags.length + ' · ' + (frozen ? 'заморозка до ' + pad2(frozen.getHours()) + ':' + pad2(frozen.getMinutes()) : 'заморозки нет')
  };
}

function remindDue(now) {
  var d = now || new Date();
  var key = todayKey();
  var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  var out = [];
  function fired(k) { return !!state.remind.fired[key + ':' + k]; }
  if (state.remind.trainOn && hm >= state.remind.trainTime && !fired('train') && !hasWorkoutToday()) {
    out.push({ key: 'train', title: 'Пора на тренировку', body: 'Сегодня записи ещё нет — Система ждёт.' });
  }
  if (state.remind.suppOn && hm >= state.remind.suppTime && !fired('supp') && !hasSuppToday()) {
    out.push({ key: 'supp', title: 'Приём добавок', body: 'Сегодня приёмы не отмечены.' });
  }
  if (state.remind.dayOn && hm >= state.remind.dayTime && !fired('day')) {
    out.push({
      key: 'day',
      title: 'День закрывается',
      body: hasWorkoutToday() ? 'Записи есть — серия цела.' : 'Без записи серия сегодня прервётся.'
    });
  }
  return out;
}

function remindNextText() {
  var list = [];
  if (state.remind.trainOn) list.push({ name: 'Тренировка', time: state.remind.trainTime });
  if (state.remind.suppOn) list.push({ name: 'Добавки', time: state.remind.suppTime });
  if (state.remind.dayOn) list.push({ name: 'Итог дня', time: state.remind.dayTime });
  if (!list.length) return 'выключены';
  list.sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  return 'Ближайшее: ' + list[0].name + ' в ' + list[0].time;
}

function pruneHistory() {
  var keys = Object.keys(state.quests).sort();
  while (keys.length > 60) {
    delete state.quests[keys.shift()];
  }
  if (state.workouts.length > 400) {
    state.workouts = state.workouts.slice(-400);
  }
  if (state.supps.length > 500) {
    state.supps = state.supps.slice(-500);
  }
  var today = todayKey();
  Object.keys(state.remind.fired).forEach(function (k) {
    if (k.indexOf(today) !== 0) delete state.remind.fired[k];
  });
}
