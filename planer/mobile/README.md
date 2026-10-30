# Academic Planner for Android (first test build)

This Capacitor project packages `../index.html`, the existing planner, with the same Firebase project and email/password accounts. It does not load the hosted site into a remote WebView and does not change Firestore rules or data. The web app remains the source of the interface.

## Build

Requires Node 22+, JDK 21, Android SDK platform 36 and build tools 36.0.0.

```sh
cd planer/mobile
npm ci
npm run android:sync
npm test
cd android
bash ./gradlew assembleDebug lintDebug
```

The installable test file is `android/app/build/outputs/apk/debug/app-debug.apk`. The GitHub workflow **Academic Planner Android** also builds it and stores it as `academic-planner-debug-apk`. Download and unzip that artifact on an Android phone, then open the APK. Android may ask to allow installation from the app used to open it. This is a debug build for testing, not a Google Play release. Separate workflow runs may use different debug signing keys; use one persistent signing key before distributing ongoing updates.

## Included

- Existing conferences, deadlines, papers, private peer reviews, abstracts, contacts and other planner sections.
- Same email/password login and database as the web app; no separate account needed.
- Guest use and local persistence without an account.
- Local Firebase SDK files, so the interface and cached data can open without downloading scripts. First sign-in and cloud sync require internet. Existing sync behavior is preserved.
- Android document picker for JSON backups, calendar `.ics` and research exports. Canceling the picker does not mark a backup as saved. JSON import uses Android's file chooser.
- Refresh of cloud data when returning to the app.
- Existing planner icon and splash colors. No extra storage permissions.
- Optional Android local notifications at 09:00 by default: 7 days, 1 day, and/or on the deadline date, with a configurable time. These are on-device alarms, not cloud push notifications. Includes reboot and app-update rescheduling.

## Test on a phone before release

1. Open in airplane mode as a guest; create an item, restart and confirm it remains.
2. Reconnect and sign in with an existing planner account. Confirm conferences, papers, peer reviews and abstracts match the website.
3. Change a test item, wait for “Saved to your account”, then confirm on the website. Test the reverse direction after returning to the app.
4. Export JSON to Downloads. Cancel another export and confirm the backup date does not change. Import a disposable backup in guest mode.
5. On **Upcoming**, enable Android reminders and grant notification access. Set a disposable deadline several days ahead, choose 7 days / 1 day / same-day reminders, and verify the displayed number of scheduled alerts. Change or complete that deadline and confirm old reminders are cleared. Verify that signing out removes reminders belonging to the signed-in account. Test a reminder while the app is closed, and test reboot recovery on a device. Android battery management may delay delivery.
6. Check calendar and CV export, external links, keyboard, dark mode, rotation, system bars, back navigation and sign-out.

Uninstalling the app or clearing its data removes unsynced local information. Guest data in Chrome is separate from guest data in the APK: move it with JSON export/import, or sync through your account. Signed-in data loads from the same cloud account.

Native local reminders are opt-in on each device/account. Changing a deadline on another device requires opening this app so the new data can sync and reminders can update. Android may delay inexact alarms, and force-stopping the app can prevent delivery until it is reopened. Peer-review alerts never expose manuscript titles. Widgets, conflict-resolution changes and Google Play publication are not part of this test build. Production signing and store metadata remain to be configured for a public release.
