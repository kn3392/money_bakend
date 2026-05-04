import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

/** Dangerous extensions — block even if MIME is spoofed */
const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.pif',
  '.scr',
  '.msi',
  '.dll',
  '.js',
  '.mjs',
  '.cjs',
  '.jar',
  '.sh',
  '.ps1',
  '.vbs',
  '.wsf',
  '.hta',
]);

export const RECEIPTS_DIR = path.join(
  process.cwd(),
  env.UPLOAD_DIR,
  'receipts'
);

try {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
} catch {
  //
}

function assertReceiptSafe(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new AppError('This file type is not allowed for receipts', 400);
  }
}

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RECEIPTS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const safe =
      `${Date.now()}-${Math.round(Math.random() * 1e9)}` + ext.toLowerCase();
    cb(null, safe);
  },
});

const receiptUploader = multer({
  storage: receiptStorage,
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    try {
      assertReceiptSafe(file);
    } catch (e) {
      cb(e);
      return;
    }
    const okMime =
      (file.mimetype && file.mimetype.startsWith('image/')) ||
      file.mimetype === 'application/pdf';
    if (!okMime)
      cb(new AppError('Receipt must be an image or PDF file', 400));
    else cb(null, true);
  },
}).single('receipt');

/** JSON backup (manual restore from UI). */
export const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.RESTORE_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/json' ||
      /\.json$/i.test(file.originalname || '');
    if (!ok) cb(new AppError('Restore file must be JSON', 400));
    else cb(null, true);
  },
}).single('file');

export function uploadReceiptMw(req, res, next) {
  receiptUploader(req, res, (err) => {
    if (err) next(err);
    else next();
  });
}
