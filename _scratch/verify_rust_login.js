const RUST = "http://localhost:8081";
const cases = [
  { who: "student", email: "2207411099@mhsw.pnj.ac.id" },
  { who: "lecturer", email: "198501012010011001@pnj.ac.id" },
  { who: "admin", email: "197003031995032001@pnj.ac.id" },
];
const PASSWORD = "Password123";

async function login(email, password) {
  const r = await fetch(`${RUST}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, token: b.session && b.session.sessionToken, user: b.user };
}
async function me(token) {
  const r = await fetch(`${RUST}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, user: b.user };
}

(async () => {
  console.log("======= verify copied dummies against RUST auth server (:8081) =======\n");
  for (const c of cases) {
    const l = await login(c.email, PASSWORD);
    let meRes = l.token ? await me(l.token) : { status: "-" };
    console.log(`${c.who.padEnd(8)} ${c.email}`);
    console.log(`   /auth/login -> HTTP ${l.status}  ${l.user ? "username=" + l.user.username + " roles=" + JSON.stringify(l.user.roles) : ""}`);
    console.log(`   /auth/me    -> HTTP ${meRes.status}  ${meRes.user ? "OK ✅ (" + meRes.user.username + ")" : (l.token ? "INVALID" : "no token")}`);
  }
  // negative
  const bad = await login("2207411099@mhsw.pnj.ac.id", "WrongPass1");
  console.log(`\nwrong password -> HTTP ${bad.status} (rejected: ${bad.status !== 200 ? "YES ✅" : "NO ❌"})`);
  console.log("\n======================================================================");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
