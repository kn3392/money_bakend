import http from 'http';
import app from './app.js';
import { connectDB, disconnectDB } from './config/database.js';
import { env } from './config/env.js';
import logger from './utils/logger.js';
import { scheduleRecurringCron } from './jobs/recurringCron.js';
import { scheduleNotificationCron } from './jobs/notificationCron.js';
import './models/Account.js';
import './models/Category.js';
import './models/Transaction.js';
import './models/DayLedger.js';
import './models/PersonLedger.js';
import './models/RecurringTransaction.js';
import './models/AuditLog.js';
import './models/Tag.js';
import './models/Budget.js';
import './models/SavingsGoal.js';
import './models/Loan.js';
import './models/SplitExpense.js';
import './models/Notification.js';

let server;

async function start() {
  try {
    await connectDB();
    scheduleRecurringCron();
    scheduleNotificationCron();

    server = http.createServer(app);
    server.listen(env.PORT, () => {
      logger.info(`Server listening on port ${env.PORT}`, {
        env: env.NODE_ENV,
      });
      if (env.isProduction) {
        logger.warn(
          'Receipt uploads use local disk under UPLOAD_DIR. Ephemeral filesystems (e.g. some Render/Railway instances) will lose files on restart — use S3, Cloudinary, or similar for durable receipt storage.'
        );
        // Self-ping every 14 minutes to prevent Render free-tier cold starts (sleep after 15 min idle)
        const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
        if (selfUrl) {
          const pingUrl = `${selfUrl.replace(/\/+$/, '')}/api/health`;
          setInterval(() => {
            import('http').then(({ default: httpModule }) => {
              const req = httpModule.get(pingUrl, (res) => {
                res.resume(); // drain response
              });
              req.on('error', () => {}); // silently ignore ping errors
            }).catch(() => {});
          }, 14 * 60 * 1000);
          logger.info('Keep-alive self-ping scheduled', { url: pingUrl });
        }
      }
    });

    server.on('error', (err) => {
      logger.error('HTTP server error', { err: err.message });
      process.exit(1);
    });
  } catch (err) {
    logger.error('Failed to start server', {
      err: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve(undefined)));
    });
  }

  await disconnectDB().catch((err) =>
    logger.error('Error closing MongoDB', { err: err.message })
  );

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err: err.message, stack: err.stack });
  process.exit(1);
});

void start();
