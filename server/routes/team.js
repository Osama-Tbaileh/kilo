const express = require('express');
const { Op } = require('sequelize');
const { User, Repository, PullRequest, Review, Comment, Commit, TeamMember } = require('../models');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// GET /api/team/stats - Get basic team statistics
router.get('/stats', async (req, res) => {
  try {
    console.log('=== TEAM STATS API DEBUG START ===');
    console.log('Request user:', req.user);
    console.log('Request dbUser:', req.dbUser);
    
    const { period = 'month' } = req.query;
    console.log('Period:', period);
    
    // Calculate date range
    let startDate;
    switch (period) {
      case 'week':
        startDate = moment().subtract(7, 'days').toDate();
        break;
      case 'month':
        startDate = moment().subtract(30, 'days').toDate();
        break;
      case 'quarter':
        startDate = moment().subtract(90, 'days').toDate();
        break;
      case 'year':
        startDate = moment().subtract(365, 'days').toDate();
        break;
      default:
        startDate = moment().subtract(30, 'days').toDate();
    }
    
    const endDate = new Date();
    console.log('Date range:', { startDate, endDate });

    console.log('Starting database queries...');
    
    // Get basic counts
    const [
      totalUsers,
      totalRepos,
      totalPRs,
      totalReviews,
      totalComments,
      totalCommits,
      recentPRs,
      recentCommits,
      recentReviews
    ] = await Promise.all([
      User.count({ where: { isActive: true } }).catch(err => {
        console.error('Error counting users:', err.message);
        return 0;
      }),
      Repository.count({ where: { isActive: true } }).catch(err => {
        console.error('Error counting repositories:', err.message);
        return 0;
      }),
      PullRequest.count().catch(err => {
        console.error('Error counting pull requests:', err.message);
        return 0;
      }),
      Review.count().catch(err => {
        console.error('Error counting reviews:', err.message);
        return 0;
      }),
      Comment.count().catch(err => {
        console.error('Error counting comments:', err.message);
        return 0;
      }),
      Commit.count().catch(err => {
        console.error('Error counting commits:', err.message);
        return 0;
      }),
      
      // Recent activity (within the specified period)
      PullRequest.count({
        where: {
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        }
      }).catch(err => {
        console.error('Error counting recent PRs:', err.message);
        return 0;
      }),
      
      Commit.count({
        where: {
          authorDate: { [Op.between]: [startDate, endDate] }
        }
      }).catch(err => {
        console.error('Error counting recent commits:', err.message);
        return 0;
      }),
      
      Review.count({
        where: {
          githubSubmittedAt: { [Op.between]: [startDate, endDate] }
        }
      }).catch(err => {
        console.error('Error counting recent reviews:', err.message);
        return 0;
      })
    ]);

    console.log('Basic counts completed:', {
      totalUsers, totalRepos, totalPRs, totalReviews, totalComments, totalCommits,
      recentPRs, recentCommits, recentReviews
    });

    // Get top contributors for the period
    const topContributors = await PullRequest.findAll({
      where: {
        githubCreatedAt: { [Op.between]: [startDate, endDate] }
      },
      include: [{
        model: User,
        as: 'author',
        attributes: ['username', 'name', 'avatarUrl']
      }],
      attributes: [
        'authorId',
        [PullRequest.sequelize.fn('COUNT', PullRequest.sequelize.col('PullRequest.id')), 'prCount']
      ],
      group: ['authorId', 'author.id'],
      order: [[PullRequest.sequelize.fn('COUNT', PullRequest.sequelize.col('PullRequest.id')), 'DESC']],
      limit: 5,
      raw: false
    });

    // Get repository activity (simplified to avoid complex SQL issues)
    console.log('Fetching repository activity...');
    const repoActivity = await Repository.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'fullName', 'language'],
      limit: 10,
      raw: false
    });
    
    console.log('Found repositories:', repoActivity.length);
    
    // Get PR counts for each repository separately to avoid complex SQL
    const repoActivityWithCounts = await Promise.all(
      repoActivity.map(async (repo) => {
        const prCount = await PullRequest.count({
          where: {
            repositoryId: repo.id,
            githubCreatedAt: { [Op.between]: [startDate, endDate] }
          }
        }).catch(err => {
          console.error(`Error counting PRs for repo ${repo.id}:`, err.message);
          return 0;
        });
        
        return {
          repository: {
            id: repo.id,
            name: repo.name,
            fullName: repo.fullName,
            language: repo.language
          },
          pullRequests: prCount
        };
      })
    );
    
    console.log('Repository activity with counts:', repoActivityWithCounts);

    // Calculate user's personal stats if authenticated
    let userStats = null;
    if (req.dbUser) {
      const [userPRs, userReviews, userCommits] = await Promise.all([
        PullRequest.count({
          where: {
            authorId: req.dbUser.id,
            githubCreatedAt: { [Op.between]: [startDate, endDate] }
          }
        }),
        
        Review.count({
          where: {
            reviewerId: req.dbUser.id,
            githubSubmittedAt: { [Op.between]: [startDate, endDate] }
          }
        }),
        
        Commit.count({
          where: {
            authorId: req.dbUser.id,
            authorDate: { [Op.between]: [startDate, endDate] }
          }
        })
      ]);

      // Calculate user's rank
      const allUserPRs = await PullRequest.findAll({
        where: {
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        },
        attributes: [
          'authorId',
          [PullRequest.sequelize.fn('COUNT', PullRequest.sequelize.col('id')), 'prCount']
        ],
        group: ['authorId'],
        order: [[PullRequest.sequelize.fn('COUNT', PullRequest.sequelize.col('id')), 'DESC']],
        raw: true
      });

      const userRank = allUserPRs.findIndex(u => u.authorId === req.dbUser.id) + 1;

      userStats = {
        pullRequests: userPRs,
        reviews: userReviews,
        commits: userCommits,
        rank: userRank || '--'
      };
    }

    res.json({
      period,
      dateRange: { start: startDate, end: endDate },
      totals: {
        users: totalUsers,
        repositories: totalRepos,
        pullRequests: totalPRs,
        reviews: totalReviews,
        comments: totalComments,
        commits: totalCommits
      },
      recent: {
        pullRequests: recentPRs,
        commits: recentCommits,
        reviews: recentReviews
      },
      topContributors: topContributors.map(contributor => ({
        user: contributor.author,
        pullRequests: parseInt(contributor.dataValues.prCount || 0)
      })),
      repositoryActivity: repoActivityWithCounts,
      userStats,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.log('=== TEAM STATS ERROR ===');
    console.log('Error message:', error.message);
    console.log('Error stack:', error.stack);
    console.log('Error name:', error.name);
    logger.error('Error fetching team stats:', error.message);
    logger.error('Full error:', error);
    res.status(500).json({
      error: 'Failed to fetch team statistics',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/team/members - Get team members
router.get('/members', async (req, res) => {
  try {
    const members = await User.findAll({
      where: { isActive: true },
      include: [{
        model: TeamMember,
        as: 'teamMember',
        required: false
      }],
      attributes: ['id', 'username', 'name', 'email', 'avatarUrl', 'bio', 'company', 'location'],
      order: [['name', 'ASC']]
    });

    res.json({
      totalMembers: members.length,
      members: members.map(member => ({
        id: member.id,
        username: member.username,
        name: member.name,
        email: member.email,
        avatarUrl: member.avatarUrl,
        bio: member.bio,
        company: member.company,
        location: member.location,
        role: member.teamMember?.role || 'developer',
        team: member.teamMember?.team || 'default',
        isActive: member.teamMember?.isActive !== false
      }))
    });

  } catch (error) {
    logger.error('Error fetching team members:', error.message);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// POST /api/team/sync - Trigger team data sync
router.post('/sync', async (req, res) => {
  try {
    console.log('=== TEAM SYNC TRIGGER DEBUG ===');
    console.log('User triggering sync:', req.dbUser.username);
    
    const DataSyncService = require('../services/sync/DataSyncService');
    const syncService = new DataSyncService();
    
    console.log('DataSyncService created');
    console.log('Current sync status:', syncService.getSyncStatus());
    
    // Check if sync is already in progress
    if (syncService.syncInProgress) {
      console.log('Sync already in progress');
      return res.status(409).json({
        error: 'Sync already in progress',
        status: syncService.getSyncStatus()
      });
    }

    logger.info(`Data sync triggered by user: ${req.dbUser.username}`);
    console.log('Starting sync with options...');

    // Start sync in background (don't await)
    const syncPromise = syncService.syncAll({
      skipUsers: false,
      skipRepositories: false,
      skipPullRequests: false,
      skipCommits: false,
      fullSync: false // Only sync recent data for faster initial load
    });

    console.log('Sync promise created, setting up handlers...');

    // Handle sync completion/failure in background
    syncPromise
      .then(result => {
        console.log('Background sync completed successfully:', result);
        logger.info('Background sync completed successfully', result);
        // You could emit a socket event here to notify the frontend
        const io = req.app.get('io');
        if (io) {
          io.emit('sync-completed', result);
        }
      })
      .catch(error => {
        console.log('Background sync failed:', error.message);
        console.log('Background sync error stack:', error.stack);
        logger.error('Background sync failed:', error.message);
        const io = req.app.get('io');
        if (io) {
          io.emit('sync-failed', { error: error.message });
        }
      });

    console.log('Responding with success...');
    res.json({
      message: 'Data sync initiated successfully',
      triggeredBy: req.dbUser.username,
      timestamp: new Date().toISOString(),
      status: 'started'
    });

  } catch (error) {
    console.log('=== TEAM SYNC ERROR ===');
    console.log('Sync trigger error:', error.message);
    console.log('Sync trigger error stack:', error.stack);
    logger.error('Error triggering team sync:', error.message);
    res.status(500).json({ error: 'Failed to trigger data sync' });
  }
});

// GET /api/team/sync/status - Get sync status
router.get('/sync/status', async (req, res) => {
  try {
    const DataSyncService = require('../services/sync/DataSyncService');
    const syncService = new DataSyncService();
    
    const status = syncService.getSyncStatus();
    
    res.json({
      ...status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching sync status:', error.message);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

module.exports = router;