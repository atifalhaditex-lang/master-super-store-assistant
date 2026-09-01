MASTER SUPER STORE — SINGLE SHOP SHARED CLOUD FINAL

FINAL BEHAVIOUR
- NO Sign In screen.
- NO Create Account screen.
- Website opens directly to MASTER SUPER STORE.
- Fixed owner display: SHOUKAT ALI TAHIR.
- No SA icon/monogram.
- Owner is shown inside a premium animated shadow/hover box.
- Two or more mobiles can open the same link from ANY network.
- All devices use the SAME shared Firestore store document.
- Firebase anonymous authentication happens automatically in the background.
- Mobile PWA / Add to Home Screen remains supported.

ONE-TIME FIREBASE SETUP

1. Firebase Console -> Create/Open your project.
2. Project Settings -> Your apps -> Web app.
3. Copy Firebase Web Config into firebase-config.js.

AUTHENTICATION
1. Firebase Console -> Authentication -> Get started.
2. Sign-in method.
3. Enable "Anonymous".
4. No Email/Password account is needed for this edition.

FIRESTORE
1. Firebase Console -> Firestore Database -> Create database.
2. Open Firestore -> Rules.
3. Copy all content from firestore.rules in this package.
4. Publish.

GITHUB PAGES
Upload/replace these files in repo root:
- index.html
- style.css
- app.js
- firebase-config.js
- firestore.rules
- icon-192.svg
- icon-512.svg
- manifest.webmanifest
- service-worker.js

LIVE URL:
https://atifalhaditex-lang.github.io/master-super-store-assistant/

IMPORTANT SECURITY NOTE
This edition is intentionally a single shared shop with no visible login.
Anyone who gets the website link can potentially open the shared shop because anonymous sign-in happens automatically.
Do not share the link publicly.
