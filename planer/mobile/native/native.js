(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform()) return;
  var files = cap.registerPlugin('PlannerFiles');
  var alarms = cap.registerPlugin('PlannerReminders');
  var types = { json: 'application/json', ics: 'text/calendar', html: 'text/html', md: 'text/markdown', bib: 'text/plain', txt: 'text/plain' };
  var currentState = null, currentScope = '', lastSignature = '', queue = Promise.resolve();

  function key(suffix) { return 'ap_android_reminders_' + currentScope + '_' + suffix; }
  function isEnabled() { return !!currentScope && localStorage.getItem(key('enabled')) === '1'; }
  function leadDays() {
    try {
      var value = JSON.parse(localStorage.getItem(key('leads')) || '[7,1]');
      return [7, 1, 0].filter(function (d) { return value.indexOf(d) !== -1; });
    } catch (e) { return [7, 1]; }
  }
  function atTime() {
    var raw = localStorage.getItem(key('time')) || '09:00';
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : '09:00';
  }
  function collect(state) {
    var events = [], now = Date.now(), clock = atTime(), leads = leadDays();
    function add(id, date, title, body) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
      leads.forEach(function (days) {
        var when = new Date(date + 'T' + clock + ':00');
        if (!Number.isFinite(when.getTime())) return;
        when.setDate(when.getDate() - days);
        if (when.getTime() <= now || when.getTime() > now + 365 * 86400000) return;
        events.push({ id: id + ':' + days, at: when.getTime(),
          title: title, body: (days === 7 ? 'In one week' : days === 1 ? 'Tomorrow' : 'Today') + ': ' + body });
      });
    }
    (state.events || []).forEach(function (c) {
      (c.deadlines || []).forEach(function (d) { if (!d.done) add('conf:' + d.id, d.date, 'Conference deadline', c.name + ' — ' + (d.kind || 'deadline')); });
      (c.tasks || []).forEach(function (t) { if (!t.done) add('ctask:' + t.id, t.date, 'Conference task', c.name + ' — ' + t.text); });
      (c.talks || []).forEach(function (p) { if (p.status !== 'Rejected' && p.status !== 'Presented') add('talk:' + p.id, p.date, 'Presentation', p.title || c.name); });
      if (c.status !== 'Rejected') add('confstart:' + c.id, c.start, 'Conference starts', c.name);
    });
    (state.grants || []).forEach(function (g) {
      (g.miles || []).forEach(function (m) { if (!m.done) add('grant:' + m.id, m.date, 'Funding deadline', g.name + ' — ' + m.label); });
      (g.tasks || []).forEach(function (t) { if (!t.done) add('gtask:' + t.id, t.date, 'Project task', g.name + ' — ' + t.text); });
    });
    (state.papers || []).forEach(function (p) {
      if (['Published','Accepted','Rejected'].indexOf(p.stage) < 0)
        add('paper:' + p.id, p.deadline, 'Paper deadline', p.title);
    });
    (state.refereeReviews || []).forEach(function (r) {
      if (r.status === 'Invited') add('reviewreply:' + r.id, r.replyBy, 'Peer review', 'Reply to a review invitation');
      else if (['Submitted','Completed','Declined','Rejected'].indexOf(r.status) < 0)
        add('reviewdue:' + r.id, r.due, 'Peer review', 'Submit a referee report');
      (r.messages || []).forEach(function (m) { if (!m.done) add('reviewfollow:' + m.id, m.followup, 'Peer review', 'Editorial follow-up'); });
    });
    (state.visits || []).forEach(function (v) {
      if (v.status === 'Cancelled' || v.status === 'Done') return;
      add('visit:' + v.id, v.start, 'Academic event', v.name);
      (v.tasks || []).forEach(function (t) { if (!t.done) add('vtask:' + t.id, t.date, 'Academic task', v.name + ' — ' + t.text); });
    });
    (state.contacts || []).forEach(function (c) {
      if (c.status !== 'Dormant') add('follow:' + c.id, c.next, 'Contact follow-up', c.name);
    });
    return events.sort(function (a, b) { return a.at - b.at || a.id.localeCompare(b.id); }).slice(0, 160);
  }
  function setMessage(message) {
    var element = document.getElementById('native-reminders-status');
    if (element) element.textContent = message;
  }
  function redraw() {
    var button = document.getElementById('native-reminders-toggle');
    if (!button) return;
    button.textContent = isEnabled() ? 'Disable Android reminders' : 'Enable Android reminders';
    var leads = leadDays();
    [7, 1, 0].forEach(function (d) {
      var el = document.getElementById('native-reminders-' + d);
      if (el) el.checked = leads.indexOf(d) >= 0;
    });
    document.getElementById('native-reminders-time').value = atTime();
    setMessage(isEnabled() ? 'Enabled for this account on this device. Scheduled reminders also work while the app is closed.' : 'Disabled. No notification permission is requested until you enable this.');
  }
  function schedule() {
    var items = isEnabled() && currentState ? collect(currentState) : [];
    // A change of account always clears reminders from the previous account.
    var signature = currentScope + ':' + JSON.stringify(items);
    if (signature === lastSignature) return;
    queue = queue.catch(function () {}).then(function () {
      return alarms.sync({ items: items });
    }).then(function () {
      lastSignature = signature;
      if (isEnabled()) setMessage('Android reminders scheduled: ' + items.length + ' alerts (up to one year ahead).');
    }, function () { setMessage('Could not schedule reminders. Open this page again or check notification settings.'); });
  }
  function updateReminders(state, scope) {
    currentState = state;
    currentScope = scope || '';
    schedule();
    redraw();
  }
  function initUi() {
    var upcoming = document.getElementById('upcoming'), calendar = document.getElementById('icsd');
    if (!upcoming || !calendar) return;
    var box = document.createElement('details');
    box.id = 'native-reminders';
    box.style.marginTop = '16px';
    box.innerHTML = '<summary>🔔 Android reminders</summary>' +
      '<div class="card" style="margin-top:8px">' +
      '<p class="mu">Device notifications for conference and grant deadlines, papers, peer reviews, visits, tasks and follow-ups. No Google Calendar required. Reminders are stored locally on this Android device; they are not synced as notifications.</p>' +
      '<div class="sub"><label><input type="checkbox" id="native-reminders-7" style="width:auto"> 1 week before</label>' +
      '<label><input type="checkbox" id="native-reminders-1" style="width:auto"> 1 day before</label>' +
      '<label><input type="checkbox" id="native-reminders-0" style="width:auto"> On the day</label>' +
      '<label>At <input id="native-reminders-time" type="time" style="width:auto"></label></div>' +
      '<div class="sub"><button class="btn sm pri" id="native-reminders-toggle">Enable Android reminders</button></div>' +
      '<p class="mu" id="native-reminders-status" role="status"></p>' +
      '<p class="mu">Times are approximate on some Android devices because of battery optimization. If an item changes, open the app to refresh reminders. Force-stopping the app may suppress alarms until it is opened again. Peer-review notifications intentionally omit manuscript titles.</p>' +
      '</div>';
    upcoming.insertBefore(box, calendar);
    document.getElementById('native-reminders-toggle').onclick = async function () {
      if (isEnabled()) {
        localStorage.removeItem(key('enabled'));
        lastSignature = '';
        schedule();
        redraw();
        return;
      }
      try {
        var permission = await alarms.requestPermissions();
        if (permission.notifications !== 'granted') {
          setMessage('Notification permission was not granted. Enable it in Android app settings.');
          return;
        }
        localStorage.setItem(key('enabled'), '1');
        lastSignature = '';
        schedule();
        redraw();
      } catch (e) { setMessage('Could not request notification permission on this device.'); }
    };
    [7,1,0].forEach(function (d) {
      document.getElementById('native-reminders-' + d).onchange = function () {
        var chosen = [7,1,0].filter(function (n) { return document.getElementById('native-reminders-' + n).checked; });
        localStorage.setItem(key('leads'), JSON.stringify(chosen));
        lastSignature = '';
        schedule();
      };
    });
    document.getElementById('native-reminders-time').onchange = function (e) {
      localStorage.setItem(key('time'), e.target.value);
      lastSignature = '';
      schedule();
    };
    redraw();
  }
  window.PlannerNative = {
    saveFile: async function (name, text) {
      var result = await files.save({ name: name, text: text, mimeType: types[name.split('.').pop()] || 'text/plain' });
      return result.saved ? 'ok' : '';
    },
    updateReminders: updateReminders
  };
  document.addEventListener('DOMContentLoaded', initUi);
}());
