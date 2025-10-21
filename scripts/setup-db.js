#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const dependencyPath = path.join(rootDir, 'node_modules', 'better-sqlite3');
const dataDir = path.join(rootDir, 'data');
const dbPath = path.join(dataDir, 'kiosk.db');
const seedPath = path.join(dataDir, 'login-seed.json');

function log(message) {
  process.stdout.write(`➡️  ${message}\n`);
}

function ensureDependency() {
  if (fs.existsSync(dependencyPath)) {
    log('better-sqlite3 already installed.');
    return;
  }

  log('Installing better-sqlite3 (this might take a moment)...');
  execSync('npm install better-sqlite3@^9.4.0', {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

function ensureDirectories() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log(`Created data directory at ${path.relative(rootDir, dataDir)}`);
  }
}

function defaultSeed() {
  return {
    users: [
      {
        username: 'admin',
        password: 'change-me-now',
        metadata: {
          role: 'administrator',
          createdAt: new Date().toISOString(),
        },
      },
    ],
    notes: 'Update the default credentials immediately after installation.',
  };
}

function ensureSeedFile() {
  if (!fs.existsSync(seedPath)) {
    const seed = defaultSeed();
    fs.writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf8');
    log(`Created seed file at ${path.relative(rootDir, seedPath)}`);
  }

  const raw = fs.readFileSync(seedPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.users)) {
    throw new Error('Seed file must contain a "users" array.');
  }

  return parsed.users;
}

function ensurePasswordHash(user) {
  if (user.password_hash && typeof user.password_hash === 'string') {
    return user.password_hash;
  }

  if (!user.password || typeof user.password !== 'string') {
    throw new Error(`User ${user.username} is missing a "password" or "password_hash" field.`);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${user.password}`).digest('hex');
  const combined = `${salt}:${hash}`;
  // Persist the derived hash on the seed object so subsequent operations stay in sync.
  user.password_hash = combined;
  delete user.password;
  return combined;
}

function loadDatabase() {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      metadata TEXT DEFAULT '{}' CHECK(json_valid(metadata)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
      UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
  return db;
}

function synchronizeUsers(db, users) {
  const insert = db.prepare(`
    INSERT INTO users (username, password_hash, metadata)
    VALUES (@username, @password_hash, json(@metadata))
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash,
      metadata = json(@metadata)
  `);

  let created = 0;
  let updated = 0;

  const transaction = db.transaction((records) => {
    for (const user of records) {
      const passwordHash = ensurePasswordHash(user);
      const metadata = user.metadata ?? {};
      const before = db.prepare('SELECT password_hash, metadata FROM users WHERE username = ?').get(user.username);
      insert.run({
        username: user.username,
        password_hash: passwordHash,
        metadata: JSON.stringify(metadata),
      });
      if (before) {
        updated += 1;
      } else {
        created += 1;
      }
    }
  });

  transaction(users);
  return { created, updated };
}

function updateSeedFile(users) {
  const normalized = users.map((user) => ({
    username: user.username,
    password_hash: ensurePasswordHash(user),
    metadata: user.metadata ?? {},
  }));

  const payload = {
    users: normalized,
    lastSynchronizedAt: new Date().toISOString(),
  };

  fs.writeFileSync(seedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  log('Seed file updated with password hashes.');
}

function main() {
  log('Starting database setup...');
  ensureDependency();
  ensureDirectories();
  const users = ensureSeedFile();
  const db = loadDatabase();
  const { created, updated } = synchronizeUsers(db, users);
  updateSeedFile(users);
  log(`Database ready at ${path.relative(rootDir, dbPath)}.`);
  log(`Users created: ${created}, users updated: ${updated}.`);
  log('Setup complete. You can now authenticate against the SQLite database.');
}

main();
