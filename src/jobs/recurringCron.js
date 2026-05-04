import cron from 'node-cron';
import logger from '../utils/logger.js';
import { runDueRecurringAllUsers } from '../services/recurringService.js';

export function scheduleRecurringCron() {
  cron.schedule('12 * * * *', () => {
    void runDueRecurringAllUsers().catch((err) => {
      logger.error('recurring hourly job failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  });
}
