# Conference invitations — Firebase setup and privacy

This feature adds conference invitations between **mutual contacts**. It does **not** use phone contacts or upload address books. Both people must sign in with verified email accounts, exchange their **Planner IDs** (Firebase authentication UIDs), and add each other's ID to their **Contacts** entry. Users who are only in one person's contacts cannot receive invitations.

## Deploy required before using the feature

The repository currently does **not** contain the live Firestore rules used by the Firebase project. Copy the two `match` blocks and the `verifiedPlannerUser()` helper from [firestore-invitations.rules](firestore-invitations.rules) **into the existing Firestore rules** in Firebase Console > Firestore Database > Rules, inside `match /databases/{database}/documents`. Preserve the existing planner data access rules. Review and publish the combined rules. **Do not replace your rules with the snippet alone**: replacing them could break accounts or expose private planner data.

The feature is **not live until those Firestore security rules are deployed**. The app shows an error instead of granting insecure access. Recommended: first test using two disposable verified accounts and the Firestore Rules emulator, including cross-account denial cases.

## Usage

1. Open **Contacts**, copy **My Planner ID** and send it privately to your friend.
2. Add your friend's ID to their entry under **Contacts**. They must also add yours. The contact card shows **Mutual contact ✓** once both connections have synced.
3. In **Conferences & Visits**, open the conference card, check **I am attending**, select the mutual contact and click **Send invitation**.
4. Your friend opens **Upcoming > Conference invitations**, chooses **Accept & add to planner** or **Decline**. Accept imports only the conference name, location, dates and website, not private notes, funding, abstract, tasks or reviews. Imported conferences begin as **Considering**, not automatically confirmed attendance.
5. When a contact's Planner ID is removed, its outgoing connection is removed on the next successful sync. Existing received invitations remain visible to the recipient.

## Security and limitations

- No email discovery, email harvesting, public user directory, contact-book upload or background push notifications. ID sharing requires user action.
- The sender's verified account email is revealed to the invitation recipient.
- Incoming invitations are private to the recipient; the sender cannot read the recipient's inbox. There is one invitation per sender and conference; duplicates are rejected.
- The recipient gets an **in-app invitation on opening the planner**, not an Android push notification.
- Only conference details explicitly shared are transmitted. Contacts, notes, costs, abstracts and peer reviews are never sent.
- Revocation blocks *new* invitations but does not erase invitations already received.
- Invitation changes need a network connection. Local guest mode remains unchanged.
- If deleting an account, Firestore user connection and inbox documents should also be removed; account deletion cleanup for these new collections is tracked for a production release.
- The separate experimental Capacitor Android branch needs `social.js` included in its packaged web assets once this feature is merged.
