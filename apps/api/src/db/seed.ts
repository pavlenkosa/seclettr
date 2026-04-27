/**
 * Development seed data.
 * Creates two test users (alice + bob) with pre-generated keys for quick testing.
 * Run: pnpm db:seed
 */
import pg from "pg";
import argon2 from "argon2";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const satisfies argon2.Options & { raw?: false };

// Placeholder key (not real cryptographic key — for dev seed only)
const SEED_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 43 chars
const SEED_SIG = "A".repeat(88); // 64 bytes base64url

async function seed() {
  await client.connect();

  console.log("Seeding development users…");

  for (const username of ["alice", "bob"]) {
    const existing = await client.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    if ((existing.rowCount ?? 0) > 0) {
      console.log(`  skip  ${username} (already exists)`);
      continue;
    }

    const passwordHash = await argon2.hash("password123", ARGON2_OPTIONS);
    const userResult = await client.query<{ id: string }>(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
      [username, passwordHash]
    );
    const userId = userResult.rows[0]!.id;

    const deviceResult = await client.query<{ id: string }>(
      `INSERT INTO devices
         (user_id, name, identity_key_public, signing_key_public, registration_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, "Dev Device", SEED_KEY, SEED_KEY, Math.floor(Math.random() * 16382) + 1]
    );
    const deviceId = deviceResult.rows[0]!.id;

    await client.query(
      "INSERT INTO signed_prekeys (device_id, key_id, public_key, signature) VALUES ($1, 1, $2, $3)",
      [deviceId, SEED_KEY, SEED_SIG]
    );

    for (let i = 1; i <= 10; i++) {
      await client.query(
        "INSERT INTO one_time_prekeys (device_id, key_id, public_key) VALUES ($1, $2, $3)",
        [deviceId, i, SEED_KEY]
      );
    }

    console.log(`  done  ${username} (id: ${userId})`);
  }

  await client.end();
  console.log("Seed complete");
}

try {
  await seed();
} catch (err) {
  console.error("Seed failed:", err);
  process.exit(1);
}
