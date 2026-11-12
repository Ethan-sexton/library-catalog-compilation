const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const pool = require('../db');

const reportPath = path.join(__dirname, '..', '..', 'report.txt');
const crashLogPath = path.join(__dirname, '..', '..', '.report-crashes.log');

function formatAuditEvent(event) {
  const timestamp = new Date(event.occurred_at).toISOString();
  const actor = event.actor_id == null ? 'unknown user' : `user ${event.actor_id}`;
  const lines = [
    `[${timestamp}] ${event.action} ${event.table_name} record ${event.record_key} by ${actor}`,
  ];

  if (event.old_data != null) {
    lines.push(`  Before: ${JSON.stringify(event.old_data)}`);
  }
  if (event.new_data != null) {
    lines.push(`  After:  ${JSON.stringify(event.new_data)}`);
  }
  return lines.join('\n');
}

function formatAuditReport(events, crashLog = '') {
  const sections = [
    'Library Catalog Change Report',
    `Generated: ${new Date().toISOString()}`,
    'Changes are recorded transactionally; application errors are included when available.',
    '',
    ...events.map(formatAuditEvent),
  ];
  if (crashLog.trim()) {
    sections.push('', 'Application crash details', crashLog.trimEnd());
  }
  return `${sections.join('\n')}\n`;
}

async function refreshAuditReport() {
  const { rows } = await pool.query(
    `SELECT id, occurred_at, actor_id, action, table_name, record_key, old_data, new_data
       FROM audit_events
      ORDER BY id`
  );
  let crashLog = '';
  try {
    crashLog = await fs.readFile(crashLogPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const report = formatAuditReport(rows, crashLog);
  const temporaryPath = `${reportPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, report, 'utf8');
    await fs.rename(temporaryPath, reportPath);
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        console.error('Failed to remove temporary audit report:', cleanupError);
      }
    }
    throw error;
  }
  return report;
}

async function setAuditActor(client, userId) {
  await client.query(
    "SELECT set_config('app.user_id', $1, true)",
    [userId == null ? '' : String(userId)]
  );
}

async function runAuditedTransaction(userId, operation) {
  const client = await pool.connect();
  let transactionStarted = false;
  let committed = false;
  let result;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await setAuditActor(client, userId);
    result = await operation(client);
    await client.query('COMMIT');
    transactionStarted = false;
    committed = true;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to roll back audited transaction:', rollbackError);
      }
    }
    throw error;
  } finally {
    client.release();
  }

  if (committed && process.env.NODE_ENV !== 'test') {
    try {
      await refreshAuditReport();
    } catch (error) {
      console.error('Failed to refresh report.txt from the audit log:', error);
    }
  }
  return result;
}

async function recordApplicationError({ userId, source, message, stack, url }) {
  const details = {
    source: String(source || 'application').slice(0, 100),
    message: String(message || 'Unknown application error').slice(0, 2000),
    stack: String(stack || '').slice(0, 8000),
    url: String(url || '').slice(0, 1000),
  };
  await pool.query(
    `INSERT INTO audit_events (
       actor_id, action, table_name, record_key, new_data
     ) VALUES ($1, 'ERROR', 'application', $2, $3::jsonb)`,
    [userId == null ? null : userId, details.source, JSON.stringify(details)]
  );

  if (process.env.NODE_ENV !== 'test') {
    try {
      await refreshAuditReport();
    } catch (error) {
      console.error('Failed to refresh report.txt after recording an application error:', error);
    }
  }
}

module.exports = {
  crashLogPath,
  formatAuditReport,
  recordApplicationError,
  refreshAuditReport,
  reportPath,
  runAuditedTransaction,
};
