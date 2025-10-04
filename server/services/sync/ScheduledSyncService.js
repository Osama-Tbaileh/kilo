const cron = require('node-cron');
const DataSyncService = require('./DataSyncService');
const logger = require('../../utils/logger');

class ScheduledSyncService {
  constructor() {
    this.dataSyncService = new DataSyncService();
    this.jobs = new Map();
    this.isRunning = false;
  }

  // Start all scheduled sync jobs
  start() {
    if (this.isRunning) {
      logger.warn('Scheduled sync service is already running');
      return;
    }

    logger.info('Starting scheduled sync service...');
    
    // Full sync every 6 hours (configurable)
    const fullSyncInterval = process.env.SYNC_INTERVAL_HOURS || 6;
    const fullSyncCron = `0 */${fullSyncInterval} * * *`;
    
    this.jobs.set('fullSync', cron.schedule(fullSyncCron, async () => {
      try {
        logger.info('Starting scheduled full sync...');
        await this.dataSyncService.syncAll();
        logger.info('Scheduled full sync completed');
      } catch (error) {
        logger.error('Scheduled full sync failed:', error.message);
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    }));

    // Incremental sync every 30 minutes
    this.jobs.set('incrementalSync', cron.schedule('*/30 * * * *', async () => {
      try {
        logger.info('Starting scheduled incremental sync...');
        await this.dataSyncService.syncAll({
          since: new Date(Date.now() - 2 * 60 * 60 * 1000), // Last 2 hours
          skipUsers: true, // Don't sync users in incremental
          skipRepositories: true // Don't sync repos in incremental
        });
        logger.info('Scheduled incremental sync completed');
      } catch (error) {
        logger.error('Scheduled incremental sync failed:', error.message);
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    }));

    // Daily metrics calculation at 2 AM UTC
    this.jobs.set('dailyMetrics', cron.schedule('0 2 * * *', async () => {
      try {
        logger.info('Starting scheduled daily metrics calculation...');
        // This will be implemented when we create the metrics service
        logger.info('Scheduled daily metrics calculation completed');
      } catch (error) {
        logger.error('Scheduled daily metrics calculation failed:', error.message);
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    }));

    // Weekly metrics calculation on Sundays at 3 AM UTC
    this.jobs.set('weeklyMetrics', cron.schedule('0 3 * * 0', async () => {
      try {
        logger.info('Starting scheduled weekly metrics calculation...');
        // This will be implemented when we create the metrics service
        logger.info('Scheduled weekly metrics calculation completed');
      } catch (error) {
        logger.error('Scheduled weekly metrics calculation failed:', error.message);
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    }));

    // Monthly metrics calculation on the 1st at 4 AM UTC
    this.jobs.set('monthlyMetrics', cron.schedule('0 4 1 * *', async () => {
      try {
        logger.info('Starting scheduled monthly metrics calculation...');
        // This will be implemented when we create the metrics service
        logger.info('Scheduled monthly metrics calculation completed');
      } catch (error) {
        logger.error('Scheduled monthly metrics calculation failed:', error.message);
      }
    }, {
      scheduled: false,
      timezone: 'UTC'
    }));

    // Start all jobs
    this.jobs.forEach((job, name) => {
      job.start();
      logger.info(`Started scheduled job: ${name}`);
    });

    this.isRunning = true;
    logger.info('All scheduled sync jobs started successfully');
  }

  // Stop all scheduled sync jobs
  stop() {
    if (!this.isRunning) {
      logger.warn('Scheduled sync service is not running');
      return;
    }

    logger.info('Stopping scheduled sync service...');
    
    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Stopped scheduled job: ${name}`);
    });

    this.isRunning = false;
    logger.info('All scheduled sync jobs stopped');
  }

  // Restart all scheduled sync jobs
  restart() {
    this.stop();
    setTimeout(() => {
      this.start();
    }, 1000);
  }

  // Run a specific job manually
  async runJob(jobName) {
    if (!this.jobs.has(jobName)) {
      throw new Error(`Job '${jobName}' not found`);
    }

    logger.info(`Manually running job: ${jobName}`);
    
    try {
      switch (jobName) {
        case 'fullSync':
          await this.dataSyncService.syncAll();
          break;
        case 'incrementalSync':
          await this.dataSyncService.syncAll({
            since: new Date(Date.now() - 2 * 60 * 60 * 1000),
            skipUsers: true,
            skipRepositories: true
          });
          break;
        case 'dailyMetrics':
        case 'weeklyMetrics':
        case 'monthlyMetrics':
          // Will be implemented with metrics service
          logger.info(`${jobName} job not yet implemented`);
          break;
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }
      
      logger.info(`Manual job '${jobName}' completed successfully`);
      return { success: true, message: `Job '${jobName}' completed successfully` };
      
    } catch (error) {
      logger.error(`Manual job '${jobName}' failed:`, error.message);
      throw error;
    }
  }

  // Get status of all jobs
  getStatus() {
    const jobStatuses = {};
    
    this.jobs.forEach((job, name) => {
      jobStatuses[name] = {
        running: job.running,
        lastDate: job.lastDate,
        nextDate: job.nextDate
      };
    });

    return {
      serviceRunning: this.isRunning,
      jobs: jobStatuses,
      dataSyncStatus: this.dataSyncService.getSyncStatus()
    };
  }

  // Update job schedule
  updateJobSchedule(jobName, cronExpression) {
    if (!this.jobs.has(jobName)) {
      throw new Error(`Job '${jobName}' not found`);
    }

    const oldJob = this.jobs.get(jobName);
    oldJob.stop();

    // Create new job with updated schedule
    const newJob = cron.schedule(cronExpression, oldJob.task, {
      scheduled: this.isRunning,
      timezone: 'UTC'
    });

    this.jobs.set(jobName, newJob);
    
    if (this.isRunning) {
      newJob.start();
    }

    logger.info(`Updated schedule for job '${jobName}' to: ${cronExpression}`);
  }

  // Add a custom job
  addCustomJob(name, cronExpression, task) {
    if (this.jobs.has(name)) {
      throw new Error(`Job '${name}' already exists`);
    }

    const job = cron.schedule(cronExpression, task, {
      scheduled: this.isRunning,
      timezone: 'UTC'
    });

    this.jobs.set(name, job);
    
    if (this.isRunning) {
      job.start();
    }

    logger.info(`Added custom job '${name}' with schedule: ${cronExpression}`);
  }

  // Remove a job
  removeJob(jobName) {
    if (!this.jobs.has(jobName)) {
      throw new Error(`Job '${jobName}' not found`);
    }

    const job = this.jobs.get(jobName);
    job.stop();
    this.jobs.delete(jobName);

    logger.info(`Removed job: ${jobName}`);
  }

  // Get next run times for all jobs
  getNextRunTimes() {
    const nextRuns = {};
    
    this.jobs.forEach((job, name) => {
      nextRuns[name] = job.nextDate;
    });

    return nextRuns;
  }

  // Force sync now (bypass schedule)
  async forceSyncNow(options = {}) {
    logger.info('Force sync requested...');
    
    try {
      const result = await this.dataSyncService.syncAll(options);
      logger.info('Force sync completed successfully');
      return result;
    } catch (error) {
      logger.error('Force sync failed:', error.message);
      throw error;
    }
  }

  // Get sync history/statistics
  getSyncHistory() {
    // This would typically come from a database table tracking sync runs
    // For now, return basic status
    return {
      lastSync: this.dataSyncService.lastSyncTime,
      syncInProgress: this.dataSyncService.syncInProgress,
      rateLimitInfo: this.dataSyncService.githubAPI?.getRateLimitInfo()
    };
  }
}

module.exports = ScheduledSyncService;