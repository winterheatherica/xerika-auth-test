const { Client } = require("pg");
const base = { host: "127.0.0.1", port: 15552, user: "postgres", password: "erika" };
const conn = (db) => new Client({ ...base, database: db });

const DUMMY = ["2207411099", "2207411088", "2207411077", "198501012010011001", "197003031995032001"];

async function cols(c, table) {
  const r = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [table]
  );
  return r.rows.map((x) => x.column_name).join(", ");
}

(async () => {
  const j = conn("xerika-java"); await j.connect();
  const x = conn("xerika"); await x.connect();

  for (const [label, c] of [["xerika-java", j], ["xerika", x]]) {
    console.log(`\n========== ${label} ==========`);
    console.log("users cols      :", await cols(c, "users"));
    console.log("credentials cols:", await cols(c, "credentials"));
    console.log("user_roles cols :", await cols(c, "user_roles"));
    console.log("roles cols      :", await cols(c, "roles"));
    const roles = await c.query("SELECT id, name, parent_id, description FROM roles ORDER BY name");
    console.log("roles:");
    roles.rows.forEach((r) => console.log(`   ${r.name}  id=${r.id}  parent_id=${r.parent_id}  desc=${r.description}`));
    const ucount = await c.query("SELECT count(*)::int n FROM users");
    console.log("users count:", ucount.rows[0].n);
  }

  // dummy users in xerika-java (with roles + credential presence)
  console.log("\n=== xerika-java dummy users ===");
  const du = await j.query(
    `SELECT u.id, u.email, u.username, u.enabled, u.email_verified, u.first_name, u.last_name,
            (SELECT count(*)::int FROM credentials cr WHERE cr.user_id=u.id) AS cred_cnt,
            array(SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id ORDER BY r.name) AS roles
     FROM users u WHERE u.username = ANY($1) ORDER BY u.username`, [DUMMY]);
  du.rows.forEach((r) => console.log(`   ${r.username} | ${r.email} | enabled=${r.enabled} verified=${r.email_verified} | creds=${r.cred_cnt} | roles=${JSON.stringify(r.roles)} | id=${r.id}`));

  // which dummies already exist in xerika?
  console.log("\n=== xerika: which dummy usernames already present? ===");
  const ex = await x.query("SELECT username FROM users WHERE username = ANY($1) ORDER BY username", [DUMMY]);
  console.log("   present:", ex.rows.map((r) => r.username).join(", ") || "(none)");

  // credentials columns sample from java (one dummy) to see the blob shape
  const sample = await j.query(
    `SELECT type, secret_data IS NOT NULL AS has_secret, credential_data IS NOT NULL AS has_cred
     FROM credentials WHERE user_id=(SELECT id FROM users WHERE username='2207411099') `);
  console.log("\n=== sample credential (2207411099) ===", JSON.stringify(sample.rows));

  await j.end(); await x.end();
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
