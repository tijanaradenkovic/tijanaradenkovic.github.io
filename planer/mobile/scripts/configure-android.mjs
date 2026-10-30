import { copyFile, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dest = new URL('android/app/src/main/java/rs/tijanaradenkovic/academicplanner/', root);
for (const name of ['MainActivity.java', 'PlannerFilesPlugin.java', 'PlannerRemindersPlugin.java', 'PlannerReminderReceiver.java', 'PlannerReminderBootReceiver.java']) {
  await copyFile(new URL('native/' + name, root), new URL(name, dest));
}
const manifest = new URL('android/app/src/main/AndroidManifest.xml', root);
let xml = await readFile(manifest, 'utf8');
// Exclude local planner data and Firebase credentials from Android OS backups.
xml = xml.replace('android:allowBackup="true"', 'android:allowBackup="false"');
await writeFile(manifest, xml);
console.log('Registered Android exports and local reminders; disabled OS app-data backup.');
