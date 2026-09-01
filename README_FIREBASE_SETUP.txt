MASTER SUPER STORE — MOBILE CLOUD FREE FINAL

THIS IS THE VERSION FOR YOUR ACTUAL REQUIREMENT

✓ Works on mobile from ANY Wi-Fi / mobile data / other network
✓ No PC needs to stay ON
✓ Same style/use as your cloud Finance Assistant approach
✓ GitHub Pages can host the frontend
✓ Firebase Authentication handles Create Account / Login
✓ Cloud Firestore stores each account's private profile + shop data
✓ Logged-in owner's own Name + Email show at the top
✓ SHOUKAT ALI is NOT permanent
✓ Supabase removed
✓ Node.js / Express / MongoDB are NOT needed for this version
✓ Mobile PWA / Add to Home Screen included

WHY FIREBASE
For this requirement it is easier than maintaining a Node/Express server:
GitHub Pages -> frontend
Firebase Auth -> user accounts
Firestore -> cloud database
This means no server to keep awake and no Render free-service sleep issue.

ONE-TIME FIREBASE SETUP
1. Open https://console.firebase.google.com/
2. Create a Firebase project.
3. Project -> Add app -> Web (</>).
4. Copy the Firebase config.
5. Open firebase-config.js in this package.
6. Replace the PASTE_... values with your Firebase config.

AUTHENTICATION
1. Firebase Console -> Authentication -> Get started.
2. Sign-in method -> Email/Password -> Enable.
3. Authentication -> Settings -> Authorized domains.
4. Add:
   atifalhaditex-lang.github.io

FIRESTORE
1. Firebase Console -> Firestore Database -> Create database.
2. Choose a region reasonably close to users.
3. Open Firestore -> Rules.
4. Copy/paste the contents of firestore.rules from this package.
5. Publish the rules.

GITHUB PAGES
Upload/replace these files in the existing repository:
- index.html
- style.css
- app.js
- firebase-config.js
- manifest.webmanifest
- service-worker.js
- icons/ folder

Keep firestore.rules for Firebase Console; it does not affect GitHub Pages directly.

Existing live URL can remain:
https://atifalhaditex-lang.github.io/master-super-store-assistant/

HOW DATA IS SEPARATED
Firebase Authentication creates a unique UID for every account.
Firestore stores:
profiles/{UID}
stores/{UID}

The security rules only let the signed-in UID read/write its OWN two documents.
One customer cannot load another customer's store through the app.

NEW ACCOUNT
Owner Name + Shop Name + Email are saved in profiles/{UID}.
An empty private store database is created in stores/{UID}.

RETURNING LOGIN
Same email/password -> same Firebase UID -> same profile + same store data.

MOBILE
Open the GitHub Pages website in Chrome.
Use Add to Home Screen / Install App.
Then it behaves like a standalone mobile web app.

IMPORTANT
Firebase's web config/API key is normally present in frontend apps.
Security comes from Authentication + Firestore Security Rules, which are included here.
Do NOT use permissive Firestore test-mode rules for production.


BRANDING UPDATE
- Store branding fixed as MASTER SUPER STORE.
- Owner identity shown as SHOUKAT ALI TAHIR.
- Premium animated shadow/hover owner box added to header.
