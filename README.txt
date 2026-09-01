MASTER SUPER STORE — MOBILE LOCAL FINAL

Recommended setup for your requirement:
- Frontend: existing mobile-first web app
- Backend: Node.js + Express
- Database: SQLite on YOUR OWN PC
- Supabase: REMOVED
- Neon/Render/MongoDB: NOT REQUIRED
- Monthly hosting/trial dependency: NONE

WHY THIS VERSION
SQLite is simplest because your data can remain on your own computer.
The mobile only acts as the screen/client. The PC stores the database.

HOW TO USE
1. Install Node.js 20+ on the Windows PC once.
2. Extract this full folder on the PC.
3. Double-click START_MASTER_STORE.bat.
4. The black window prints:
   http://localhost:3000
   and one or more mobile URLs such as:
   http://192.168.1.5:3000
5. Connect the PC and mobile to the SAME Wi-Fi.
6. Open the printed 192.168.x.x:3000 URL on the mobile.
7. Create Account / Login.
8. On Android Chrome use 'Add to Home screen' / 'Install app'.
   It then opens like a mobile app.

IMPORTANT
- Keep the PC ON while using the app on mobile.
- PC and phone must normally be on the same Wi-Fi/LAN.
- Your database stays inside:
  data/master-super-store.db
- Login sessions are stored inside:
  data/sessions.db
- Run BACKUP_DATABASE.bat regularly to copy the main database into /backups.

ACCOUNT DATA
Every customer/account has:
- Owner Name
- Shop Name
- Email
- Password hash (plain password is never stored)
- Separate private store data
When the same user logs in again, the same profile and store data load.
The top header shows the currently logged-in user's name and email.

NO TRIAL / FREE-TIER ISSUE
This version does not depend on Render, Neon, Supabase or another hosted trial/free service.
It runs from your own PC.

OUTSIDE HOME/SHOP WI-FI
This package is intentionally local/private.
If later you want to access the same PC database from anywhere, a secure private-network option such as Tailscale can be added without moving your database to a cloud service.
