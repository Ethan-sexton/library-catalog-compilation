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

   For an existing database, apply any migrations not yet installed, in order:

   ```sh
   psql -U postgres -d library_catalog -f db/migrations/001_add_associated_compiled_metadata.sql
   psql -U postgres -d library_catalog -f db/migrations/002_catalog_audit_log.sql
   ```

5. Start the server with `npm start` and open <http://localhost:3000>. Import an `.htm`, `.html`, or `.csv` file from the catalog page. The matching Python parser processes it and the resulting records are inserted into PostgreSQL as one transaction.

The demo account is `catalog_test` / `LibraryDemo2026!`. Accounts created through sign up are stored in PostgreSQL with bcrypt-hashed passwords. Sessions are stored in PostgreSQL as well.

### Change and error report

The database records catalog and queue additions, edits, and deletions in the `audit_events` table in the same transaction as each change. The app refreshes the root-level `report.txt` from that durable log; the report also includes browser/API errors and uncaught server crash details when available. Open it from the catalog page's **Open report.txt** link. If the app encounters an error, it prompts to open the report; if the server is unavailable, the prompt is repeated on the next app load.

The report contains catalog record values and should be treated as sensitive. It is generated locally and is excluded from version control.

### Run tests

Install the Python dependencies from `requirements.txt` in the project virtual environment, then activate it before running the full suite:

```powershell
.venv\Scripts\Activate.ps1
npm test
```

`npm run test:backend` runs Node's built-in test runner with mocked database calls; `npm run test:preprocessing` runs the Python `unittest` suite. Neither suite requires a running PostgreSQL server.

### Development database reset

To clear catalog records while preserving user accounts and sessions, run:

```sh
npm run db:reset -- --yes
```

This development-only command refuses to run when `NODE_ENV=production`.