CLOUD SYNC — ONE-TIME FIREBASE SETUP

The app now works and retains data after refresh without Firebase.
For SAME shared data on different phones/networks:

1. Firebase Console -> create/open project.
2. Project Settings -> Web App -> copy Web Config.
3. Paste those values into firebase-config.js.
4. Authentication -> Sign-in method -> enable Anonymous.
5. Firestore Database -> create database.
6. Firestore Rules -> paste firestore.rules -> Publish.
7. Upload final files to GitHub Pages.

Without your own Firebase Web Config, no code can connect to your Firebase project.
The Firebase config values are project-specific and cannot be safely invented.

Live site:
https://atifalhaditex-lang.github.io/master-super-store-assistant/
