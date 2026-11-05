# library-catalog-compilation

## Run locally

1. Install dependencies with `npm install`.
2. Create a Python environment and install the preprocessing packages:

   ```sh
   python -m venv .venv
   .venv/Scripts/python -m pip install -r requirements.txt  # Windows
   .venv/bin/python -m pip install -r requirements.txt      # macOS/Linux
   ```

   The server automatically uses `.venv` when present. Otherwise, it looks for Python on `PATH` (`py -3` on Windows, `python3` on macOS/Linux). If needed, set `PYTHON` in `.env` to the full path of a working Python executable, then restart the server.
3. Create a PostgreSQL database and copy `.env.example` to `.env`. Set `DATABASE_URL` to the database connection string, or configure `HOST`, `USER`, `PASSWORD`, `DATABASE`, and optionally `PGPORT` or `DB_PORT` (the database port defaults to 5432). Set `SESSION_SECRET` to a random secret (for example, generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
4. From the repository root, create the catalog and user tables and load the demo account:

   ```sh
   psql -U postgres -d library_catalog -f db/schema.sql
   psql -U postgres -d library_catalog -f db/users.sql
   psql -U postgres -d library_catalog -f db/test_data.sql
   ```

5. Start the server with `npm start` and open <http://localhost:3000>. Import an `.htm`, `.html`, or `.csv` file from the catalog page. The matching Python parser processes it and the resulting records are inserted into PostgreSQL as one transaction.

The demo account is `catalog_test` / `LibraryDemo2026!`. Accounts created through sign up are stored in PostgreSQL with bcrypt-hashed passwords. Sessions are stored in PostgreSQL as well.

### Development database reset

To clear catalog records while preserving user accounts and sessions, run:

```sh
npm run db:reset -- --yes
```

This development-only command refuses to run when `NODE_ENV=production`.