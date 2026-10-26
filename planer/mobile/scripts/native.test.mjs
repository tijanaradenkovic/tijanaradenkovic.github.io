import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('native/native.js', root), 'utf8');
function nativeHarness(save) {
  const listeners = {};
  const context = {
    window: { Capacitor: { isNativePlatform: () => true, registerPlugin: name => { assert.equal(name, 'PlannerFiles'); return { save }; } } },
    document: { visibilityState: 'visible', addEventListener: (name, fn) => { listeners[name] = fn; } },
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
