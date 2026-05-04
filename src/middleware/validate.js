import { validationResult } from 'express-validator';

/**
 * Run express-validator chains, then fail with 400 if invalid.
 * @param {import('express-validator').ValidationChain[]} validations
 */
export function validate(validations) {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const first = errors.array({ onlyFirstError: true })[0];
      return res.status(400).json({
        success: false,
        message: first.msg,
        errors: errors.array(),
      });
    }
    next();
  };
}
