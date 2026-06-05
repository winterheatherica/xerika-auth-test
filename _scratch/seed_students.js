const { Client } = require("pg");

const AUTH = "http://localhost:8080";
const pg = new Client({ host: "127.0.0.1", port: 15552, user: "postgres", password: "erika", database: "kpjtik" });

const STUDENTS = [
  { nim: "2207411099", name: "Budi Santoso", major: "TIK" },
  { nim: "2207411088", name: "Siti Aminah", major: "TIK" },
];
const PASSWORD = "Password123";
const emailFor = (nim) => `${nim}@mhsw.pnj.ac.id`;

async function adminLogin() {
  const r = await fetch(`${AUTH}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@gmail.com", password: "admin123" }),
  });
  if (!r.ok) throw new Error("admin login failed " + r.status);
  return (await r.json()).session.sessionToken;
}

async function findUserByUsername(adminTok, username) {
  const r = await fetch(`${AUTH}/admin/users`, { headers: { Authorization: `Bearer ${adminTok}` } });
  const users = await r.json();
  return users.find((u) => u.username === username);
}

async function createAuthUser(adminTok, { nim, name }) {
  const [firstName, ...rest] = name.split(" ");
  const body = {
    email: emailFor(nim),
    username: nim,
    password: PASSWORD,
    firstName,
    lastName: rest.join(" ") || firstName,
    enabled: true,
    emailVerified: true,
  };
  const r = await fetch(`${AUTH}/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminTok}` },
    body: JSON.stringify(body),
  });
  if (r.status === 201) return (await r.json());
  if (r.status === 409) {
    console.log(`   auth user ${nim} already exists -> reuse`);
    return await findUserByUsername(adminTok, nim);
  }
  throw new Error(`create user ${nim} failed ${r.status}: ${await r.text()}`);
}

async function upsertLocalStudent({ nim, name, major }) {
  const exists = await pg.query("SELECT _id FROM student WHERE nim=$1", [nim]);
  if (exists.rows.length > 0) {
    console.log(`   local student ${nim} already exists (${exists.rows[0]._id})`);
    return;
  }
  await pg.query(
    `INSERT INTO student(_id, name, nim, email, major, "createdAt") VALUES($1,$2,$3,$4,$5, NOW())`,
    [`student-${nim}`, name, nim, emailFor(nim), major]
  );
  console.log(`   local student ${nim} inserted`);
}

(async () => {
  await pg.connect();
  const adminTok = await adminLogin();
  console.log("admin logged in");
  for (const s of STUDENTS) {
    console.log(`\nSeeding student ${s.nim} (${s.name}) ...`);
    const user = await createAuthUser(adminTok, s);
    console.log(`   auth user id=${user.id} roles=${JSON.stringify(user.roles)}`);
    await upsertLocalStudent(s);
    // verify login
    const lr = await fetch(`${AUTH}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailFor(s.nim), password: PASSWORD }),
    });
    console.log(`   verify /auth/login -> ${lr.status} ${lr.ok ? "(roles " + JSON.stringify((await lr.json()).user.roles) + ")" : ""}`);
  }
  await pg.end();
  console.log("\nDONE. Students:", STUDENTS.map((s) => s.nim).join(", "), "password:", PASSWORD);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
