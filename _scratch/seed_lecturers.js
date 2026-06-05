const { Client } = require("pg");

const AUTH = "http://localhost:8080";
const pg = new Client({ host: "127.0.0.1", port: 15552, user: "postgres", password: "erika", database: "kpjtik" });
const PASSWORD = "Password123";

// numeric NIP usernames; one plain lecturer, one super-admin
const LECTURERS = [
  { nip: "198501012010011001", name: "Andi Wijaya", lecturer_type: "lt-akademik", roles: ["lecturer"] },
  { nip: "197003031995032001", name: "Maya Sari", lecturer_type: "lt-kemahasiswaan", roles: ["lecturer", "admin"] },
];
const emailFor = (nip) => `${nip}@pnj.ac.id`;

async function adminLogin() {
  const r = await fetch(`${AUTH}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@gmail.com", password: "admin123" }),
  });
  if (!r.ok) throw new Error("admin login failed " + r.status);
  return (await r.json()).session.sessionToken;
}
async function listUsers(tok) {
  return (await (await fetch(`${AUTH}/admin/users`, { headers: { Authorization: `Bearer ${tok}` } })).json());
}
async function createUser(tok, { nip, name }) {
  const [firstName, ...rest] = name.split(" ");
  const r = await fetch(`${AUTH}/admin/users`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ email: emailFor(nip), username: nip, password: PASSWORD, firstName, lastName: rest.join(" ") || firstName, enabled: true, emailVerified: true }),
  });
  if (r.status === 201) return await r.json();
  if (r.status === 409) return (await listUsers(tok)).find((u) => u.username === nip);
  throw new Error(`create ${nip} failed ${r.status}: ${await r.text()}`);
}
async function assignRole(tok, id, role) {
  await fetch(`${AUTH}/admin/users/${id}/roles/${role}`, { method: "POST", headers: { Authorization: `Bearer ${tok}` } });
}
async function revokeRole(tok, id, role) {
  await fetch(`${AUTH}/admin/users/${id}/roles/${role}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}` } });
}
async function upsertLocalAdmin({ nip, name, lecturer_type }) {
  const exists = await pg.query("SELECT _id FROM admin WHERE nip=$1", [nip]);
  if (exists.rows.length > 0) { console.log(`   local admin ${nip} exists`); return; }
  await pg.query(
    `INSERT INTO admin(_id, name, nip, email, lecturer_type, "createdAt") VALUES($1,$2,$3,$4,$5,NOW())`,
    [`lecturer-${nip}`, name, nip, emailFor(nip), lecturer_type]
  );
  console.log(`   local admin ${nip} inserted`);
}

(async () => {
  await pg.connect();
  const tok = await adminLogin();
  console.log("admin logged in");
  for (const l of LECTURERS) {
    console.log(`\nSeeding ${l.roles.includes("admin") ? "SUPER-ADMIN" : "lecturer"} ${l.nip} (${l.name}) ...`);
    const user = await createUser(tok, l);
    for (const role of l.roles) await assignRole(tok, user.id, role);
    await revokeRole(tok, user.id, "user"); // keep roles crisp (lecturers aren't students)
    await upsertLocalAdmin(l);
    const me = await fetch(`${AUTH}/admin/users/${user.id}`, { headers: { Authorization: `Bearer ${tok}` } });
    console.log(`   roles now: ${JSON.stringify((await me.json()).roles)}`);
  }
  await pg.end();
  console.log("\nDONE. NIPs:", LECTURERS.map((l) => l.nip).join(", "), "password:", PASSWORD);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
