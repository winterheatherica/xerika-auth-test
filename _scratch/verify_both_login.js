const AUTH = "http://localhost:8080";
const STUDENT = "http://localhost:3002";
const LECTURER = "http://localhost:3001";
const BASIC = "Basic a290YWtwZW5nYWR1YW4uanRpa0BnbWFpbC5jb206ZTUwNzQxNmE1YjY0ODk2OTRlNjM3MjAwYjE3MTA3Y2M4MGZkYWYxNjFlM2UzNWExNDJiNTEwNGIzMmI4Y2I2ZA==";

function mp(obj) { const fd = new FormData(); for (const [k, v] of Object.entries(obj)) fd.append(k, v); return fd; }

async function appLogin(base, path, idField, id, password) {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: BASIC }, body: mp({ [idField]: id, password }) });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, ok: b.success, token: b.data && b.data.accessToken, data: b.data };
}

// Prove the token is a REAL auth-server session by validating it at the auth server directly.
async function authMe(token) {
  const r = await fetch(`${AUTH}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, user: b.user };
}

(async () => {
  console.log("================ LOGIN FROM BOTH APPS -> AUTH SERVER ================\n");

  // ---- App 1: kpjtikStudent (NIM) ----
  console.log("APP 1  kpjtikStudent (:3002)  — login by NIM 2207411099");
  const s = await appLogin(STUDENT, "/student/v1/login", "nim", "2207411099", "Password123");
  console.log(`  POST /student/v1/login        -> HTTP ${s.status}  success=${s.ok}`);
  console.log(`  token (auth-server session)   -> ${s.token ? s.token.slice(0, 20) + "..." : "NONE"}`);
  if (s.token) {
    const me = await authMe(s.token);
    console.log(`  AUTH SERVER /auth/me (token)  -> HTTP ${me.status}  user=${me.user ? me.user.username + " roles=" + JSON.stringify(me.user.roles) : "INVALID"}`);
    console.log(`  >> proves student app authenticated VIA the auth server: ${me.status === 200 ? "YES ✅" : "NO ❌"}`);
  }
  const sBad = await appLogin(STUDENT, "/student/v1/login", "nim", "2207411099", "WrongPass1");
  console.log(`  wrong password                -> HTTP ${sBad.status} (rejected: ${sBad.status !== 200 ? "YES ✅" : "NO ❌"})`);

  // ---- App 2: kpjtikLecturer (NIP) ----
  console.log("\nAPP 2  kpjtikLecturer (:3001)  — login by NIP 198501012010011001");
  const l = await appLogin(LECTURER, "/lecturer/v1/login", "nip", "198501012010011001", "Password123");
  console.log(`  POST /lecturer/v1/login       -> HTTP ${l.status}  success=${l.ok}`);
  console.log(`  token (auth-server session)   -> ${l.token ? l.token.slice(0, 20) + "..." : "NONE"}`);
  if (l.token) {
    const me = await authMe(l.token);
    console.log(`  AUTH SERVER /auth/me (token)  -> HTTP ${me.status}  user=${me.user ? me.user.username + " roles=" + JSON.stringify(me.user.roles) : "INVALID"}`);
    console.log(`  >> proves lecturer app authenticated VIA the auth server: ${me.status === 200 ? "YES ✅" : "NO ❌"}`);
  }
  const lBad = await appLogin(LECTURER, "/lecturer/v1/login", "nip", "198501012010011001", "WrongPass1");
  console.log(`  wrong password                -> HTTP ${lBad.status} (rejected: ${lBad.status !== 200 ? "YES ✅" : "NO ❌"})`);

  // ---- Admin login via lecturer app ----
  console.log("\nADMIN  via kpjtikLecturer       — login by NIP 197003031995032001");
  const a = await appLogin(LECTURER, "/lecturer/v1/login", "nip", "197003031995032001", "Password123");
  if (a.token) {
    const me = await authMe(a.token);
    console.log(`  AUTH SERVER /auth/me (token)  -> HTTP ${me.status}  user=${me.user ? me.user.username + " roles=" + JSON.stringify(me.user.roles) : "INVALID"}`);
  }
  console.log("\n=====================================================================");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
