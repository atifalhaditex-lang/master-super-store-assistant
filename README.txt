MASTER SUPER STORE ASSISTANT - FINAL CLOUD EDITION

Status:
- Supabase cloud database connected
- Supabase Auth connected
- Row Level Security enabled
- Each authenticated user can access only their own store_data record
- Existing browser data is migrated to cloud on first successful login if that cloud account has no store data
- Cloud auto-save after each change
- Local browser copy remains as a temporary/offline fallback

Supabase Project:
https://cdnxkqjklzcteuojayll.supabase.co

Login:
Use an email address and password.
If this is a new store/account, choose "Create New Store Account".
Depending on Supabase email settings, a confirmation email may be required before first login.

Store name:
Default is MASTER SUPER STORE.
It can be changed under Settings. Each account can have its own shop name.

IMPORTANT FOR FINAL DEPLOYMENT:
Upload index.html, style.css and app.js together to GitHub Pages/static hosting.
Do not use the old V3 files after you start entering live data in this cloud edition.


FINAL V5 AUTH/UI:
- Finance Assistant-style Sign In / Create Account tabs
- Registration includes Owner Name + Shop Name + Email + Password + Confirm Password
- Shop Name defaults to MASTER SUPER STORE and can be changed before account creation
- Forgot password + recovery flow
- Shoukat Ali premium animated owner badge
- Production redirect: https://atifalhaditex-lang.github.io/master-super-store-assistant/


FINAL PRODUCTION V7 AUDIT FIXES
- Separate local cache per authenticated Supabase user; no cross-account first-login migration.
- App will not open another browser cache if cloud load fails.
- Pakistan/local calendar date used instead of UTC date.
- Quick Udhar Sale save repaired.
- Transaction edits are atomic: original remains until replacement is successfully saved.
- Related historical edit/delete is blocked when newer dependent entries exist, preventing stock/ledger corruption.
- Stock adjustments reverse using previousStock.
- Credit purchases require a supplier.
- Product profile edit cannot silently overwrite stock; use Adjust Stock.
- Customer/supplier over-payments are blocked and exact applied amount is stored.
- Loss/wastage is deducted from Net Profit.
- Transaction snapshots preserve product/customer/supplier names if master records are later removed.
- Duplicate deleteTransaction implementation removed.
- Supabase CDN/auth load failure now fails safely.
- Custom SMTP is still required for dependable customer confirmation/recovery emails.
