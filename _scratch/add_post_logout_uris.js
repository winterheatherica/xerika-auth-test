const AUTH = "http://localhost:8081";
const ADDS = [
  { clientId: "kpjtik-enduser", uri: "http://localhost:8090/login" },
  { clientId: "kpjtik-admin", uri: "http://localhost:8091/auth/login" },
];

async function adminLogin() {
  const r = await fetch(`${AUTH}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@gmail.com", password: "admin123" }),
  });
  return (await r.json()).session.sessionToken;
}
async function findClient(tok, clientId) {
  const list = await (await fetch(`${AUTH}/admin/clients`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  return list.find((c) => (c.clientId || c.client_id) === clientId);
}

(async () => {
  const tok = await adminLogin();
  for (const a of ADDS) {
    const c = await findClient(tok, a.clientId);
    if (!c) { console.log(`! ${a.clientId} not found`); continue; }
    const existing = (c.redirectUris || c.redirect_uris || []).map((u) => (typeof u === "string" ? u : u.uri));
    if (existing.includes(a.uri)) { console.log(`• ${a.clientId}: ${a.uri} already present`); continue; }
    const r = await fetch(`${AUTH}/admin/clients/${c.id}/redirect-uris`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ uri: a.uri }),
    });
    console.log(`${a.clientId}: add ${a.uri} -> HTTP ${r.status}`);
  }
  // show final
  const list = await (await fetch(`${AUTH}/admin/clients`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  for (const c of list.filter((x) => (x.clientId || x.client_id || "").startsWith("kpjtik"))) {
    console.log(`   ${c.clientId || c.client_id}: ${JSON.stringify((c.redirectUris || c.redirect_uris || []).map((u) => (typeof u === "string" ? u : u.uri)))}`);
  }
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
