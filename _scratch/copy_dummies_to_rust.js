// Copy the KPJTIK dummy identities from the Java auth DB (xerika-java) into the
// Rust auth DB (xerika). Schema is identical (Rust is a direct port) and the
// Argon2id credential blobs are self-describing, so copied password creds verify
// on the Rust server as-is. Roles are remapped by NAME (role ids differ per DB).
const { Client } = require("pg");
const base = { host: "127.0.0.1", port: 15552, user: "postgres", password: "erika" };
const conn = (db) => new Client({ ...base, database: db });

const DUMMY = ["2207411099", "2207411088", "2207411077", "198501012010011001", "197003031995032001"];

(async () => {
  const j = conn("xerika-java"); await j.connect();
  const x = conn("xerika"); await x.connect();

  // role name -> id maps
  const jRoles = {}; (await j.query("SELECT id,name FROM roles")).rows.forEach((r) => (jRoles[r.id] = r.name));
  const xRoleByName = {}; (await x.query("SELECT id,name FROM roles")).rows.forEach((r) => (xRoleByName[r.name] = r.id));

  for (const username of DUMMY) {
    const ures = await j.query("SELECT * FROM users WHERE username=$1", [username]);
    if (ures.rows.length === 0) { console.log(`! ${username}: not found in java, skip`); continue; }
    const u = ures.rows[0];

    await x.query(
      `INSERT INTO users(id,email,email_verified,username,first_name,last_name,enabled,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [u.id, u.email, u.email_verified, u.username, u.first_name, u.last_name, u.enabled, u.created_at, u.updated_at]
    );

    const creds = (await j.query("SELECT * FROM credentials WHERE user_id=$1", [u.id])).rows;
    for (const cr of creds) {
      await x.query(
        `INSERT INTO credentials(id,type,secret_data,credential_data,created_at,updated_at,user_id)
         VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [cr.id, cr.type, cr.secret_data, cr.credential_data, cr.created_at, cr.updated_at, cr.user_id]
      );
    }

    const urs = (await j.query("SELECT * FROM user_roles WHERE user_id=$1", [u.id])).rows;
    const assigned = [];
    for (const ur of urs) {
      const roleName = jRoles[ur.role_id];
      const xRoleId = xRoleByName[roleName];
      if (!xRoleId) { console.log(`! ${username}: role ${roleName} missing in xerika, skip role`); continue; }
      await x.query(
        `INSERT INTO user_roles(user_id,role_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
        [u.id, xRoleId, ur.created_at || new Date()]
      );
      assigned.push(roleName);
    }
    console.log(`✓ ${username}: user + ${creds.length} cred(s) + roles [${assigned.join(", ")}] copied`);
  }

  // report final state in xerika
  console.log("\n=== xerika dummy users now ===");
  const final = await x.query(
    `SELECT u.username, u.email, u.email_verified,
            array(SELECT r.name FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id ORDER BY r.name) AS roles
     FROM users u WHERE u.username = ANY($1) ORDER BY u.username`, [DUMMY]);
  final.rows.forEach((r) => console.log(`   ${r.username} | ${r.email} | verified=${r.email_verified} | roles=${JSON.stringify(r.roles)}`));

  await j.end(); await x.end();
  console.log("\nDONE.");
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
