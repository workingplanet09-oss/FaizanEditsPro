// Signs in as a demo user and requests a list of pages, flagging non-200s and PHP error text.
// Usage: node php-tests/smoke-pages.mjs <admin|editor|client> /path1 /path2 …   (BASE env overrides the server)
const BASE = process.env.BASE || "http://127.0.0.1:8081";
const [kind, ...paths] = process.argv.slice(2);
const jar = {};
function store(res) { for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); jar[kv.slice(0, i)] = kv.slice(i + 1); } }
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
async function get(path, opts = {}) { const r = await fetch(BASE + path, { redirect: "manual", headers: { cookie: cookie() }, ...opts }); store(r); return r; }
await get("/login");
const login = await fetch(BASE + "/api/auth/demo", { method: "POST", headers: { cookie: cookie(), "content-type": "application/json", "x-csrf-token": jar.fe_csrf ?? "" }, body: JSON.stringify({ kind }) });
store(login);
if (!login.ok) { console.log("demo sign-in failed", login.status, await login.text()); process.exit(2); }
let bad = 0;
for (const p of paths) {
  const r = await get(p);
  const body = await r.text();
  const err = /Fatal error|Warning:|Notice:|Deprecated:|Undefined (variable|array key|index|property)|Stack trace|Uncaught|Call to undefined|Something went wrong/i.exec(body);
  const ok = r.status === 200 && !err;
  if (!ok) bad++;
  const loc = r.headers.get("location");
  console.log(ok ? "ok  " : "FAIL", r.status, p, loc ? "→ " + loc : "", err ? "— " + body.slice(Math.max(0, err.index - 80), err.index + 200).replace(/\s+/g, " ") : "");
}
process.exit(bad ? 1 : 0);
