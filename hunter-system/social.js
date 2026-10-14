function netMsg(text, ok) {
  var el = $('net-msg');
  el.className = ok ? 'err ok' : 'err';
  el.textContent = text || '';
}

function netTime(iso) {
  var d = new Date(iso);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function netBusy(on) {
  ['net-signup', 'net-signin', 'net-signout', 'net-push', 'net-pull', 'net-friend-add'].forEach(function (id) {
    var el = $(id);
    if (el) el.disabled = !!on;
  });
}

function renderNet() {
  var conf = sbConfigured();
  var logged = conf && !!SB.session && !!SB.session.access_token;

  $('net-status').textContent = !conf ? 'не подключено' : (logged ? 'вход выполнен' : 'войди в аккаунт');
  $('net-note').textContent = conf
    ? 'Опыт и уровень считает сервер, поэтому свои цифры подделать нельзя. Снять заморозку или бан себе тоже нельзя — это делает только владелец проекта в панели Supabase. Синхронизация включается кнопками вручную: автоматической фоновой синхронизации нет.'
    : 'Сервер не настроен. Выполни supabase/schema.sql в своём проекте Supabase и впиши его URL и публичный anon-ключ в config.js, потом пересобери файл. Без сервера друзей, таблицы лидеров и синхронизации быть не может: данные лежат только в этом браузере.';

  [['net-signup', !logged], ['net-signin', !logged], ['net-signout', logged], ['net-push', logged], ['net-pull', logged]].forEach(function (pair) {
    $(pair[0]).hidden = !pair[1];
  });
  $('net-nick-row').hidden = logged || !conf;
  $('net-who').textContent = logged ? ('Вы вошли как ' + SB.email()) : '';

  if (!logged) {
    var idle = conf ? 'Войди в аккаунт, чтобы увидеть список.' : 'Сначала подключи сервер.';
    $('net-friends-list').innerHTML = '<p class="empty">' + idle + '</p>';
    $('net-leaders-list').innerHTML = '<p class="empty">' + idle + '</p>';
    $('net-mod').textContent = '';
    $('net-viol-list').innerHTML = '';
    return;
  }
  netRefresh();
}

function renderNetFriends(rows) {
  var host = $('net-friends-list');
  if (!rows || !rows.length) {
    host.innerHTML = '<p class="empty">Друзей пока нет. Отправь заявку по нику охотника.</p>';
    return;
  }
  host.innerHTML = rows.map(function (f) {
    var badge = f.banned ? '<span class="igbadge">забанен за накрутку</span>' : '';
    var actions;
    if (f.status === 'pending' && f.incoming) {
      actions = '<button class="btn btn--tiny btn--primary" type="button" data-act="friend-answer" data-accept="1" data-id="' + esc(f.id) + '">Принять</button>' +
        '<button class="btn btn--tiny btn--ghost" type="button" data-act="friend-answer" data-accept="0" data-id="' + esc(f.id) + '">Отклонить</button>';
    } else if (f.status === 'pending') {
      actions = '<span class="igbadge">заявка отправлена</span>';
    } else {
      actions = '<button class="btn btn--tiny btn--ghost" type="button" data-act="friend-remove" data-id="' + esc(f.id) + '">Убрать</button>';
    }
    return '<div class="logitem">' +
      '<div class="logitem__main">' +
        '<div class="logitem__t">' + esc(f.nickname) + '</div>' +
        '<div class="logitem__d">уровень ' + f.level + ' · опыт ' + f.total_exp + '</div>' +
        badge +
      '</div>' + actions +
    '</div>';
  }).join('');
}

function renderNetLeaders(rows) {
  var host = $('net-leaders-list');
  if (!rows || !rows.length) {
    host.innerHTML = '<p class="empty">Пока никого. Добавь друзей — они появятся здесь.</p>';
    return;
  }
  host.innerHTML = rows.map(function (p, i) {
    return '<div class="logitem' + (p.me ? ' logitem--me' : '') + (p.banned ? ' logitem--flag' : '') + '">' +
      '<span class="leadplace">' + (i + 1) + '</span>' +
      '<div class="logitem__main">' +
        '<div class="logitem__t">' + esc(p.nickname) + (p.me ? ' · это ты' : '') + '</div>' +
        '<div class="logitem__d">уровень ' + p.level + '</div>' +
        (p.banned ? '<div class="igbadge">забанен, опыт не идёт</div>' : '') +
      '</div>' +
      '<span class="logitem__e">' + p.total_exp + '</span>' +
    '</div>';
  }).join('');
}

function renderNetViolations(st) {
  var p = (st && st.profile) || null;
  var line = '';
  if (p) {
    line = 'Твой серверный статус: уровень ' + p.level + ', опыт ' + p.total_exp;
    if (p.banned) line += '. БАН: ' + (p.ban_reason || 'накрутка опыта') + '. Снять может только владелец проекта в Supabase.';
    else if (p.frozen_until && new Date(p.frozen_until) > new Date()) line += '. Заморозка начисления до ' + netTime(p.frozen_until) + '.';
    else line += '. Нарушений нет, всё чисто.';
  }
  $('net-mod').textContent = line;
  var list = (st && st.violations) || [];
  $('net-viol-list').innerHTML = list.length
    ? list.map(function (v) {
        var d = new Date(v.created_at);
        return '<div class="logitem logitem--flag"><div class="logitem__main">' +
          '<div class="logitem__t">' + esc(v.reason) + '</div>' +
          '<div class="logitem__d">' + humanDate(dateKey(d)) + ' ' + netTime(v.created_at) + '</div>' +
          '</div></div>';
      }).join('')
    : '<p class="empty">Нарушений не зафиксировано.</p>';
}

function netRefresh() {
  if (!sbConfigured() || !SB.session) return Promise.resolve();
  return Promise.all([
    sbState().then(renderNetViolations).catch(function (e) { netMsg('Статус: ' + e.message); }),
    sbFriends().then(renderNetFriends).catch(function (e) { $('net-friends-list').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; }),
    sbLeaderboard().then(renderNetLeaders).catch(function (e) { $('net-leaders-list').innerHTML = '<p class="empty">' + esc(e.message) + '</p>'; })
  ]);
}

function netSignUp() {
  var email = $('net-email').value.trim();
  var pass = $('net-pass').value;
  var nick = $('net-nick').value.trim();
  if (email.indexOf('@') < 1) { netMsg('Нужна почта вида you@example.com'); return; }
  if (pass.length < 6) { netMsg('Пароль — минимум 6 символов.'); return; }
  if (nick.length < 2) { netMsg('Ник охотника — минимум 2 символа.'); return; }
  netBusy(true);
  SB.signUp(email, pass, nick).then(function (data) {
    netBusy(false);
    if (data && data.access_token) {
      SB.session = data;
      SB.save();
      return sbEnsureProfile().then(function () {
        netMsg('Аккаунт создан, вы вошли как ' + SB.email(), true);
        renderNet();
      });
    }
    netMsg('Аккаунт создан. Подтверди почту по письму и войди — если в проекте включено подтверждение.', true);
  }).catch(function (e) {
    netBusy(false);
    netMsg('Не получилось: ' + e.message);
  });
}

function netSignIn() {
  var email = $('net-email').value.trim();
  var pass = $('net-pass').value;
  if (email.indexOf('@') < 1 || pass.length < 6) { netMsg('Введи почту и пароль (от 6 символов).'); return; }
  netBusy(true);
  SB.signIn(email, pass).then(function () {
    $('net-pass').value = '';
    return sbEnsureProfile();
  }).then(function () {
    netBusy(false);
    netMsg('Вы вошли как ' + SB.email(), true);
    renderNet();
  }).catch(function (e) {
    netBusy(false);
    netMsg('Вход не удался: ' + e.message);
  });
}

function netSignOut() {
  SB.signOut();
  netMsg('Вы вышли из аккаунта.', true);
  renderNet();
}

function netPush() {
  netBusy(true);
  netMsg('Выгружаю журнал…');
  sbEnsureProfile()
    .then(sbPushWorkouts)
    .then(function (res) {
      saveState();
      renderAll();
      netBusy(false);
      var text = 'Выгружено записей: ' + res.sent + (res.flagged ? ', без опыта: ' + res.flagged : '');
      if (res.frozen) text += '. Начисление заморожено до ' + netTime(res.frozen);
      netMsg(text + '.', true);
      return netRefresh();
    })
    .catch(function (e) {
      netBusy(false);
      netMsg('Выгрузка не удалась: ' + e.message);
    });
}

function netPull() {
  netBusy(true);
  netMsg('Подтягиваю записи с сервера…');
  sbPullWorkouts().then(function (added) {
    saveState();
    renderAll();
    netBusy(false);
    netMsg(added ? ('Добавлено записей: ' + added + '.') : 'Новых записей на сервере нет.', true);
    return netRefresh();
  }).catch(function (e) {
    netBusy(false);
    netMsg('Не удалось подтянуть: ' + e.message);
  });
}

function netAddFriend() {
  var nick = $('net-friend-nick').value.trim();
  if (nick.length < 2) { netMsg('Ник для заявки — минимум 2 символа.'); return; }
  netBusy(true);
  sbAddFriend(nick).then(function (answer) {
    netBusy(false);
    $('net-friend-nick').value = '';
    netMsg(String(answer), true);
    return netRefresh();
  }).catch(function (e) {
    netBusy(false);
    netMsg('Заявка не ушла: ' + e.message);
  });
}

function netFriendRow(e) {
  var el = e.target.closest ? e.target.closest('button[data-act]') : null;
  if (!el) return;
  var act = el.getAttribute('data-act');
  var id = el.getAttribute('data-id');
  netBusy(true);
  var job = act === 'friend-answer'
    ? sbAnswerFriend(id, el.getAttribute('data-accept') === '1')
    : sbRemoveFriend(id);
  job.then(function (answer) {
    netBusy(false);
    netMsg(String(answer), true);
    return netRefresh();
  }).catch(function (err) {
    netBusy(false);
    netMsg('Не получилось: ' + err.message);
  });
}

function netInit() {
  SB.load();
  $('net-status').textContent = sbConfigured() ? 'проверяю…' : 'не подключено';
  renderNet();
  $('net-signup').addEventListener('click', netSignUp);
  $('net-signin').addEventListener('click', netSignIn);
  $('net-signout').addEventListener('click', netSignOut);
  $('net-push').addEventListener('click', netPush);
  $('net-pull').addEventListener('click', netPull);
  $('net-friend-add').addEventListener('click', netAddFriend);
  $('net-friends-list').addEventListener('click', netFriendRow);
  if (sbConfigured() && SB.session && SB.session.refresh_token) {
    SB.refresh().then(renderNet).catch(function () { renderNet(); });
  }
}
