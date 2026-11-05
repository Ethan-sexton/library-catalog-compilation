const { Pool, types } = require('pg');

types.setTypeParser(1082, (val) => val);

const databaseUrl = process.env.DATABASE_URL;
let poolConfig;

if (databaseUrl) {
  poolConfig = { connectionString: databaseUrl };
} else {
  const host = process.env.PGHOST || process.env.HOST;
  const user = process.env.PGUSER || process.env.DB_USER || process.env.USER;
  const password = process.env.PGPASSWORD || process.env.DB_PASSWORD || process.env.PASSWORD;
  const database = process.env.PGDATABASE || process.env.DB_NAME || process.env.DATABASE;
  const rawPort = process.env.PGPORT || process.env.DB_PORT;
  const port = rawPort ? Number(rawPort) : 5432;

  if (!host || !user || !password || !database || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'PostgreSQL configuration is incomplete. Set DATABASE_URL or HOST, USER, PASSWORD, and DATABASE (PORT is optional).'
    );
  }

  poolConfig = { host, user, password, database, port };
}

const pool = new Pool(poolConfig);

module.exports = pool;