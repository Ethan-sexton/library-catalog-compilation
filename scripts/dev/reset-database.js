require('dotenv').config();

const pool = require('../../src/db');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database reset is disabled when NODE_ENV=production');
  }
  if (!process.argv.includes('--yes')) {
    throw new Error('This clears all catalog records. Run with --yes to confirm.');
  }

  await pool.query(`
    TRUNCATE TABLE
      associated_compiled,
      associated_new_entry,
      compiled_records,
      new_entries
    RESTART IDENTITY
  `);
  console.log('Catalog data cleared. User accounts and sessions were preserved.');
}

main()
  .catch((error) => {
    console.error(`Database reset failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
