# FaizanEdits Pro — PHP / MySQL

A plain PHP 8.2+ application that runs on ordinary cPanel hosting. `public_html/` is the whole website (upload it as is). There is no framework, no Composer and no build step on the server.

* Read `DEVELOPMENT.md` before changing code (layout, how to run it, the test suites).
* Routes are registered with `api()`, `api_public()`, `page()`, `page_post()`, `staff_get()`; files in `app/{lib,services,api,pages}` are loaded alphabetically by `app/bootstrap.php`, so a new file is live as soon as it exists.
* Every state-changing route needs a permission check *inside the handler* and must never trust ids, prices or statuses sent by the browser.
* Escape every value you print (`e()`, `json_attr()`); never build SQL by string concatenation (use the `Db::` helpers or `?` placeholders).
* After changing a template class name run `node migration-tools/build-css.mjs` (the compiled `assets/css/app.css` is committed).
* Before finishing run `bash php-tests/run-all.sh` — it must report `0 suite(s) failed`. Do not claim anything works on cPanel: only the local run is verified.
