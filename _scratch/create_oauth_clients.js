const AUTH = "http://localhost:8081"; // Rust auth server

const CLIENTS = [
  { clientId: "kpjtik-enduser", name: "Kotak Pengaduan JTIK — Enduser", baseUrl: "http://localhost:8090", redirect: "http://localhost:8090/callback" },
  { clientId: "kpjtik-admin", name: "Kotak Pengaduan JTIK — Admin Dashboard", baseUrl: "http://localhost:8091", redirect: "http://localhost:8091/callback" },
];

async function adminLogin() {
  const r = await fetch(`${AUTH}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@gmail.com", password: "admin123" }),
  });
  if (!r.ok) throw new Error("admin login failed " + r.status + " " + (await r.text()));
  return (await r.json()).session.sessionToken;
}

async function findClient(tok, clientId) {
  const r = await fetch(`${AUTH}/admin/clients`, { headers: { Authorization: `Bearer ${tok}` } });
  const list = await r.json();
  return list.find((c) => c.clientId === clientId || c.client_id === clientId);
}

(async () => {
  const tok = await adminLogin();
  console.log("admin logged in on Rust :8081\n");

  for (const c of CLIENTS) {
    let client = await findClient(tok, c.clientId);
    if (client) {
      console.log(`• ${c.clientId} already exists (id=${client.id})`);
    } else {
      const r = await fetch(`${AUTH}/admin/clients`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          clientId: c.clientId, name: c.name, type: "public",
          scopes: "openid profile email",
          grantTypes: "authorization_code refresh_token",
          responseTypes: "code", pkceRequired: true, enabled: true,
          baseUrl: c.baseUrl, description: "KPJTIK SPA (OAuth2 + PKCE)",
        }),
      });
      if (!r.ok) { console.log(`! create ${c.clientId} -> ${r.status} ${await r.text()}`); continue; }
      client = await r.json();
      console.log(`✓ created ${c.clientId} (id=${client.id})`);
    }

    // add redirect uri (idempotent-ish: check existing)
    const existingUris = (client.redirectUris || client.redirect_uris || []).map((u) => (typeof u === "string" ? u : u.uri));
    if (existingUris.includes(c.redirect)) {
      console.log(`   redirect ${c.redirect} already present`);
    } else {
      const r2 = await fetch(`${AUTH}/admin/clients/${client.id}/redirect-uris`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ uri: c.redirect }),
      });
      console.log(`   add redirect ${c.redirect} -> HTTP ${r2.status}`);
    }
  }

  console.log("\n=== clients in xerika now ===");
  const r = await fetch(`${AUTH}/admin/clients`, { headers: { Authorization: `Bearer ${tok}` } });
  const list = await r.json();
  for (const c of list) {
    console.log(`   ${c.clientId || c.client_id} | type=${c.type} pkce=${c.pkceRequired ?? c.pkce_required} | redirects=${JSON.stringify((c.redirectUris||c.redirect_uris||[]).map(u=>typeof u==='string'?u:u.uri))}`);
  }
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
