# postgres-jtik init

Taruh dump / schema database `kpjtik` kamu (file `*.sql` atau `*.sh`) di folder ini.

Postgres bakal auto-run semua file di sini **sekali**, yaitu pas volume
`pgdata-jtik` masih kosong (first boot). Urutan eksekusi alfabetis — kasih
prefix angka kalau butuh urutan:

    01-schema.sql
    02-seed.sql

Reset biar init jalan ulang (HATI-HATI: ngehapus semua data kpjtik):

    docker compose down -v
    docker compose up -d postgres-jtik

Kalau folder ini kosong, `postgres-jtik` tetap nyala normal tapi database
`kpjtik`-nya kosong (belum ada tabel) — 2 BE tetap boot, cuma query bakal error
sampai schema-nya dimuat.
