const express = require('express');
const DataSyncService = require('../services/sync/DataSyncService');
const ScheduledSyncService = require('../services/sync/ScheduledSyncService');
const { verifyToken, loadUser, requireAdmin } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// Initialize services
const dataSyncService = new DataSyncService();
const scheduledSyncService = new ScheduledSyncService();

// GET /api/sync/status - Get sync status
router.get('/status', async (req, res) => {
  try {
    const status = dataSyncService.getSyncStatus();
    const scheduledStatus = scheduledSyncService.getStatus();
    
    res.json({
      dataSync: status,
      scheduledSync: scheduledStatus,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching sync status:', error.message);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

// POST /api/sync/trigger - Trigger manual sync (admin only)
router.post('/trigger', requireAdmin, async (req, res) => {
  try {
    const { 
      syncType = 'full',
      skipUsers = false,
      skipRepositories = false,
      skipPullRequests = false,
      skipCommits = false,
      since
    } = req.body;
    
    if (dataSyncService.syncInProgress) {
      return res.status(409).json({ 
        error: 'Sync already in progress',
        currentSync: dataSyncService.getSyncStatus()
      });
    }
    
    logger.info(`Manual sync triggered by ${req.dbUser.username}`, { syncType, options: req.body });
    
    // Start sync in background
    const syncPromise = dataSyncService.syncAll({
      skipUsers,
      skipRepositories,
      skipPullRequests,
      skipCommits,
      since: since ? new Date(since) : undefined,
      fullSync: syncType === 'full'
    });
    
    // Don't await - let it run in background
    syncPromise.catch(error => {
      logger.error('Background sync failed:', error.message);
    });
    
    res.json({
      message: 'Sync initiated successfully',
      syncType,
      options: { skipUsers, skipRepositories, skipPullRequests, skipCommits, since },
      triggeredBy: req.dbUser.username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error triggering sync:', error.message);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// POST /api/sync/stop - Stop current sync (admin only)
router.post('/stop', requireAdmin, async (req, res) => {
  try {
    if (!dataSyncService.syncInProgress) {
      return res.status(400).json({ error: 'No sync currently in progress' });
    }
    
    // Note: This is a simplified implementation
    // In a real scenario, you'd need a more sophisticated way to stop ongoing sync
    logger.warn(`Sync stop requested by ${req.dbUser.username}`);
    
    res.json({
      message: 'Sync stop requested (implementation depends on sync architecture)',
      requestedBy: req.dbUser.username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error stopping sync:', error.message);
    res.status(500).json({ error: 'Failed to stop sync' });
  }
});

// GET /api/sync/history - Get sync history
router.get('/history', async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    
    // This would typically come from a sync_logs table
    // For now, return basic information
    const history = {
      totalSyncs: 0,
      recentSyncs: [],
      lastSuccessfulSync: dataSyncService.lastSyncTime,
      currentStatus: dataSyncService.getSyncStatus()
    };
    
    res.json({
      pagination: {
        currentPage: parseInt(page),
        totalItems: history.totalSyncs,
        itemsPerPage: parseInt(limit)
      },
      history
    });
    
  } catch (error) {
    logger.error('Error fetching sync history:', error.message);
    res.status(500).json({ error: 'Failed to fetch sync history' });
  }
});

// GET /api/sync/scheduled/status - Get scheduled sync status
router.get('/scheduled/status', async (req, res) => {
  try {
    const status = scheduledSyncService.getStatus();
    const nextRuns = scheduledSyncService.getNextRunTimes();
    
    res.json({
      ...status,
      nextRuns,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching scheduled sync status:', error.message);
    res.status(500).json({ error: 'Failed to fetch scheduled sync status' });
  }
});

// POST /api/sync/scheduled/start - Start scheduled sync service (admin only)
router.post('/scheduled/start', requireAdmin, async (req, res) => {
  try {
    if (scheduledSyncService.isRunning) {
      return res.status(400).json({ error: 'Scheduled sync service is already running' });
    }
    
    scheduledSyncService.start();
    logger.info(`Scheduled sync service started by ${req.dbUser.username}`);
    
    res.json({
      message: 'Scheduled sync service started successfully',
      startedBy: req.dbUser.username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error starting scheduled sync service:', error.message);
    res.status(500).json({ error: 'Failed to start scheduled sync service' });
  }
});

// POST /api/sync/scheduled/stop - Stop scheduled sync service (admin only)
router.post('/scheduled/stop', requireAdmin, async (req, res) => {
  try {
    if (!scheduledSyncService.isRunning) {
      return res.status(400).json({ error: 'Scheduled sync service is not running' });
    }
    
    scheduledSyncService.stop();
    logger.info(`Scheduled sync service stopped by ${req.dbUser.username}`);
    
    res.json({
      message: 'Scheduled sync service stopped successfully',
      stoppedBy: req.dbUser.username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error stopping scheduled sync service:', error.message);
    res.status(500).json({ error: 'Failed to stop scheduled sync service' });
  }
});

// POST /api/sync/scheduled/restart - Restart scheduled sync service (admin only)
router.post('/scheduled/restart', requireAdmin, async (req, res) => {
  try {
    scheduledSyncService.restart();
    logger.info(`Scheduled sync service restarted by ${req.dbUser.username}`);
    
    res.json({
      message: 'Scheduled sync service restarted successfully',
      restartedBy: req.dbUser.username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error restarting scheduled sync service:', error.message);
    res.status(500).json({ error: 'Failed to restart scheduled sync service' });
  }
});

// POST /api/sync/scheduled/run-job - Run specific scheduled job manually (admin only)
router.post('/scheduled/run-job', requireAdmin, async (req, res) => {
  try {
    const { jobName } = req.body;
    
    if (!jobName) {
      return res.status(400).json({ error: 'jobName is required' });
    }
    
    logger.info(`Manual job execution requested: ${jobName} by ${req.dbUser.username}`);
    
    // Run job in background
    const jobPromise = scheduledSyncService.runJob(jobName);
    
    jobPromise.catch(error => {
      logger.error(`Manual job ${jobName} failed:`, error.message);
    });
    
    res.json({
      message: `Job '${jobName}' execution initiated`,
      jobName,
      triggeredBy: req.dbUser.username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error running scheduled job:', error.message);
    res.status(500).json({ error: 'Failed to run scheduled job' });
  }
});

// PUT /api/sync/scheduled/job/:jobName - Update job schedule (admin only)
router.put('/scheduled/job/:jobName', requireAdmin, async (req, res) => {
  try {
    const { jobName } = req.params;
    const { cronExpression } = req.body;
    
    if (!cronExpression) {
      return res.status(400).json({ error: 'cronExpression is required' });
    }
    
    scheduledSyncService.updateJobSchedule(jobName, cronExpression);
    logger.info(`Job schedule updated: ${jobName} -> ${cronExpression} by ${req.dbUser.username}`);
    
    res.json({
      message: `Job '${jobName}' schedule updated successfully`,
      jobName,
      newSchedule: cronExpression,
      updatedBy: req.dbUser.username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error updating job schedule:', error.message);
    res.status(500).json({ error: error.message || 'Failed to update job schedule' });
  }
});

// GET /api/sync/rate-limit - Get GitHub API rate limit info
router.get('/rate-limit', async (req, res) => {
  try {
    const rateLimitInfo = dataSyncService.githubAPI.getRateLimitInfo();
    
    res.json({
      rateLimit: rateLimitInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching rate limit info:', error.message);
    res.status(500).json({ error: 'Failed to fetch rate limit info' });
  }
});

// POST /api/sync/test-connection - Test GitHub API connection
router.post('/test-connection', requireAdmin, async (req, res) => {
  try {
    // Test GitHub API connection
    const orgInfo = await dataSyncService.githubAPI.getOrganization();
    
    res.json({
      success: true,
      organization: {
        name: orgInfo.name,
        login: orgInfo.login,
        description: orgInfo.description,
        publicRepos: orgInfo.public_repos,
        totalPrivateRepos: orgInfo.total_private_repos
      },
      rateLimit: dataSyncService.githubAPI.getRateLimitInfo(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('GitHub API connection test failed:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/sync/stats - Get sync statistics
router.get('/stats', async (req, res) => {
  try {
    const { User, Repository, PullRequest, Review, Comment, Commit } = require('../models');
    
    // Get basic statistics
    const [
      totalUsers,
      totalRepos,
      totalPRs,
      totalReviews,
      totalComments,
      totalCommits,
      lastSyncedUser,
      lastSyncedRepo,
      lastSyncedPR
    ] = await Promise.all([
      User.count({ where: { isActive: true } }),
      Repository.count({ where: { isActive: true } }),
      PullRequest.count(),
      Review.count(),
      Comment.count(),
      Commit.count(),
      
      User.findOne({
        where: { lastSyncAt: { [require('sequelize').Op.not]: null } },
        order: [['lastSyncAt', 'DESC']],
        attributes: ['username', 'lastSyncAt']
      }),
      
      Repository.findOne({
        where: { lastSyncAt: { [require('sequelize').Op.not]: null } },
        order: [['lastSyncAt', 'DESC']],
        attributes: ['fullName', 'lastSyncAt']
      }),
      
      PullRequest.findOne({
        where: { lastSyncAt: { [require('sequelize').Op.not]: null } },
        order: [['lastSyncAt', 'DESC']],
        attributes: ['number', 'title', 'lastSyncAt'],
        include: [{
          model: Repository,
          as: 'repository',
          attributes: ['fullName']
        }]
      })
    ]);
    
    res.json({
      totals: {
        users: totalUsers,
        repositories: totalRepos,
        pullRequests: totalPRs,
        reviews: totalReviews,
        comments: totalComments,
        commits: totalCommits
      },
      lastSynced: {
        user: lastSyncedUser,
        repository: lastSyncedRepo,
        pullRequest: lastSyncedPR
      },
      syncStatus: dataSyncService.getSyncStatus(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching sync stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch sync statistics' });
  }
});

module.exports = router;