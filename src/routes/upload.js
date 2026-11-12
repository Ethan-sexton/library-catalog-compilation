const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const fs = require('fs/promises');
const pool = require('../db');
const { selectAuthorityMatches } = require('../importHelpers');
const {
  insertAuthorityMatches,
  insertCompiledRecords,
  preprocessFile,
  validateParsedRecords,
} = require('../services/importService');

const router = express.Router();
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const UPLOAD_EXTENSIONS = new Set(['.htm', '.html', '.csv']);
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(extension)) {
      const error = new Error('Only .htm, .html, and .csv files are supported');
      error.statusCode = 400;
      callback(error);
      return;
    }
    callback(null, true);
  },
});

function receiveUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : (error.statusCode || 400);
    res.status(statusCode).json({ error: error.message });
  });
}

router.post('/upload', receiveUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A file is required' });

  try {
    const parsed = await preprocessFile(req.file.path);
    const { compiledRecords, authorityMatches } = validateParsedRecords(parsed);
    const client = await pool.connect();
    let transactionStarted = false;
    let insertedRecords;
    let importedAuthorityMatches;
    let eligibleAuthorityMatches;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      insertedRecords = await insertCompiledRecords(client, compiledRecords);
      const insertedIdentifierSet = new Set(
        insertedRecords
          .map((record) => record.associated_record_identifier)
          .filter((identifier) => identifier != null)
      );
      eligibleAuthorityMatches = authorityMatches.filter(
        ([associatedRecordId]) => insertedIdentifierSet.has(associatedRecordId)
      );
      importedAuthorityMatches = selectAuthorityMatches(
        eligibleAuthorityMatches,
        insertedIdentifierSet
      );
      await insertAuthorityMatches(client, importedAuthorityMatches);
      await client.query('COMMIT');
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Failed to roll back file import:', rollbackError);
        }
      }
      throw error;
    } finally {
      client.release();
    }

    res.json({
      compiledRecords: insertedRecords.length,
      authorityMatches: importedAuthorityMatches.length,
      skippedCompiledRecords: compiledRecords.length - insertedRecords.length,
      skippedAuthorityMatches: eligibleAuthorityMatches.length - importedAuthorityMatches.length,
    });
  } catch (error) {
    if (error.statusCode === 422) {
      return res.status(422).json({ error: error.message });
    }
    console.error('File import failed:', error);
    res.status(500).json({ error: 'File import failed' });
  } finally {
    try {
      await fs.unlink(req.file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to remove uploaded temporary file:', error);
      }
    }
  }
});

module.exports = router;
