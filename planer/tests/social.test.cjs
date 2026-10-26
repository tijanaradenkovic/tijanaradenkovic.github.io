const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'social.js'), 'utf8');
const code = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function harness({ mutual = true, verified = true } = {}) {
  const sender = 'senderUid1234567890123456', friend = 'friendUid1234567890123456';
  const storage = new Map();
  if (mutual) storage.set('plannerConnections/' + friend + '/contacts/' + sender, { active: true });
  const listeners = {};
  const elements = { 'social-myid': { innerHTML: '' }, 'social-inbox': { innerHTML: '' } };
  const callbacks = {};
  const makeRef = key => ({
    key,
    collection: name => collection(key + '/' + name),
    doc: id => makeRef(key + '/' + id),
    get: async () => {
      const value = storage.get(key);
      return { exists: !!value, data: () => value };
    },
    set: async value => {
      // Mimic create-only invitation rules, and deny non-mutual delivery.
      if (key.startsWith('plannerInvitations/')) {
        if (storage.has(key)) throw Object.assign(new Error('duplicate invitation'), { code: 'permission-denied' });
        if (!storage.has('plannerConnections/' + friend + '/contacts/' + sender) ||
            !storage.has('plannerConnections/' + sender + '/contacts/' + friend))
          throw Object.assign(new Error('not mutual'), { code: 'permission-denied' });
      }
      storage.set(key, value);
    },
    update: async value => { storage.set(key, { ...storage.get(key), ...value }); },
    delete: async () => storage.delete(key),
    orderBy: () => ({
      limit: () => ({
        onSnapshot: cb => { callbacks[key] = cb; return () => { delete callbacks[key]; }; }
      })
    })
  });
  const collection = key => ({
    doc: id => makeRef(key + '/' + id),
    get: async () => ({
      docs: [...storage].filter(([k]) => k.startsWith(key + '/') &&
        !k.slice(key.length + 1).includes('/')).map(([k, value]) => ({
        id: k.slice(key.length + 1), ref: makeRef(k), data: () => value
      }))
    })
  });
  const db = {
    collection,
    batch: () => {
      const writes = [];
      return {
        set: (ref, val) => writes.push(() => storage.set(ref.key, val)),
        delete: ref => writes.push(() => storage.delete(ref.key)),
        commit: async () => writes.forEach(fn => fn())
      };
    }
  };
  const window = {
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } } }
  };
  const document = {
    getElementById: id => elements[id] || null,
    addEventListener: (type, cb) => { listeners[type] = cb; }
  };
  vm.runInNewContext(source, { window, document, navigator: { clipboard: { writeText: async () => {} } } });
  const state = {
    contacts: [{ id: 'contact1', name: 'Colleague', plannerUid: friend }],
    events: [{ id: 'conference1', name: 'Higher Gauge Workshop', going: true, start: '2027-06-14',
      end: '2027-06-17', link: 'https://example.org', note: 'Private note', cost: '100', deadlines: [] }]
  };
  const auth = { uid: sender, email: 'sender@example.org', emailVerified: verified };
  let saves = 0;
  window.PlannerSocial.init({
    user: () => auth, db: () => db, state: () => state, cloudReady: () => true,
    escape: t => String(t).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    newId: () => 'imported1', save: () => { saves++; }, render: () => {}
  });
  const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { social: window.PlannerSocial, state, sender, friend, auth, storage, listeners, elements, callbacks, flush, saves: () => saves };
}
test('Planner JavaScript parses and shows the invitation sections', () => {
  for (const match of code.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
    assert.doesNotThrow(() => new vm.Script(match[1]));
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(code, /social-myid/);
  assert.match(code, /social-inbox/);
  assert.match(code, /PlannerSocial.shareControls\(c\)/);
});
test('Mutual contacts have invite controls; one-way contacts do not', async () => {
  const a = harness();
  a.social.start(); await a.flush();
  assert.match(a.social.shareControls(a.state.events[0]), /Send invitation/);
  assert.ok(a.storage.has('plannerConnections/' + a.sender + '/contacts/' + a.friend));
  const b = harness({ mutual: false });
  b.social.start(); await b.flush();
  assert.doesNotMatch(b.social.shareControls(b.state.events[0]), /Send invitation/);
  assert.match(b.social.shareControls(b.state.events[0]), /No mutual/);
});
test('Sharing only exposes conference public details and prevents duplicate sends', async () => {
  const t = harness();
  t.social.start(); await t.flush();
  const target = { dataset: { socialSend: 'conference1' }, hasAttribute: () => false,
    closest: () => ({ querySelector: () => ({ value: t.friend }) }) };
  t.listeners.click({ target }); await t.flush();
  const key = 'plannerInvitations/' + t.friend + '/inbox/' + t.sender + '_conference1';
  const item = t.storage.get(key);
  assert.ok(item);
  assert.equal(item.conferenceName, 'Higher Gauge Workshop');
  assert.deepEqual(Object.keys(item).sort(), [
    'conferenceId','conferenceName','end','place','senderEmail',
    'senderUid','sentAt','start','status','url'
  ].sort());
  assert.equal(item.note, undefined);
  assert.equal(item.cost, undefined);
  t.listeners.click({ target }); await t.flush();
  assert.equal([...t.storage.keys()].filter(k => k === key).length, 1);
});
test('Accepted invitation adds a minimal conference once', async () => {
  const t = harness();
  t.social.start(); await t.flush();
  const received = {
    senderUid: t.friend, senderEmail: 'friend@example.org',
    conferenceName: 'Geometry Conference', start: '2027-08-05', end: '2027-08-06',
    place: 'Thessaloniki', url: 'https://example.com', status: 'pending'
  };
  const key = 'plannerInvitations/' + t.sender + '/inbox/invite123';
  t.storage.set(key, received);
  t.callbacks['plannerInvitations/' + t.sender + '/inbox']({
    docs: [{ id: 'invite123', data: () => received }]
  });
  const answer = { dataset: { socialAnswer: 'accepted', socialInvite: 'invite123' },
    hasAttribute: k => k === 'data-social-answer', closest: () => null };
  t.listeners.click({ target: answer }); await t.flush();
  assert.equal(t.state.events.length, 2);
  assert.equal(t.state.events[1].name, 'Geometry Conference');
  assert.equal(t.state.events[1].status, 'Considering');
  assert.equal(t.state.events[1].note, '');
  assert.equal(t.storage.get(key).status, 'accepted');
  assert.equal(t.saves(), 1);
});
test('Unverified accounts have no sharing controls', async () => {
  const t = harness({ verified: false });
  t.social.start(); await t.flush();
  assert.equal(t.social.shareControls(t.state.events[0]), '');
});
