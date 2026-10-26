/* Optional account-to-account conference invitations. Loaded by the hosted planner. */
(function () {
  'use strict';
  var context = null, generation = 0, unsubscribe = null, inbox = [], peers = {}, syncQueue = Promise.resolve(), message = '', synced = false;
  var ID = /^[A-Za-z0-9_-]{15,128}$/;
  function user() { return context && context.user(); }
  function database() { return context && context.db(); }
  function allowed() { var u = user(); return !!(u && u.emailVerified && database()); }
  function esc(v) { return context.escape(v == null ? '' : String(v)); }
  function links(uid) { return database().collection('plannerConnections').doc(uid).collection('contacts'); }
  function inboxRef(uid) { return database().collection('plannerInvitations').doc(uid).collection('inbox'); }
  function contacts() { return (context.state().contacts || []); }
  function normalizedId(contact) {
    var uid = String(contact.plannerUid || '').trim();
    return ID.test(uid) && user() && uid !== user().uid ? uid : '';
  }
  function notice(t) { message = t; render(); }
  function stop() {
    generation++;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    inbox = []; peers = {}; message = ''; synced = false;
    render();
  }
  function start() {
    stop();
    if (!allowed()) { render(); return; }
    var uid = user().uid, token = generation;
    unsubscribe = inboxRef(uid).orderBy('sentAt', 'desc').limit(50).onSnapshot(function (snapshot) {
      if (token !== generation || !user() || user().uid !== uid) return;
      inbox = snapshot.docs.map(function (doc) {
        var data = doc.data();
        data._id = doc.id;
        return data;
      });
      render();
    }, function (error) {
      if (token !== generation) return;
      notice('Invitations unavailable (' + (error.code || 'network error') + '). Check Firestore rules.');
    });
    syncLinks();
  }
  function syncLinks() {
    if (!allowed() || !synced && !context.cloudReady()) return;
    var uid = user().uid, token = generation;
    // Keep a serial queue to avoid older contact edits racing with newer ones.
    syncQueue = syncQueue.catch(function () {}).then(async function () {
      if (token !== generation || !user() || user().uid !== uid || !context.cloudReady()) return;
      var wanted = {};
      contacts().forEach(function (c) { var id = normalizedId(c); if (id) wanted[id] = true; });
      var collection = links(uid), existing = await collection.get();
      if (token !== generation) return;
      var batch = database().batch(), changes = 0;
      existing.docs.forEach(function (doc) {
        if (!wanted[doc.id]) { batch.delete(doc.ref); changes++; }
      });
      Object.keys(wanted).forEach(function (id) {
        if (!existing.docs.some(function (d) { return d.id === id; })) {
          batch.set(collection.doc(id), { active: true }); changes++;
        }
      });
      if (changes) await batch.commit();
      if (token !== generation) return;
      var result = {};
      await Promise.all(Object.keys(wanted).map(async function (friendUid) {
        try {
          var doc = await links(friendUid).doc(uid).get();
          result[friendUid] = doc.exists && doc.data().active === true;
        } catch (e) { result[friendUid] = false; }
      }));
      if (token !== generation) return;
      peers = result; synced = true; render();
    }).catch(function (error) {
      if (token !== generation) return;
      notice('Could not verify mutual contacts (' + (error.code || 'network error') + ').');
    });
  }
  function shareControls(event) {
    if (!allowed()) return '';
    var options = contacts().filter(function (c) { return peers[normalizedId(c)] === true; })
      .map(function (c) { return { id: normalizedId(c), name: c.name }; });
    var used = {};
    options = options.filter(function (x) { if (used[x.id]) return false; used[x.id] = true; return true; });
    var select = options.length
      ? '<select data-social-recipient style="max-width:220px" aria-label="Choose a mutual contact">' +
        options.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>'; }).join('') +
        '</select><button type="button" class="btn sm" data-social-send="' + esc(event.id) + '">Send invitation</button>'
      : '<span class="mu">No mutual Planner contacts yet. Exchange Planner IDs in Contacts.</span>';
    return '<div class="sub" style="margin-top:7px"><label style="color:var(--tx);font-size:13px">' +
      '<input type="checkbox" style="width:auto" data-social-going="' + esc(event.id) + '"' +
      (event.going ? ' checked' : '') + '> I am attending</label></div>' +
      (event.going ? '<div class="sub">' + select + '</div>' : '');
  }
  function contactField(contact) {
    if (!context) return '';
    var uid = normalizedId(contact), status = uid
      ? (peers[uid] ? 'Mutual contact ✓' : 'Waiting for this person to add your Planner ID')
      : 'Both people must exchange and save their Planner IDs';
    return '<div class="sub" style="margin-top:7px"><label style="margin:0">Planner ID</label>' +
      '<input data-k="' + esc(contact.id) + '" data-f="plannerUid" placeholder="Friend’s Planner ID" ' +
      'maxlength="128" value="' + esc(contact.plannerUid || '') + '" style="min-width:220px">' +
      '<span class="mu">' + esc(status) + '</span></div>';
  }
  function render() {
    if (!context) return;
    var idbox = document.getElementById('social-myid');
    if (idbox) {
      idbox.innerHTML = allowed()
        ? '<strong>My Planner ID</strong> <span class="mu">(share only with people you want to invite)</span>' +
          '<div class="sub"><code style="overflow-wrap:anywhere">' + esc(user().uid) + '</code>' +
          '<button class="btn sm" type="button" data-social-copy>Copy ID</button></div>' +
          '<p class="mu">Add your friend’s Planner ID to their contact entry; ask them to save yours in their Contacts too. Only then can you exchange conference invitations. Contacts are not public.</p>'
        : '<p class="mu">Sign in with a verified email to exchange Planner IDs and conference invitations. Guest mode remains available for everything else.</p>';
    }
    var el = document.getElementById('social-inbox');
    if (!el) return;
    if (!allowed()) {
      el.innerHTML = '<div class="mu">Sign in and verify your email to receive conference invitations.</div>';
      return;
    }
    var pending = inbox.filter(function (x) { return x.status === 'pending'; });
    el.innerHTML = '<div class="mu">' + pending.length + ' pending invitation' + (pending.length === 1 ? '' : 's') + '</div>' +
      (message ? '<p class="mu" role="status">' + esc(message) + '</p>' : '') +
      (pending.length ? pending.map(function (x) {
        var url = /^https:\/\/[^\s]+$/i.test(x.url || '') ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">Conference website</a>' : '';
        return '<div class="card" style="margin-top:8px"><strong>' + esc(x.conferenceName) + '</strong>' +
          '<div class="mu">From ' + esc(x.senderEmail) + ' · ' + esc(x.start || 'Date not set') +
          (x.place ? ' · ' + esc(x.place) : '') + '</div>' + url +
          '<div class="sub"><button class="btn sm pri" data-social-answer="accepted" data-social-invite="' + esc(x._id) + '">Accept &amp; add to planner</button>' +
          '<button class="btn sm" data-social-answer="declined" data-social-invite="' + esc(x._id) + '">Decline</button></div></div>';
      }).join('') : '<p class="mu">No new invitations.</p>');
  }
  async function send(eventId, friendUid) {
    if (!allowed()) { notice('Please sign in and verify your email first.'); return; }
    var ev = (context.state().events || []).find(function (c) { return String(c.id) === eventId; });
    if (!ev || !ev.going || !ID.test(friendUid) || !peers[friendUid]) {
      notice('Select a confirmed mutual contact and mark the conference as attending.'); return;
    }
    var myId = user().uid;
    try {
      // Re-read the reciprocal edge: revocation must take effect before sending.
      var reciprocal = await links(friendUid).doc(myId).get();
      if (!reciprocal.exists || reciprocal.data().active !== true) {
        peers[friendUid] = false; notice('This friend has not added your Planner ID.'); return;
      }
      var key = myId + '_' + String(ev.id);
      var data = {
        senderUid: myId, senderEmail: user().email, conferenceId: String(ev.id),
        conferenceName: String(ev.name || '').slice(0, 180),
        start: String(ev.start || ''), end: String(ev.end || ''),
        place: String(ev.place || '').slice(0, 180),
        url: /^https:\/\//i.test(ev.link || '') ? String(ev.link).slice(0, 400) : '',
        status: 'pending', sentAt: window.firebase.firestore.FieldValue.serverTimestamp()
      };
      // create() fails for duplicate IDs; recipients decide whether to accept.
      await inboxRef(friendUid).doc(key).set(data);
      notice('Invitation sent. Your friend will see it in Upcoming after opening the planner.');
    } catch (error) {
      notice('Could not send invitation. It may already exist, or connection rules are not enabled (' + (error.code || 'error') + ').');
    }
  }
  async function answer(key, answer) {
    if (!allowed() || ['accepted','declined'].indexOf(answer) < 0) return;
    var uid = user().uid, item = inbox.find(function (x) { return x._id === key && x.status === 'pending'; });
    if (!item) return;
    try {
      if (answer === 'accepted') {
        var state = context.state();
        if (!(state.events || []).some(function (e) { return e.sourceInvite === key ||
            (e.name === item.conferenceName && e.start === item.start); })) {
          state.events.push({
            id: context.newId(), name: item.conferenceName, place: item.place || '',
            start: item.start || '', end: item.end || '', link: item.url || '',
            status: 'Considering', sourceInvite: key, deadlines: [], talks: [], tasks: [],
            cost: '', cur: 'EUR', fundSrc: '', fundStatus: 'Not requested', note: ''
          });
          context.save();
          context.render();
        }
      }
      await inboxRef(uid).doc(key).update({
        status: answer, respondedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });
      notice(answer === 'accepted' ? 'Conference added to your planner.' : 'Invitation declined.');
    } catch (e) { notice('Could not update the invitation (' + (e.code || 'error') + ').'); }
  }
  function init(config) {
    context = config;
    document.addEventListener('click', function (event) {
      var target = event.target.closest('[data-social-copy],[data-social-send],[data-social-answer]');
      if (!target) return;
      if (target.hasAttribute('data-social-copy')) {
        if (allowed() && navigator.clipboard) navigator.clipboard.writeText(user().uid).then(function () { notice('Planner ID copied.'); })
          .catch(function () { notice('Copy failed; select your Planner ID manually.'); });
      } else if (target.hasAttribute('data-social-send')) {
        var card = target.closest('.card'), select = card && card.querySelector('[data-social-recipient]');
        if (select) send(target.dataset.socialSend, select.value);
      } else if (target.hasAttribute('data-social-answer')) answer(target.dataset.socialInvite, target.dataset.socialAnswer);
    });
    document.addEventListener('change', function (event) {
      var el = event.target, id = el.dataset.socialGoing;
      if (!id) return;
      var conf = (context.state().events || []).find(function (c) { return String(c.id) === id; });
      if (!conf) return;
      conf.going = el.checked; context.save(); context.render();
    });
    render();
  }
  window.PlannerSocial = {
    init: init, start: start, stop: stop, syncLinks: syncLinks,
    render: render, shareControls: shareControls, contactField: contactField
  };
}());