# Brand implementation — Faizan Ali

How the personal-brand specification (*Faizan Ali — Website Branding*) is applied across the whole site: public pages, onboarding, client portal, review player, billing, admin, editor workspace and e-mails. Developer notes; nothing here is needed to install or run the site (see `README.md`).

## At a glance

| Spec item | Where it lives |
| --- | --- |
| Colours (Signature Blue `#2457E6`, Ink Navy `#10213D`, Paper `#F7F9FC`, White, Slate `#526078`, Mist Blue `#EAF0FF`, hover `#1D46BC`, border `#D9E2EF`, success `#166534`, error `#B42318`) | `migration-tools/tailwind.css` → `:root` tokens (`--bg`, `--surface`, `--surface-2`, `--line`, `--fg`, `--muted`, `--accent`, `--accent-hover`, `--success`, `--danger`) |
| Navy sections with white headings | `.dark-zone` (hero-adjacent bands, process section, call-to-action band, footer) and the optional dark theme |
| Type: Manrope (headings), Inter (body, buttons, labels), Arial fallback | self-hosted in `public_html/assets/fonts/` (licences in `LICENSES.md`); `--font-display`, `--font-sans` |
| Type scale | `.display` (hero 800, 56–72 px desktop / 36–44 px phone), `.display-sm` (page titles), `.h-section` (700, 36–44 / 28–32 px), `.h-card` (700, 22–26 px) |
| Urdu | Noto Nastaliq Urdu (Arabic subset, loads only on pages that contain Urdu), `lang="ur"`/`dir="rtl"` support in `document.php`, line-height 1.8–2.2, letter-spacing off |
| Wordmark | `app/views/partials/logo.php` (Manrope ExtraBold, navy on light, white on navy; descriptor only in the footer and large placements) |
| FA monogram / favicon / app icons / share image | `public_html/favicon.svg`, `assets/img/*`; regenerate with `node migration-tools/make-icons.mjs` |
| Layout: 1200 px column, 24 px / 40–64 px gutters, 80–112 px section spacing, 16 px card radius, 12 px button radius, soft navy shadow | `.container-page`, `.section-y`, `--radius-card`, `--shadow-soft`; helpers in `app/lib/site-ui.php` |
| Buttons 44–48 px, primary blue / secondary outline, hover 120–180 ms | `btn_class()` in `app/lib/ui.php` (PHP) and `UI.btnClass` in `assets/js/admin.js` |
| Cards, badges (Mist Blue + navy text), underlined blue links, persistent labels, errors beside the field | `ui.php` helpers (`card`, `ui_badge`, `field_*`) |
| Motion: 250–550 ms, 12–24 px, cubic-bezier(0.22, 1, 0.36, 1), transform/opacity only, 50–80 ms stagger, reduced-motion respected, content visible if animation fails | `--ease-brand`, `data-reveal` (see `rv()` in `site-ui.php`), `assets/js/app.js` `reveal()`, `assets/js/theme.js` safety timer |
| Crop-corner frame on selected project images only | `.crop-frame`, applied to *featured* work only |
| One outline icon family (1.5–2 px, rounded joins) | `assets/js/icons.js` is generated from the single icon set by `build-css.mjs` |
| Voice (first person, plain, no hype) and call-to-action wording | `app/data/site-defaults.json`, `database.sql`/`database-demo.sql` (generated once by `migration-tools/rebrand-bootstrap.py`, safe to re-run), views under `app/views/` |
| Page structure (Home, Services, Portfolio with filters, Case studies, About, Process, Testimonials, FAQ, Contact, Onboarding, Client dashboard, Project review, Billing, Footer) | `app/views/site/*`, `app/views/portal/*`, `assets/js/wizard.js`, `assets/js/review.js` |
| E-mail | `render_email_html()` in `app/services/email.php` — navy header with the white wordmark, Paper background, white card, blue button, Arial-safe fonts |

Call-to-action wording used everywhere: **Discuss your project** (primary), **View my work** (secondary), **Send project details** (project form), **Leave feedback** (review), **Download final files** (delivery).

## Content that is deliberately not invented

The specification asks for accurate claims only, so these start empty or neutral and the owner fills them in (Admin → Settings):

* **Portrait.** Your photo (`assets/img/faizan-ali.jpg`, resized to 900 px wide, otherwise untouched) is the default `business.portraitUrl`. It appears in the home hero (4:5 frame, cropped from the top so the face stays in view), on the About page, in the share image (`og.png`) and in the search-engine markup. To change it, replace the file or set a new address in Admin → Settings → Business → Portrait URL. With no portrait set, the FA monogram card is shown instead.
* **Logo files.** The wordmark is live text in Manrope; if a finished logo file exists, set `business.logoUrl`.
* **Contact e-mail, phone and social links** start empty (`business.email`, `business.socials`) and appear in the footer and contact page only once set. The handle `faizaneditspro` is stored as `business.handle` (supporting use only).
* **Testimonials, results and case studies** shown in the demo are *sample* content and are marked "Sample". On a live site only entries the owner publishes appear; results are shown with their source/timeframe when provided.
* **Prices, turnarounds** default to "Custom quote" and "Confirmed in your quote".
* **Services** are the three in the specification (short-form; long-form and podcast; motion graphics). Real estate, podcast and business are *portfolio categories*, not services. The older service rows stay in the database, unpublished.

## Motion and polish (what keeps it from looking glitchy)

* **First paint never waits for JavaScript.** The hero and page titles animate with a plain CSS animation (`rv_now()`); only content below the fold uses scroll-reveal (`rv()`), and content that was scrolled past without being seen appears at once, so there are no blank gaps on scroll-up, find-in-page or print.
* **No layout jumps.** JavaScript-built blocks (review player, upload drop zone, brand-kit lists, project form) reserve their space; Inter and Manrope have metric-matched fallback faces and the two main font files are preloaded, so text does not shift when the web fonts arrive.
* **Hover is colour, 150 ms.** No lifting or resizing cards and buttons; `transition: all` is not used.
* **Switching theme changes everything in one frame** (no staggered fades); the phone menu overlays the page instead of pushing it down and its button turns into a close icon; in-page links stop below the sticky header.
* **Reduced motion** switches the animations off; with JavaScript disabled everything is visible.

`php-tests/qa/glitch.mjs` checks all of this on every screen the demo accounts can reach (desktop and phone, light and dark).

## Portfolio videos

Admin → Content → Portfolio. For each project fill *Title*, *Category*, *Client goal / Description*, *Video URL* and, ideally, *Thumbnail URL*. The video link can be:

* **YouTube** (unlisted is fine) or **Vimeo**: best playback quality and speed; shown with the privacy-friendly player.
* **Google Drive**: share the file as *Anyone with the link → Viewer* and paste the link. It plays in Drive's own player inside the project dialog; if no thumbnail is entered, Drive's generated poster is used. Drive folders cannot be embedded; they appear as an "Open on Google Drive" button. Drive limits heavy traffic on popular files and its player shows Drive's controls, so for a showcase page YouTube or Vimeo is the better home for the final videos.
* A direct `.mp4` link.

The site only frames `youtube-nocookie.com`, `youtube.com`, `player.vimeo.com` and `drive.google.com` (Content-Security-Policy `frame-src`). Not verified against a real Drive file from this machine (it has no access to Google); `php-tests/embed.php` checks the link handling.

## Deliberate deviations (with reasons)

* **Form-field and outline-button borders use `#7C8AA6`**, not `#D9E2EF`. The specified border colour is 1.3:1 against white, below the 3:1 that WCAG 1.4.11 requires for the outline of a control. Cards, dividers and table rules keep `#D9E2EF` exactly.
* **Blue on navy is not used for text.** Signature Blue is 2.7:1 on Ink Navy, so links and eyebrows on navy use a lighter tint (`#A9C0FF`) or Mist Blue, as the specification advises against blue body text on navy.
* **Dark theme.** The visitor's dark mode still exists and is a navy variant of the same palette (`.dark`), not a different brand.
* **The accent colour is still editable** in Admin → Settings → Brand. Changing it changes buttons, links and the hover shade (darkened 20 %); the default is the specified blue.
* **Header call-to-action** is hidden below 640 px (the menu has it), so the wordmark never wraps on a 320 px screen.

## Checking it

```bash
node migration-tools/build-css.mjs                       # after changing any template class or tailwind.css
BASE=http://127.0.0.1:8081 node php-tests/qa/brand.mjs   # measures the rendered pages against the specification
bash php-tests/run-all.sh --full                         # everything, including 8-viewport layout and axe sweeps
```

`php-tests/qa/brand.mjs` reads computed styles in a real browser: palette, fonts, type sizes at 1440 px and 390 px, container and gutters, radii, button size/colour/hover, wordmark rules, contrast of the main text pairs, focus visibility, transition timing, reduced motion, content visible without JavaScript, no glow/grain, the specified call-to-action wording, form-field size and borders, and the client dashboard.

## Static preview (every screen as a plain HTML file)

`preview/` holds a generated static copy of the finished site (public pages, client portal, admin console and editor workspace, as the demo accounts see them). Open `preview/index.html` in a browser, or serve the folder with any static host (`python3 -m http.server -d preview`). It exists to look at the design; actions that need PHP (saving, uploading, paying, sending) are switched off and say so. Rebuild it with `BASE=http://127.0.0.1:8081 OUT=preview node migration-tools/make-preview.mjs` against a site running in demo mode.

What is **not** verified by a test: how the typography feels with the owner's real portrait and logo, Urdu pages with real Urdu copy (the font/RTL plumbing is in place and was checked on a sample), and the live behaviour on cPanel hosting.
