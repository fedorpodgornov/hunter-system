function fillSelects() {
  $('log-type').innerHTML = Object.keys(TYPES).map(function (k) {
    return '<option value="' + k + '">' + esc(TYPES[k].name) + '</option>';
  }).join('');
  $('log-intensity').innerHTML = Object.keys(INTENSITY).map(function (k, i) {
    return '<option value="' + k + '"' + (k === 'mid' ? ' selected' : '') + '>' + esc(INTENSITY[k].name) + '</option>';
  }).join('');
  $('sup-kind').innerHTML = SUPP_KINDS.map(function (k) {
    return '<option value="' + k.key + '">' + esc(k.name) + '</option>';
  }).join('');
  $('sup-when').innerHTML = SUPP_WHEN.map(function (w, i) {
    return '<option value="' + w.key + '"' + (w.key === 'after' ? ' selected' : '') + '>' + esc(w.name) + '</option>';
  }).join('');
}

function addSupp() {
  var err = $('sup-error');
  var kind = $('sup-kind').value;
  var custom = $('sup-custom').value.trim();
  if (kind === 'custom' && custom.length < 2) {
    err.className = 'err';
    err.textContent = 'Напиши своё название — минимум 2 символа.';
    $('sup-custom').classList.add('input--err');
    try { $('sup-custom').focus(); } catch (e) {}
    return;
  }
  $('sup-custom').classList.remove('input--err');
  var dose = $('sup-dose').value.trim().slice(0, 16);
  var entry = {
    id: 'sp' + Date.now(),
    at: new Date().toISOString(),
    kind: kind,
    custom: kind === 'custom' ? custom : '',
    dose: dose,
    when: $('sup-when').value
  };
  state.supps.push(entry);
  err.className = 'err ok';
  err.textContent = 'Отмечено: ' + suppKindName(entry) + (dose ? ' · ' + dose : '') + '.';
  $('sup-dose').value = '';
  commit();
}

function removeSupp(id, btn) {
  if (!btn) return;
  if (btn.getAttribute('data-confirm') !== '1') {
    btn.setAttribute('data-confirm', '1');
    btn.textContent = 'Точно убрать?';
    btn.classList.add('btn--danger');
    window.setTimeout(function () {
      if (!document.body.contains(btn)) return;
      btn.setAttribute('data-confirm', '0');
      btn.textContent = 'Убрать';
      btn.classList.remove('btn--danger');
    }, 6000);
    return;
  }
  state.supps = state.supps.filter(function (s) { return s.id !== id; });
  commit();
}

function showGateError(text) {
  var err = $('gate-error');
  err.className = 'err';
  err.textContent = text;
  $('hunter-name').classList.add('input--err');
  try { $('hunter-name').focus(); } catch (e) {}
}

function clearGateError() {
  $('hunter-name').classList.remove('input--err');
  if ($('gate-error').textContent) {
    $('gate-error').className = 'err';
    $('gate-error').textContent = '';
  }
}

function gateSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  var name = $('hunter-name').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) {
    showGateError('Сначала введи имя охотника — минимум 2 символа. Оно будет стоять в статусе.');
    return;
  }
  var cls = 'warrior';
  var checked = document.querySelector('input[name="hunter-class"]:checked');
  if (checked) cls = checked.value;
  clearGateError();
  state.hunter = { name: name, cls: cls, since: todayKey() };
  questsFor(todayKey());
  commit();
  note('Регистрация завершена', name + ', добро пожаловать в Систему', [
    'Класс: ' + (CLASSES.filter(function (c) { return c.id === cls; })[0] || {}).name,
    'Ранг E. Первый ежедневный квест уже ждёт.'
  ], 'ok');
}

function logSubmit(e) {
  e.preventDefault();
  var err = $('log-error');
  var minutes = Number($('log-minutes').value);
  var noteText = $('log-note').value.trim();
  if ($('log-minutes').value === '' || !isFinite(minutes) || minutes <= 0) {
    err.className = 'err';
    err.textContent = 'Укажи длительность в минутах — например 45.';
    $('log-minutes').classList.add('input--err');
    try { $('log-minutes').focus(); } catch (e) {}
    return;
  }
  if (minutes > 600) {
    err.className = 'err';
    err.textContent = 'Максимум 600 минут за одну запись.';
    $('log-minutes').classList.add('input--err');
    try { $('log-minutes').focus(); } catch (e) {}
    return;
  }
  var type = $('log-type').value;
  var intensity = $('log-intensity').value;
  var frozen = freezeUntil();
  var reasons = checkPlausibility(minutes);
  if (frozen) reasons.push('заморозка начисления до ' + pad2(frozen.getHours()) + ':' + pad2(frozen.getMinutes()));
  var flag = reasons.length ? reasons.join('; ') : null;
  var first = !hasWorkoutToday();
  var exp = flag ? 0 : expFor(minutes, type, intensity, first);
  var streakBefore = derive().streak;

  state.workouts.push({
    id: 'w' + Date.now(),
    at: new Date().toISOString(),
    type: type,
    minutes: minutes,
    intensity: intensity,
    note: noteText.slice(0, 160),
    exp: exp,
    flag: flag
  });

  if (flag) {
    err.className = 'err';
    err.textContent = 'Опыт не начислен: ' + flag + '.';
  } else {
    err.className = 'err ok';
    err.textContent = 'Записано: +' + exp + ' опыта.';
  }
  $('log-minutes').value = '';
  $('log-note').value = '';
  commit();

  if (flag) {
    note('Запись на проверке', 'Опыт не начислен', [flag], 'ember');
    return;
  }

  var after = derive();
  var lines = [TYPES[type].name + ' · ' + minutes + ' мин · ' + INTENSITY[intensity].name.toLowerCase()];
  if (first) lines.push('Первая тренировка дня: +' + FIRST_OF_DAY + ' опыта');
  lines.push('Серия: ' + after.streak + ' дн. подряд');
  note('Опыт получен', '+' + exp, lines);

  if (after.streak === 1 && streakBefore >= 2) {
    note('Новая серия', 'Серия начинается заново', ['Пропуск — не провал. Отдых тоже часть плана.'], 'ok');
  }
}

function questAction(act, index) {
  var day = questsFor(todayKey());
  var it = day.items[index];
  if (!it) return;

  if (act === 'quest-plus') {
    it.progress = Math.min(it.target, it.progress + it.step);
    if (it.progress >= it.target && !it.done) {
      it.done = true;
      note('Квест выполнен', it.label + ': ' + it.target + ' ' + it.unit, ['+' + it.exp + ' опыта', '+1 к характеристике']);
    }
  } else if (act === 'quest-minus') {
    if (it.done) { it.done = false; it.progress = Math.max(0, it.target - it.step); }
    else it.progress = Math.max(0, it.progress - it.step);
  } else if (act === 'quest-done') {
    it.progress = it.target;
    it.done = true;
    note('Квест выполнен', it.label + ': ' + it.target + ' ' + it.unit, ['+' + it.exp + ' опыта', '+1 к характеристике']);
  } else if (act === 'quest-reroll') {
    if (day.rerolls >= REROLL_LIMIT) return;
    day.rerolls++;
    replaceQuest(day, index);
  }

  commit();

  if (dayAllDone(day)) {
    note('Ежедневный квест выполнен', 'Все три задания закрыты', ['+' + DAY_BONUS + ' опыта', 'День засчитан в серию'], 'ok');
  }
}

function deleteWorkout(id, btn) {
  if (!btn) return;
  if (btn.getAttribute('data-confirm') !== '1') {
    btn.setAttribute('data-confirm', '1');
    btn.textContent = 'Точно удалить?';
    btn.classList.add('btn--danger');
    window.setTimeout(function () {
      if (!document.body.contains(btn)) return;
      btn.setAttribute('data-confirm', '0');
      btn.textContent = 'Удалить';
      btn.classList.remove('btn--danger');
    }, 6000);
    return;
  }
  state.workouts = state.workouts.filter(function (w) { return w.id !== id; });
  commit();
  note('Запись удалена', 'Опыт за тренировку снят');
}

function exportData() {
  var msg = $('io-msg');
  try {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'system-hunter-' + todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    msg.textContent = 'Файл сохранён: system-hunter-' + todayKey() + '.json';
  } catch (e) {
    msg.textContent = 'Не удалось сохранить файл: ' + e.message;
  }
}

function importData(file) {
  var msg = $('io-msg');
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var parsed = JSON.parse(String(reader.result));
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.workouts)) {
        throw new Error('Файл не похож на сохранение Системы');
      }
      state = {
        v: 1,
        hunter: parsed.hunter || state.hunter,
        workouts: parsed.workouts,
        supps: Array.isArray(parsed.supps) ? parsed.supps : [],
        quests: parsed.quests && typeof parsed.quests === 'object' ? parsed.quests : {},
        ach: parsed.ach && typeof parsed.ach === 'object' ? parsed.ach : {},
        remind: Object.assign(remindDefaults(), parsed.remind && typeof parsed.remind === 'object' ? parsed.remind : {}),
        bestStreak: Number(parsed.bestStreak) || 0
      };
      saveState();
      renderAll();
      msg.textContent = 'Загружено записей: ' + state.workouts.length;
      note('Данные загружены', 'Журнал восстановлен', ['Тренировок: ' + state.workouts.length]);
    } catch (e) {
      msg.textContent = 'Ошибка импорта: ' + e.message;
    }
  };
  reader.onerror = function () { msg.textContent = 'Не удалось прочитать файл.'; };
  reader.readAsText(file);
}

var pendingReset = false;
var resetTimer = null;

function resetAll() {
  var btn = $('reset-btn');
  if (!pendingReset) {
    pendingReset = true;
    btn.classList.add('btn--danger');
    btn.textContent = 'Подтвердить сброс';
    note('Сброс данных', 'Нажми кнопку ещё раз, чтобы удалить журнал, опыт и достижения', ['Отмена — просто ничего не делать']);
    resetTimer = window.setTimeout(function () {
      pendingReset = false;
      btn.classList.remove('btn--danger');
      btn.textContent = 'Сбросить данные';
    }, 10000);
    return;
  }
  window.clearTimeout(resetTimer);
  pendingReset = false;
  btn.classList.remove('btn--danger');
  btn.textContent = 'Сбросить данные';
  try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* хранилище недоступно */ }
  state = defaultState();
  $('hunter-name').value = '';
  $('sup-dose').value = '';
  $('sup-error').textContent = '';
  renderAll();
  note('Система сброшена', 'Регистрация охотника снова открыта');
}

function icsStamp(d) {
  return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + '00';
}

function buildIcs() {
  var now = new Date();
  var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SYSTEM//Training tracker//RU', 'CALSCALE:GREGORIAN'];
  function event(uid, title, time) {
    var p = String(time).split(':');
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(p[0]) || 0, Number(p[1]) || 0, 0);
    return [
      'BEGIN:VEVENT',
      'UID:' + uid + '-' + now.getTime() + '@system-tracker',
      'DTSTAMP:' + icsStamp(now),
      'DTSTART:' + icsStamp(start),
      'DURATION:PT10M',
      'RRULE:FREQ=DAILY',
      'SUMMARY:' + title,
      'DESCRIPTION:Напоминание из трекера тренировок Система',
      'END:VEVENT'
    ];
  }
  if (state.remind.trainOn) lines = lines.concat(event('train', 'Тренировка — Система', state.remind.trainTime));
  if (state.remind.suppOn) lines = lines.concat(event('supp', 'Приём добавок — Система', state.remind.suppTime));
  if (state.remind.dayOn) lines = lines.concat(event('day', 'Итог дня — Система', state.remind.dayTime));
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadIcs() {
  var msg = $('rem-msg');
  if (!state.remind.trainOn && !state.remind.suppOn && !state.remind.dayOn) {
    msg.className = 'err';
    msg.textContent = 'Включи хотя бы одно напоминание — тогда в календарь будет что добавить.';
    return;
  }
  try {
    var blob = new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'system-reminders.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    msg.className = 'err ok';
    msg.textContent = 'Файл сохранён: system-reminders.ics — открой его на телефоне, календарь добавит события.';
  } catch (e) {
    msg.className = 'err';
    msg.textContent = 'Не удалось сохранить файл: ' + e.message;
  }
}

function askPermission() {
  var msg = $('rem-msg');
  if (!('Notification' in window)) {
    msg.className = 'err';
    msg.textContent = 'Браузер не умеет системные уведомления — напоминания будут внутри страницы.';
    return;
  }
  try {
    Notification.requestPermission().then(function (p) {
      msg.className = p === 'granted' ? 'err ok' : 'err';
      msg.textContent = p === 'granted'
        ? 'Системные уведомления разрешены.'
        : 'Разрешение не выдано — напоминания будут только внутри страницы.';
    }, function () {
      msg.className = 'err';
      msg.textContent = 'Браузер не дал запросить разрешение — напоминания будут внутри страницы.';
    });
  } catch (e) {
    msg.className = 'err';
    msg.textContent = 'Не удалось запросить разрешение: ' + e.message;
  }
}

function notifySystem(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: body });
    }
  } catch (e) { /* системные уведомления недоступны */ }
}

function reminderTick() {
  if (!state.hunter) return;
  var due = remindDue(new Date());
  if (!due.length) return;
  due.forEach(function (item) {
    state.remind.fired[todayKey() + ':' + item.key] = true;
    note(item.title, item.body, ['Напоминание из расписания'], 'ok');
    notifySystem(item.title, item.body);
  });
  saveState();
}

function useReminderRow(e) {
  var el = e.target;
  if (!el || !el.id) return;
  var m = /^rem-(train|supp|day)-(on|time)$/.exec(el.id);
  if (!m) return;
  if (m[2] === 'on') state.remind[m[1] + 'On'] = !!el.checked;
  else state.remind[m[1] + 'Time'] = el.value || '18:00';
  saveState();
  renderReminders();
}

function watchDayChange() {
  var current = todayKey();
  window.setInterval(function () {
    var now = todayKey();
    if (now !== current) {
      current = now;
      questsFor(now);
      commit();
      note('Новый день', 'Ежедневный квест обновлён', ['Три новых задания ждут охотника']);
    }
  }, 60000);
}

function init() {
  state = loadState();
  renderStorageChip();
  renderGateClasses();
  fillSelects();
  questsFor(todayKey());
  renderAll();

  $('start-btn').addEventListener('click', gateSubmit);
  $('gate-form').addEventListener('submit', gateSubmit);
  $('hunter-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); gateSubmit(e); }
  });
  $('hunter-name').addEventListener('input', clearGateError);

  $('log-submit').addEventListener('click', logSubmit);
  $('log-form').addEventListener('submit', logSubmit);
  $('log-minutes').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); logSubmit(e); }
  });
  $('log-minutes').addEventListener('input', function () {
    $('log-minutes').classList.remove('input--err');
    renderExpPreview();
  });
  $('log-type').addEventListener('change', renderExpPreview);
  $('log-intensity').addEventListener('change', renderExpPreview);

  $('quests').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!btn || btn.disabled) return;
    questAction(btn.getAttribute('data-act'), Number(btn.getAttribute('data-index')));
  });

  $('quests-reroll').addEventListener('click', function () {
    var day = questsFor(todayKey());
    if (day.rerolls >= REROLL_LIMIT || dayAllDone(day)) return;
    if (day.items.some(function (it) { return it.done; })) return;
    day.rerolls++;
    day.items[0] = null;
    var fresh = generateQuests(todayKey() + '#reroll' + day.rerolls);
    day.items = fresh;
    commit();
    note('Квесты обновлены', 'Новый набор на сегодня', ['Потрачено замен: ' + day.rerolls + ' из ' + REROLL_LIMIT]);
  });

  $('sup-add').addEventListener('click', addSupp);
  $('sup-form').addEventListener('submit', function (e) {
    if (e && e.preventDefault) e.preventDefault();
    addSupp();
  });
  $('sup-kind').addEventListener('change', function () {
    var isCustom = $('sup-kind').value === 'custom';
    $('sup-custom-field').hidden = !isCustom;
    if (isCustom) { try { $('sup-custom').focus(); } catch (e) {} }
  });
  $('sup-dose').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addSupp(); }
  });
  $('sup-list').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-act="supp-del"]') : null;
    if (!btn) return;
    removeSupp(btn.getAttribute('data-id'), btn);
  });

  $('journal').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-act="workout-del"]') : null;
    if (!btn) return;
    deleteWorkout(btn.getAttribute('data-id'), btn);
  });

  $('rem-rows').addEventListener('change', useReminderRow);
  $('rem-perm').addEventListener('click', askPermission);
  $('rem-ics').addEventListener('click', downloadIcs);

  $('export-btn').addEventListener('click', exportData);
  $('import-btn').addEventListener('click', function () { $('import-file').click(); });
  $('import-file').addEventListener('change', function (e) {
    importData(e.target.files && e.target.files[0]);
    e.target.value = '';
  });
  $('reset-btn').addEventListener('click', resetAll);

  watchDayChange();
  reminderTick();
  window.setInterval(reminderTick, 30000);
  netInit();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
