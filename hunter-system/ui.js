function renderStorageChip() {
  $('save-state').innerHTML = storageOk
    ? 'Хранилище: <b>браузер</b>'
    : 'Хранилище: <b>только эта сессия</b>';
}

function renderGateClasses() {
  $('classes').innerHTML = CLASSES.map(function (c, i) {
    return '<label class="klass">' +
      '<input type="radio" name="hunter-class" value="' + c.id + '"' + (i === 0 ? ' checked' : '') + '>' +
      '<span class="klass__n">' + esc(c.name) + '</span>' +
      '<span class="klass__d">' + esc(c.desc) + '</span>' +
      '<span class="klass__s">' + esc(classBonusText(c)) + '</span>' +
      '</label>';
  }).join('');
}

function classBonusText(c) {
  var parts = [];
  STATS.forEach(function (s) {
    if (c.bonus[s.key]) parts.push(s.label + ' +' + c.bonus[s.key]);
  });
  return parts.join(' · ');
}

function renderStatus(d) {
  var h = state.hunter || {};
  $('hunter-name-out').textContent = h.name || 'Охотник';
  var cls = null;
  CLASSES.forEach(function (c) { if (h.cls === c.id) cls = c; });
  $('hunter-class-out').textContent = cls
    ? ('Класс: ' + cls.name + (h.since ? ' · в системе с ' + humanDate(h.since) : ''))
    : 'Класс не выбран';
  $('hunter-title-out').textContent = d.rank.title;
  $('status-date').textContent = humanDate(todayKey());

  $('rank-letter').textContent = d.rank.id;
  $('rank-badge').style.setProperty('--rc', d.rank.color);

  $('level-out').textContent = d.level;
  $('exp-in').textContent = d.into;
  $('exp-need').textContent = d.toNext;
  var pct = d.toNext > 0 ? Math.round(d.into / d.toNext * 100) : 100;
  $('exp-fill').style.width = pct + '%';
  $('exp-bar').setAttribute('aria-valuemax', d.toNext);
  $('exp-bar').setAttribute('aria-valuenow', d.into);

  $('rankscale').innerHTML = RANKS.map(function (r, i) {
    return '<i class="' + (i <= d.rankIndex ? 'on' : '') + '"></i>';
  }).join('');

  $('metric-workouts').textContent = d.workouts;
  $('metric-minutes').textContent = d.minutes;
  $('metric-streak').textContent = d.streak;
  $('metric-total-exp').textContent = d.totalExp;
}

function renderRadar(stats) {
  var cx = 120, cy = 122, R = 82, max = 60;
  var axes = [
    { key: 'str', label: 'СИЛ', a: -Math.PI / 2 },
    { key: 'agi', label: 'СКР', a: 0 },
    { key: 'vit', label: 'ВЫН', a: Math.PI / 2 },
    { key: 'wil', label: 'ВОЛ', a: Math.PI }
  ];
  var svg = '';
  [0.25, 0.5, 0.75, 1].forEach(function (f) {
    var pts = axes.map(function (ax) {
      return (cx + Math.cos(ax.a) * R * f).toFixed(1) + ',' + (cy + Math.sin(ax.a) * R * f).toFixed(1);
    }).join(' ');
    svg += '<polygon points="' + pts + '" fill="none" stroke="rgba(92,225,255,.18)" stroke-width="1"/>';
  });
  axes.forEach(function (ax) {
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + Math.cos(ax.a) * R).toFixed(1) + '" y2="' + (cy + Math.sin(ax.a) * R).toFixed(1) + '" stroke="rgba(92,225,255,.22)" stroke-width="1"/>';
    var lx = cx + Math.cos(ax.a) * (R + 20), ly = cy + Math.sin(ax.a) * (R + 16) + 4;
    svg += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" fill="#7e97ad" font-size="11" font-family="monospace" text-anchor="middle">' + ax.label + '</text>';
  });
  var poly = axes.map(function (ax) {
    var v = Math.min(stats[ax.key], max) / max;
    return (cx + Math.cos(ax.a) * R * v).toFixed(1) + ',' + (cy + Math.sin(ax.a) * R * v).toFixed(1);
  }).join(' ');
  svg += '<polygon points="' + poly + '" fill="rgba(92,225,255,.22)" stroke="#5ce1ff" stroke-width="2"/>';
  axes.forEach(function (ax) {
    var v = Math.min(stats[ax.key], max) / max;
    svg += '<circle cx="' + (cx + Math.cos(ax.a) * R * v).toFixed(1) + '" cy="' + (cy + Math.sin(ax.a) * R * v).toFixed(1) + '" r="3" fill="#5ce1ff"/>';
  });
  $('radar').innerHTML = svg;
}

function renderStatList(stats) {
  $('statlist').innerHTML = STATS.map(function (s) {
    var v = stats[s.key], pct = Math.min(100, Math.round(v / 60 * 100));
    return '<div class="statrow"><span>' + s.label + '</span>' +
      '<span class="stbar"><i style="width:' + pct + '%"></i></span>' +
      '<b class="num">' + v + '</b></div>';
  }).join('');
}

function renderQuests(d) {
  var day = questsFor(todayKey());
  var done = day.items.filter(function (it) { return it.done; }).length;
  $('quests-left').textContent = 'выполнено ' + done + ' / ' + day.items.length +
    ' · бонус за все три +' + DAY_BONUS + ' опыта';

  $('quests').innerHTML = day.items.map(function (it, i) {
    var label = null;
    STATS.forEach(function (s) { if (s.key === it.stat) label = s.label; });
    var pct = Math.min(100, Math.round(it.progress / it.target * 100));
    var canReroll = !it.done && day.rerolls < REROLL_LIMIT;
    return '<div class="quest' + (it.done ? ' is-done' : '') + '" id="quest-' + i + '">' +
      '<div class="quest__top">' +
        '<span class="quest__name">' + esc(it.label) + '</span>' +
        '<span class="quest__stat">' + esc(label || '') + ' +1</span>' +
        '<span class="quest__exp">+' + it.exp + ' опыта</span>' +
      '</div>' +
      '<div class="quest__row">' +
        '<span class="quest__prog" id="quest-progress-' + i + '"><b>' + it.progress + '</b> / ' + it.target + ' ' + esc(it.unit) + '</span>' +
        '<span class="questbar"><i style="width:' + pct + '%"></i></span>' +
        (it.done ? '<span class="questdone">Выполнено</span>' : '') +
      '</div>' +
      '<div class="quest__row">' +
        '<button class="btn btn--tiny" type="button" data-act="quest-plus" data-index="' + i + '"' + (it.done ? ' disabled' : '') + '>+' + it.step + ' ' + esc(it.unit) + '</button>' +
        '<button class="btn btn--tiny btn--ghost" type="button" data-act="quest-minus" data-index="' + i + '"' + (it.done || it.progress === 0 ? ' disabled' : '') + '>Отменить шаг</button>' +
        '<button class="btn btn--tiny' + (it.done ? ' btn--ghost' : ' btn--primary') + '" type="button" data-act="quest-done" data-index="' + i + '"' + (it.done ? ' disabled' : '') + '>Готово</button>' +
        '<button class="btn btn--tiny btn--ghost" type="button" data-act="quest-reroll" data-index="' + i + '"' + (canReroll ? '' : ' disabled') + '>Заменить</button>' +
      '</div>' +
    '</div>';
  }).join('');

  $('quests-reroll').disabled = done > 0 || day.rerolls >= REROLL_LIMIT;
  $('quests-reroll').textContent = 'Заменить набор (' + Math.max(0, REROLL_LIMIT - day.rerolls) + ')';
}

function renderJournal() {
  var host = $('journal');
  var items = state.workouts.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  $('journal-count').textContent = items.length ? 'всего ' + items.length : '';
  if (!items.length) {
    host.innerHTML = '<p class="empty">Журнал пуст. Запиши первую тренировку — Система ждёт.</p>';
    return;
  }
  host.innerHTML = items.map(function (w) {
    var t = TYPES[w.type], it = INTENSITY[w.intensity];
    return '<div class="logitem' + (w.flag ? ' logitem--flag' : '') + '">' +
      '<div class="logitem__main">' +
        '<div class="logitem__t">' + esc(t ? t.name : w.type) + ' · ' + w.minutes + ' мин · ' + esc(it ? it.name.toLowerCase() : '') + '</div>' +
        '<div class="logitem__d">' + humanDate(dateKey(new Date(w.at))) + (w.note ? ' — ' + esc(w.note) : '') + '</div>' +
        (w.flag ? '<div class="igbadge">На проверке: ' + esc(w.flag) + ' · опыт не начислен</div>' : '') +
      '</div>' +
      '<span class="logitem__e">+' + (w.exp || 0) + '</span>' +
      '<button class="btn btn--tiny btn--ghost" type="button" data-act="workout-del" data-id="' + esc(w.id) + '" aria-label="Удалить запись">Удалить</button>' +
    '</div>';
  }).join('');
}

function renderChart() {
  var days = [];
  for (var i = 6; i >= 0; i--) days.push(shiftDays(todayKey(), -i));
  var values = days.map(dayExp);
  var max = Math.max.apply(null, values.concat([1]));
  var sum = values.reduce(function (a, b) { return a + b; }, 0);
  var today = todayKey();

  $('chart').innerHTML = days.map(function (k, i) {
    var h = Math.max(3, Math.round(values[i] / max * 118));
    return '<div class="bar' + (k === today ? ' bar--today' : '') + '">' +
      '<span class="bar__v">' + values[i] + '</span>' +
      '<span class="bar__b" style="height:' + h + 'px"></span>' +
      '<span class="bar__l">' + shortDate(k) + '</span>' +
    '</div>';
  }).join('');
  $('chart-max').textContent = max === 1 && sum === 0 ? 0 : max;
  $('chart-sum').textContent = 'За неделю: ' + sum + ' опыта';
}

function plural(n, one, few, many) {
  var n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

function suppIndex() {
  var m = {};
  state.supps.forEach(function (s) {
    var k = dateKey(new Date(s.at));
    if (!m[k]) m[k] = [];
    m[k].push(s);
  });
  Object.keys(m).forEach(function (k) {
    m[k].sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  });
  return m;
}

function renderIntegrity() {
  var st = integrityState();
  $('ig-status').textContent = st.status;
  $('ig-note').textContent = st.frozenUntil
    ? 'Заморозка опыта до ' + pad2(st.frozenUntil.getHours()) + ':' + pad2(st.frozenUntil.getMinutes()) +
      ': записи сохраняются, но опыт не начисляется.'
    : 'Одна запись до ' + LIMITS.entryMinutes + ' минут, до ' + LIMITS.dayMinutes +
      ' минут и до ' + LIMITS.dayEntries + ' записей в день.';
  if (!st.flags.length) {
    $('ig-list').innerHTML = '<p class="empty">Нарушений нет. Так держать.</p>';
    return;
  }
  $('ig-list').innerHTML = st.flags.slice(0, 8).map(function (w) {
    var t = TYPES[w.type];
    var d = new Date(w.at);
    return '<div class="logitem logitem--flag">' +
      '<div class="logitem__main">' +
        '<div class="logitem__t">' + esc(t ? t.name : w.type) + ' · ' + w.minutes + ' мин</div>' +
        '<div class="logitem__d">' + humanDate(dateKey(d)) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '</div>' +
        '<div class="igbadge">' + esc(w.flag) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderReminders() {
  $('rem-next').textContent = remindNextText();
  $('rem-rows').innerHTML = REMIND_KEYS.map(function (key) {
    var hint = key === 'train' ? 'если сегодня нет записи'
      : (key === 'supp' ? 'если приёмы не отмечены' : 'итог дня и серия');
    return '<div class="remrow">' +
      '<div class="remrow__t">' +
        '<div class="remrow__n">' + esc(remindName(key)) + '</div>' +
        '<div class="remrow__h">' + esc(hint) + '</div>' +
      '</div>' +
      '<label class="switch"><input type="checkbox" id="rem-' + key + '-on"' + (state.remind[key + 'On'] ? ' checked' : '') + '>вкл</label>' +
      '<input type="time" id="rem-' + key + '-time" value="' + esc(state.remind[key + 'Time']) + '" aria-label="Время напоминания: ' + esc(remindName(key)) + '">' +
    '</div>';
  }).join('');
}

function renderSupps() {
  var keys = [];
  for (var i = 6; i >= 0; i--) keys.push(shiftDays(todayKey(), -i));
  var byDay = suppIndex();
  var total = 0, days = 0;
  keys.forEach(function (k) {
    if (byDay[k] && byDay[k].length) { days++; total += byDay[k].length; }
  });
  $('sup-count').textContent = 'за 7 дней: ' + total + ' ' + plural(total, 'приём', 'приёма', 'приёмов') +
    ' · ' + days + ' ' + plural(days, 'день', 'дня', 'дней');
  $('sup-week').innerHTML = keys.map(function (k) {
    return '<i class="' + (byDay[k] && byDay[k].length ? 'on' : '') + '"></i>';
  }).join('');

  var shown = keys.slice().reverse().filter(function (k) { return byDay[k] && byDay[k].length; });
  if (!shown.length) {
    $('sup-list').innerHTML = '<p class="empty">За неделю приёмов не отмечено. Ведёшь курс — отмечай здесь, чтобы видеть историю.</p>';
    return;
  }
  $('sup-list').innerHTML = shown.map(function (k) {
    var rows = byDay[k].map(function (s) {
      var d = new Date(s.at);
      return '<div class="logitem logitem--sup">' +
        '<div class="logitem__main">' +
          '<div class="logitem__t">' + esc(suppKindName(s)) + (s.dose ? ' · ' + esc(s.dose) : '') + '</div>' +
          '<div class="logitem__d">' + esc(suppWhenName(s.when)) + ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '</div>' +
        '</div>' +
        '<button class="btn btn--tiny btn--ghost" type="button" data-act="supp-del" data-id="' + esc(s.id) + '">Убрать</button>' +
      '</div>';
    }).join('');
    return '<p class="suphead">' + humanDate(k) + '</p>' + rows;
  }).join('');
}

function renderAchievements() {
  var unlocked = ACH.filter(function (a) { return state.ach[a.id]; }).length;
  $('ach-count').textContent = unlocked + ' / ' + ACH.length;
  $('achievements').innerHTML = ACH.map(function (a) {
    var on = !!state.ach[a.id];
    return '<div class="ach' + (on ? ' is-un' : '') + '">' +
      '<div class="ach__n">' + esc(a.n) + '</div>' +
      '<div class="ach__d">' + esc(on ? a.d + ' · +' + a.exp + ' опыта' : 'закрыто') + '</div>' +
    '</div>';
  }).join('');
}

function renderExpPreview() {
  var minutes = Number($('log-minutes').value) || 0;
  var type = $('log-type').value;
  var intensity = $('log-intensity').value;
  if (minutes <= 0) { $('exp-preview').textContent = 'Ожидаемый опыт: —'; return; }
  var first = !hasWorkoutToday();
  var val = expFor(minutes, type, intensity, first);
  $('exp-preview').textContent = 'Ожидаемый опыт: ' + val + (first ? ' (включая +' + FIRST_OF_DAY + ' за первую тренировку дня)' : '');
}

function renderAll() {
  var d = derive();
  var hasHunter = !!state.hunter;
  $('gate').hidden = hasHunter;
  $('app').hidden = !hasHunter;
  $('reset-btn').hidden = !hasHunter;
  renderStatus(d);
  renderRadar(d.stats);
  renderStatList(d.stats);
  renderQuests(d);
  renderReminders();
  renderSupps();
  renderIntegrity();
  renderJournal();
  renderChart();
  renderAchievements();
  renderExpPreview();
  renderStorageChip();
}

function commit() {
  pruneHistory();
  var d = derive();
  var levelBefore = d.level;
  var rankBefore = d.rank.id;
  saveState();

  if (checkAchievements(d)) {
    d = derive();
  }

  if (d.level > levelBefore) {
    note('Повышение уровня', 'Уровень ' + d.level + ' · ' + rankOf(d.level).title, ['Характеристики +1 к каждой'], 'ok');
  }
  if (d.rank.id !== rankBefore && d.level > levelBefore) {
    note('Ранг повышен', rankBefore + ' → ' + d.rank.id, ['Доступны более тяжёлые квесты, если сам готов.'], 'ember');
  }
  if (d.streak > (state.bestStreak || 0)) state.bestStreak = Math.max(d.streak, state.bestStreak || 0);

  saveState();
  renderAll();
}
