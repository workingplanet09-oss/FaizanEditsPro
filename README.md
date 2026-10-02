# Faizan Ali — website and client portal

The website for **Faizan Ali, Video Editor and Content Creator** (project name: FaizanEdits Pro) **and** the system that runs the work behind it: public website, project form, client portal with a video review player, editor workspace, and an admin console (quotes, contracts, invoices, payments, files, blog, analytics and more). The look, wording and call-to-action labels follow the personal-brand specification — see [`BRANDING.md`](BRANDING.md).

It is a plain **PHP + MySQL** application. It runs on ordinary shared hosting with cPanel. There is nothing to build and nothing to install on the server except the files in the `public_html` folder and one database.

---

## What you need

* A hosting account with **cPanel**, **PHP 8.2 or newer** and **MySQL / MariaDB** (every common shared host has these).
* A domain (or sub-domain) whose website folder is `public_html`. Install on the main address, for example `https://example.com` — not inside a sub-folder such as `example.com/studio`.
* PHP extensions `pdo_mysql`, `mbstring`, `openssl`, `ctype`, `json` (all switched on by default on cPanel). `curl` is recommended.
  Check the PHP version in cPanel → **Select PHP Version** (or **MultiPHP Manager**).

---

## Install — 5 steps

### 1. Create the database

cPanel → **MySQL® Databases**

1. *Create New Database* → for example `faizanedits` (cPanel puts your account name in front, e.g. `myaccount_faizanedits`).
2. *MySQL Users → Add New User* → choose a user name and a strong password. **Write them down.**
3. *Add User To Database* → pick the user and the database → tick **ALL PRIVILEGES** → *Make Changes*.

### 2. Upload the files

1. On your computer, open the `public_html` folder of this project and compress **its contents** into a ZIP file (select everything inside it, not the folder itself).
2. cPanel → **File Manager** → open your site's `public_html` → **Upload** the ZIP → right-click it → **Extract**. Delete the ZIP afterwards.
3. In File Manager, open *Settings* (top right) and tick **Show Hidden Files (dotfiles)**. Check that `.htaccess` is there — it keeps private files private.

You should now see `index.php`, `config.php`, `database.sql`, `app`, `assets` and `storage` inside `public_html`.

### 3. Edit `config.php`

In File Manager, right-click `config.php` → **Edit**. Change only these lines:

| Setting | What to put |
| --- | --- |
| `'name'`, `'user'`, `'password'` (inside `'db'`) | The database name, user and password from step 1. Leave `'host'` as `localhost`. |
| `'app_url'` | Your address, e.g. `'https://example.com'` (no slash at the end). Links in emails use it. |
| `'secret'` | Any long random text, 40 characters or more. Change it **once, now** — the setup page asks for its first 6 characters. |
| `'mode'` | Leave `'live'` for a real website. Use `'demo'` only for a trial. |

Save. Everything else in the file can stay as it is for now.

### 4. Import the database

cPanel → **phpMyAdmin** → click your database in the left column → **Import** → choose `database.sql` from your computer (it is in the same `public_html` folder) → **Go**.
It must say the import finished successfully.

*Optional:* to look around with example clients, projects and invoices, tick **Also load the sample studio** on the setup page in the next step (it uses `database-demo.sql`, which is already in the folder). You can remove the sample data later with one button (Admin → Settings → Integrations & system → **Remove demo data**). Skip this for a real website.

### 5. Open your website

Visit your address. The first time, you land on **Set up your studio**:

1. Enter your studio name, your name, email and a password (10+ characters).
2. Enter the **installation code** — the first 6 characters of the `secret` you put in `config.php`.
3. Press **Create my account**. You are signed in as the owner and taken to Admin → Settings.
   (Do not import `database-demo.sql` by hand — it contains sample accounts and would skip this page.)

That page disappears once your account exists. That's it — the site is live.

> **Security tip:** once the site is set up you may delete `database.sql` from the server (keep a copy on your computer); keep `database-demo.sql` if you might want the sample studio later. Neither can be downloaded from the web.

---

## After installing

### Make it yours (brand details)

Admin → **Settings** → *Business* and *Brand*: add your **portrait** (until then the About page and home page show the FA monogram), your **contact e-mail**, and the **verified links** to your social profiles. Publish only real testimonials and results (Admin → Content). Nothing on the site is invented: empty fields stay out of sight. Details of how the brand specification maps to the code are in [`BRANDING.md`](BRANDING.md).

### Turn on email (so clients receive notifications)

Out of the box the site only *records* emails (Admin → **Emails**) and sends none. In `config.php` → `'email'`, change `'driver'`:

* `'mail'` — uses the server's built-in mail. Works on most hosts with no more setup.
* `'smtp'` — recommended. In cPanel → **Email Accounts** create `hello@your-domain`, then fill in `'from'` and the `'smtp'` host (usually your domain or `localhost`), port `465`, encryption `ssl`, the mailbox address and its password.

Admin → **Emails** lists every email the site tried to send, with the error message if one failed. To test, use **Forgot your password?** on the sign-in page with your own address.

### Take real payments (optional)

Payments are off until you connect Stripe: in `config.php` → `'payments'` set `'provider' => 'stripe'` and paste your **secret key**. In your Stripe dashboard add a webhook to `https://YOUR-SITE/api/webhooks/payments` for the event `checkout.session.completed` (and `checkout.session.async_payment_failed`), and paste its signing secret into `'webhook_secret'`.
Until then, clients cannot pay online and invoices can be marked paid by hand (Admin → Invoices). A payment is only ever recorded after Stripe confirms it.

### Scheduled tasks (optional)

The site sends queued emails, reminders and overdue notices by itself while people visit. For a very quiet site, add a cPanel **Cron Job** (every 5 minutes):

```
wget -q -O - "https://YOUR-SITE/cron.php?key=YOUR-CRON-KEY" >/dev/null 2>&1
```

First put any long random text in `config.php` → `'cron_key'` and use the same text in the command. (If your host offers it you can use `php /home/ACCOUNT/public_html/cron.php` instead, without a key.)

### Large video uploads

Files are sent in small pieces (4 MB each), so big videos work even on modest hosting plans. What can still limit them is the **storage space** of your plan, and a host that refuses request bodies of 4 MB or more. If uploads stop part-way, ask your host to allow request bodies of at least 8 MB, or change `'chunk_mb' => 4` in `config.php` to `1`.

### Sign in with Google, spam protection (optional)

`config.php` → `'google'` (client id + secret) and `'turnstile'` (Cloudflare Turnstile site key + secret key). Leave them empty to keep them off.

---

## Backups

Make a backup before every change, and regularly:

1. **Database** — phpMyAdmin → your database → **Export** → *Quick* → **Go**. Keep the `.sql` file.
2. **Uploaded files** — download the folder `public_html/storage/uploads` (File Manager → select it → **Compress** → download).
3. **Settings** — download `config.php`.

**Restore:** import the `.sql` file into an empty database (phpMyAdmin → Import), put `storage/uploads` back, and keep the same `config.php`.

## Updating to a newer version

1. Make a backup (above).
2. Upload the new files over the old ones — **but do not overwrite `config.php` or the `storage` folder.**
3. If the release notes mention database changes, import the extra `.sql` file they name.

## Moving from the previous (Node.js / PostgreSQL) version

Follow [`MIGRATION.md`](MIGRATION.md). The table-by-table mapping is in [`MIGRATION_MAP.md`](MIGRATION_MAP.md).

---

## If something goes wrong

| You see | Do this |
| --- | --- |
| "The database is not ready yet" | `database.sql` has not been imported into the database named in `config.php` (step 4), or the name/user/password in `config.php` are wrong (step 3). |
| "The site is starting up" / cannot reach the database | Check `'name'`, `'user'`, `'password'` in `config.php`. Remember cPanel adds your account name in front (`account_name`). Make sure the user was added to the database with **ALL PRIVILEGES**. |
| Plain pages but no styling, or every link shows "Not found" | `.htaccess` was not uploaded (hidden file), or `mod_rewrite` is off. Show hidden files and upload it again; ask your host to enable `mod_rewrite` (it is on by default). |
| Blank page or "500" | Set `'debug' => true` in `config.php`, reload to read the message, then set it back to `false`. Confirm PHP is 8.2 or newer. |
| The setup page rejects the installation code | It is the first 6 characters of the `'secret'` in `config.php`, exactly as written (capitals count). |
| "Before you continue: replace the 'secret'…" | Put a long random text (40+ characters) into `'secret'` in `config.php`. |
| Uploads stop or fail for large files | Check free disk space; lower `'chunk_mb'` in `config.php` (see above). |
| Emails do not arrive | Set the email `'driver'` (see above) and look in Admin → **Emails** for the error. Also check the spam folder. |
| You forgot the owner password | Use **Forgot your password?** on the sign-in page (needs working email, see above). |

Run a real website over **HTTPS**: switch on the free AutoSSL certificate in cPanel and use `https://` in `'app_url'`. The site then marks its cookies secure and tells browsers to always use HTTPS.

---

## Safe by default

* Private folders (`app`, `storage`) and `config.php`, `*.sql` and `*.md` files can't be opened from the web.
* Passwords are stored as bcrypt hashes; optional two-factor sign-in; sessions in the database; forms protected against forgery (CSRF).
* Clients can only ever see their own projects, files and invoices; editors only their assigned projects.
* Errors shown to visitors never contain file paths, SQL or secrets (unless you switch `'debug'` on).
* Every important action is written to the audit log (Admin → **Audit log**).

Developers: see [`DEVELOPMENT.md`](DEVELOPMENT.md) (not needed to run the site).
