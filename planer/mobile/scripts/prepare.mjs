import { readFile, writeFile, copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const planner = path.resolve(root, '..');
const out = path.join(root, 'www');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'vendor'), { recursive: true });
let html = await readFile(path.join(planner, 'index.html'), 'utf8');
function replaceOnce(from, to) {
  if (html.split(from).length !== 2) throw new Error('Planner changed; check Android transformation: ' + from.slice(0, 80));
  html = html.replace(from, to);
}
replaceOnce("var FBBASE='https://www.gstatic.com/firebasejs/9.23.0/'", "var FBBASE='vendor/'");
replaceOnce('async function saveFile(name,text,hint){', `async function saveFile(name,text,hint){
if(window.PlannerNative){try{return await window.PlannerNative.saveFile(name,text)}catch(e){return 'File was not saved. Please try again.'}}`);
// The APK owns its assets. A service worker must not replace them with a cached web release.
replaceOnce('if("serviceWorker" in navigator)', 'if(!window.Capacitor && "serviceWorker" in navigator)');
// Android-only hooks: whenever planner data renders/saves, replace this device's pending reminders.
replaceOnce('function save(){syncAbs();S.updated=Date.now();try{localStorage.setItem(STORE_KEY,JSON.stringify(S));}catch(e){}schedRemote()}',
  'function save(){syncAbs();S.updated=Date.now();try{localStorage.setItem(STORE_KEY,JSON.stringify(S));}catch(e){}schedRemote();window.PlannerNative.updateReminders(S,STORE_KEY)}');
replaceOnce('function render(){syncAbs();renderUpcoming();', 'function render(){syncAbs();window.PlannerNative.updateReminders(S,STORE_KEY);renderUpcoming();');
replaceOnce('</head>', '<script src="native.js"></script>\n</head>');
await writeFile(path.join(out, 'index.html'), html);
for (const file of ['icon-192.png', 'icon-512.png', 'manifest.webmanifest']) {
  await copyFile(path.join(planner, file), path.join(out, file));
}
await copyFile(path.join(root, 'native/native.js'), path.join(out, 'native.js'));
for (const file of ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js']) {
  await copyFile(path.join(root, 'node_modules/firebase', file), path.join(out, 'vendor', file));
}
console.log('Packaged current planner with local Firebase SDK and native file export.');
