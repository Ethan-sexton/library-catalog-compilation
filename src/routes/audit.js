const express = require('express');
const {
  recordApplicationError,
  refreshAuditReport,
} = require('../services/auditService');

const errorRouter = express.Router();
const reportRouter = express.Router();

errorRouter.post('/', async (req, res) => {
  try {
    const { source, message, stack, url } = req.body || {};
    await recordApplicationError({
      userId: req.session.userId,
      source,
      message,
      stack,
      url,
    });
    res.status(202).json({ ok: true });
  } catch (error) {
    console.error('Failed to record application error:', error);
    res.status(500).json({ error: 'Unable to record application error' });
  }
});

reportRouter.get('/report.txt', async (_req, res) => {
  try {
    const report = await refreshAuditReport();
    res
      .type('text/plain')
      .set('Content-Disposition', 'inline; filename="report.txt"')
      .send(report);
  } catch (error) {
    console.error('Failed to generate report.txt:', error);
    res.status(500).json({ error: 'Unable to generate report.txt' });
  }
});

module.exports = { errorRouter, reportRouter };
