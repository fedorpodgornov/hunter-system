var SB = {
  session: null,

  load: function () {
    try { SB.session = JSON.parse(window.localStorage.getItem('system-sb-session') || 'null'); }
    catch (e) { SB.session = null; }
  },

  save: function () {
    try {
      if (SB.session) window.localStorage.setItem('system-sb-session', JSON.stringify(SB.session));
      else window.localStorage.removeItem('system-sb-session');
    } catch (e) { /* хранилище недоступно */ }
  },

  url: function (path) { return CONFIG.supabaseUrl.replace(/\/+$/, '') + path; },

  headers: function (withAuth) {
    var h = { 'apikey': CONFIG.supabaseAnonKey, 'Content-Type': 'application/json' };
    if (withAuth && SB.session && SB.session.access_token) h.Authorization = 'Bearer ' + SB.session.access_token;
    return h;
  },

  parse: function (res) {
    return res.text().then(function (text) {
      var data = null;
      if (text) { try { data = JSON.parse(text); } catch (e) { data = { message: text }; } }
      if (!res.ok) {
        var msg = (data && (data.message || data.error_description || data.error || data.hint)) || ('ошибка сервера ' + res.status);
        var err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return data;
    });
  },

  post: function (path, body, withAuth) {
    return fetch(SB.url(path), {
      method: 'POST',
      headers: SB.headers(withAuth),
      body: JSON.stringify(body || {})
    }).then(SB.parse);
  },

  get: function (path) {
    return fetch(SB.url(path), { headers: SB.headers(true) }).then(SB.parse);
  },

  rpc: function (name, params) {
    return SB.post('/rest/v1/rpc/' + name, params || {}, true);
  },

  signUp: function (email, password, nickname) {
    return SB.post('/auth/v1/signup', { email: email, password: password, data: { nickname: nickname } }, false);
  },

  signIn: function (email, password) {
    return SB.post('/auth/v1/token?grant_type=password', { email: email, password: password }, false)
      .then(function (data) {
        if (data && data.access_token) { SB.session = data; SB.save(); }
        return data;
      });
  },

  refresh: function () {
    if (!SB.session || !SB.session.refresh_token) return Promise.reject(new Error('нет сессии'));
    return SB.post('/auth/v1/token?grant_type=refresh_token', { refresh_token: SB.session.refresh_token }, false)
      .then(function (data) { SB.session = data; SB.save(); return data; });
  },

  signOut: function () { SB.session = null; SB.save(); },

  email: function () {
    return (SB.session && SB.session.user && SB.session.user.email) || '';
  }
};

function sbEnsureProfile() {
  if (!sbConfigured() || !SB.session || !state.hunter) return Promise.resolve(null);
  return SB.rpc('set_profile', { p_nickname: state.hunter.name, p_cls: state.hunter.cls });
}

function sbPushWorkouts() {
  var pending = state.workouts.filter(function (w) { return !w.synced; });
  var result = { sent: 0, flagged: 0, banned: false, frozen: null, last: null };

  function step(i) {
    if (i >= pending.length) return Promise.resolve(result);
    var w = pending[i];
    return SB.rpc('log_workout', {
      p_id: w.id,
      p_at: w.at,
      p_type: w.type,
      p_minutes: w.minutes,
      p_intensity: w.intensity,
      p_note: w.note || '',
      p_exp: w.exp || 0
    }).then(function (res) {
      result.sent++;
      result.last = res;
      if (res && res.flag) result.flagged++;
      if (res && res.frozen_until) result.frozen = res.frozen_until;
      w.synced = true;
      return step(i + 1);
    });
  }

  return step(0).then(function () { return result; });
}

function sbPullWorkouts() {
  return SB.get('/rest/v1/workouts?select=id,at,type,minutes,intensity,note,exp,flag&order=at.desc&limit=500')
    .then(function (rows) {
      var known = {};
      state.workouts.forEach(function (w) { known[w.id] = true; });
      var added = 0;
      (rows || []).forEach(function (r) {
        if (known[r.id]) return;
        state.workouts.push({
          id: r.id,
          at: r.at,
          type: r.type,
          minutes: r.minutes,
          intensity: r.intensity,
          note: r.note || '',
          exp: r.exp || 0,
          flag: r.flag || null,
          synced: true
        });
        added++;
      });
      return added;
    });
}

function sbState() { return SB.rpc('my_state'); }
function sbLeaderboard() { return SB.rpc('leaderboard'); }
function sbFriends() { return SB.rpc('list_friends'); }
function sbAddFriend(nickname) { return SB.rpc('send_friend_request', { p_nickname: nickname }); }
function sbAnswerFriend(id, accept) { return SB.rpc('answer_friend_request', { p_friend: id, p_accept: accept }); }
function sbRemoveFriend(id) { return SB.rpc('remove_friend', { p_friend: id }); }
