import { AppError } from '../utils/AppError.js';

/** After express-validator body checks — enforce per-type payloads. */
export function validateBusinessRules(req, _res, next) {
  const { type, amount, accountId, categoryId, fromAccountId, toAccountId } =
    req.body;

  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError('Amount must be greater than 0', 400);
  }

  if (type === 'transfer') {
    if (!fromAccountId || !toAccountId) {
      throw new AppError(
        'Transfer requires fromAccountId and toAccountId',
        400
      );
    }
    if (String(fromAccountId) === String(toAccountId)) {
      throw new AppError('Cannot transfer between the same account', 400);
    }
  } else if (type === 'income' || type === 'expense') {
    if (!accountId || !categoryId) {
      throw new AppError(
        `${type} requires accountId and categoryId`,
        400
      );
    }
  } else {
    throw new AppError('Invalid transaction type', 400);
  }

  next();
}
