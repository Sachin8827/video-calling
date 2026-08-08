#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail('Missing DATABASE_URL environment variable');
}

let url;
try {
  url = new URL(databaseUrl);
} catch (e) {
  fail('Invalid DATABASE_URL format');
}

const user = url.username || 'postgres';
const password = url.password || '';
const host = url.hostname || 'localhost';
const port = url.port || '5432';
const db = (url.pathname || '').replace(/^\//, '') || 'postgres';

if (password) {
  // Provide password to libpq via env to avoid interactive prompt
  process.env.PGPASSWORD = password;
}

// Force SSL for AWS RDS connections
process.env.PGSSLMODE = 'require';

console.log(`Running migrations against ${host}:${port}/${db} as user ${user}`);

const migrationsDir = path.join(__dirname, '..', 'src', 'database', 'migrations');
if (!fs.existsSync(migrationsDir)) {
  fail(`Migrations folder not found: ${migrationsDir}`);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.toLowerCase().endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('No migration files found.');
  process.exit(0);
}

for (const file of files) {
  const sqlFile = path.join(migrationsDir, file);
  console.log(`\n=== Running ${file} ===`);
  const args = ['-h', host, '-p', port, '-U', user, '-d', db, '-f', sqlFile];
  const res = spawnSync('psql', args, { stdio: 'inherit', env: process.env });
  if (res.error) {
    console.error('Failed to start psql. Is it installed and on PATH?');
    console.error(res.error);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`Migration ${file} failed with exit code ${res.status}`);
    process.exit(res.status);
  }
}

console.log('\nAll migrations applied successfully.');
