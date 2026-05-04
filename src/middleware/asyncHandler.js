/**
 * Wraps async route handlers — forwards rejections to Express error middleware.
 * @template {import('express').Request} Req
 * @template {import('express').Response} Res
 * @template {import('express').NextFunction} Next
 * @param {(req: Req, res: Res, next: Next) => Promise<unknown>} fn
 * @returns {(req: Req, res: Res, next: Next) => void}
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
