# library-catalog-compilation

## Run locally

1. Install dependencies with `npm install`.
2. Create a PostgreSQL database and copy `.env.example` to `.env`. Set `DATABASE_URL` to the database connection string, or configure `HOST`, `USER`, `PASSWORD`, `DATABASE`, and optionally `PGPORT` or `DB_PORT` (the database port defaults to 5432). Set `SESSION_SECRET` to a random secret (for example, generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
3. From the repository root, create the catalog and user tables and load the demo account:

   ```sh
   psql -U postgres -d library_catalog -f db/schema.sql
   psql -U postgres -d library_catalog -f db/users.sql
   psql -U postgres -d library_catalog -f db/test_data.sql
   ```

4. Start the server with `npm start` and open <http://localhost:3000>.

The demo account is `catalog_test` / `LibraryDemo2026!`. Accounts created through sign up are stored in PostgreSQL with bcrypt-hashed passwords. Sessions are stored in PostgreSQL as well.