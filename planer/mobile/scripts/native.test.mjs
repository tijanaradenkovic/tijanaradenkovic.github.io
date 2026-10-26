import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('native/native.js', root), 'utf8');
function nativeHarness(save, reminders = {}) {
  const listeners = {}, store = new Map(reminders.store || []);
  const context = {
    window: { Capacitor: { isNativePlatform: () => true, registerPlugin: name => {
      if (name === 'PlannerFiles') return { save };
      if (name === 'PlannerReminders') return {
        sync: reminders.sync || (async () => ({ saved: true })),
        requestPermissions: reminders.requestPermissions || (async () => ({ notifications: 'granted' }))
      };
      throw new Error('Unknown native plugin: ' + name);
    } } },
    localStorage: {
      getItem: name => store.get(name) ?? null,
      setItem: (name, val) => store.set(name, val),
      removeItem: name => store.delete(name)
    },
    document: { visibilityState: 'visible', addEventListener: (name, fn) => { listeners[name] = fn; }, getElementById: () => null },
    navigator: { onLine: true }
  };
  vm.runInNewContext(source, context);
  return { ...context, listeners };
}
test('Android backup succeeds only after a document is saved', async () => {
  let request;
  const ctx = nativeHarness(async value => { request = value; return { saved: true }; });
  assert.equal(await ctx.window.PlannerNative.saveFile('academic-planner.json', '{"abstracts":[]}'), 'ok');
  assert.equal(request.name, 'academic-planner.json');
  assert.equal(request.mimeType, 'application/json');
  assert.equal(request.text, '{"abstracts":[]}');
});
test('canceling export does not report success', async () => {
  const ctx = nativeHarness(async () => ({ saved: false }));
  assert.equal(await ctx.window.PlannerNative.saveFile('backup.json', '{}'), '');
});
test('write errors propagate to the planner instead of reporting success', async () => {
  const ctx = nativeHarness(async () => { throw new Error('write failed'); });
  await assert.rejects(ctx.window.PlannerNative.saveFile('backup.json', '{}'), /write failed/);
});
test('calendar export keeps its MIME type and Unicode content', async () => {
  const ctx = nativeHarness(async req => {
    assert.equal(req.mimeType, 'text/calendar');
    assert.equal(req.text, 'SUMMARY:Tijana Radenković');
    return { saved: true };
  });
  assert.equal(await ctx.window.PlannerNative.saveFile('deadlines.ics', 'SUMMARY:Tijana Radenković'), 'ok');
});
test('native code is inert on the website', () => {
  const ctx = { window: {}, document: {} };
  vm.runInNewContext(source, ctx);
  assert.equal(ctx.window.PlannerNative, undefined);
});
test('APK bundles Firebase locally, retains abstracts and has valid JavaScript', async () => {
  const html = await readFile(new URL('www/index.html', root), 'utf8');
  assert.ok(html.includes("var FBBASE='vendor/'"));
  assert.ok(html.includes('if(!window.Capacitor && "serviceWorker" in navigator)'));
  assert.ok(html.includes("'contacts','abstracts'"));
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  for (const name of ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js']) {
    assert.ok((await readFile(new URL('www/vendor/' + name, root))).length > 1000);
  }
});

test('Android reminders stay off until explicitly enabled', async () => {
  const calls = [];
  const ctx = nativeHarness(async () => ({ saved: true }), { sync: async data => { calls.push(data); return {}; } });
  ctx.window.PlannerNative.updateReminders({ events: [] }, 'np1_signed_out');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].items.length, 0);
});

test('Enabled reminders schedule local Android alarms for unfinished deadlines', async () => {
  const scope = 'np1_u_test';
  const store = [['ap_android_reminders_' + scope + '_enabled', '1']];
  const calls = [];
  const ctx = nativeHarness(async () => ({ saved: true }), {
    store, sync: async data => { calls.push(data); return {}; }
  });
  const future = new Date(Date.now() + 12 * 86400000);
  const date = [future.getFullYear(), String(future.getMonth() + 1).padStart(2, '0'),
    String(future.getDate()).padStart(2, '0')].join('-');
  ctx.window.PlannerNative.updateReminders({
    events: [{ id: 'c', name: 'Test conference', status: 'Accepted',
      deadlines: [{ id: 'd1', kind: 'Abstract', date, done: false },
                  { id: 'd2', kind: 'Registration', date, done: true }] }],
    refereeReviews: [{ id: 'r1', status: 'In progress', due: date, messages: [] }]
  }, scope);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  const items = calls[0].items;
  assert.equal(items.length, 4); // Two leads, one conference deadline and one peer review.
  assert.ok(items.every(item => item.at > Date.now()));
  assert.ok(items.some(item => item.id === 'conf:d1:7'));
  assert.ok(!items.some(item => item.id.includes('d2')));
  assert.ok(items.filter(item => item.id.startsWith('reviewdue:'))
    .every(item => !item.body.includes('manuscript') && item.title === 'Peer review'));
});

test('Android manifest, boot recovery, native source and packaging hooks are present', async () => {
  const fs = await import('node:fs/promises');
  const base = new URL('../', import.meta.url);
  const read = name => fs.readFile(new URL(name, base), 'utf8');
  const manifest = await read('android/app/src/main/AndroidManifest.xml');
  const main = await read('native/MainActivity.java');
  const config = await read('scripts/configure-android.mjs');
  const html = await read('www/index.html');
  assert.match(manifest, /android.permission.POST_NOTIFICATIONS/);
  assert.match(manifest, /android.permission.RECEIVE_BOOT_COMPLETED/);
  assert.match(manifest, /PlannerReminderBootReceiver/);
  assert.match(main, /registerPlugin\(PlannerRemindersPlugin.class\)/);
  assert.match(config, /PlannerReminderReceiver.java/);
  assert.match(html, /window.PlannerNative.updateReminders\(S,STORE_KEY\)/);
  assert.ok((await read('www/native.js')).includes('Android reminders'));
});
