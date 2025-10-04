const express = require('express');
const { Op } = require('sequelize');
const { Repository, PullRequest, Commit, User } = require('../models');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// GET /api/repositories - Get all repositories with statistics
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      language, 
      archived, 
      sortBy = 'githubUpdatedAt', 
      sortOrder = 'DESC' 
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build where clause
    const whereClause = { isActive: true };
    if (language) whereClause.language = language;
    if (archived !== undefined) whereClause.archived = archived === 'true';
    
    const { count, rows: repositories } = await Repository.findAndCountAll({
      where: whereClause,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: parseInt(limit),
      offset
    });
    
    // Get statistics for each repository
    const repositoriesWithStats = await Promise.all(
      repositories.map(async (repo) => {
        const [prCount, commitCount, lastActivity] = await Promise.all([
          PullRequest.count({ where: { repositoryId: repo.id } }),
          Commit.count({ where: { repositoryId: repo.id } }),
          PullRequest.findOne({
            where: { repositoryId: repo.id },
            order: [['githubUpdatedAt', 'DESC']],
            attributes: ['githubUpdatedAt']
          })
        ]);
        
        return {
          ...repo.toJSON(),
          statistics: {
            pullRequests: prCount,
            commits: commitCount,
            lastActivity: lastActivity?.githubUpdatedAt || repo.githubUpdatedAt
          }
        };
      })
    );
    
    const totalPages = Math.ceil(count / parseInt(limit));
    
    res.json({
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: count,
        itemsPerPage: parseInt(limit),
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      },
      filters: { language, archived },
      sorting: { sortBy, sortOrder },
      repositories: repositoriesWithStats
    });
    
  } catch (error) {
    logger.error('Error fetching repositories:', error.message);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// GET /api/repositories/:id - Get specific repository details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const repository = await Repository.findByPk(id);
    
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    // Get detailed statistics
    const [
      prStats,
      commitStats,
      topContributors,
      recentActivity,
      languageStats
    ] = await Promise.all([
      // PR statistics
      PullRequest.findAll({
        where: { repositoryId: repository.id },
        attributes: [
          [PullRequest.sequelize.fn('COUNT', '*'), 'total'],
          [PullRequest.sequelize.fn('COUNT', PullRequest.sequelize.literal('CASE WHEN state = \'open\' THEN 1 END')), 'open'],
          [PullRequest.sequelize.fn('COUNT', PullRequest.sequelize.literal('CASE WHEN merged = true THEN 1 END')), 'merged'],
          [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('additions')), 'avgAdditions'],
          [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('deletions')), 'avgDeletions']
        ],
        raw: true
      }),
      
      // Commit statistics
      Commit.findAll({
        where: { repositoryId: repository.id },
        attributes: [
          [Commit.sequelize.fn('COUNT', '*'), 'total'],
          [Commit.sequelize.fn('SUM', Commit.sequelize.col('additions')), 'totalAdditions'],
          [Commit.sequelize.fn('SUM', Commit.sequelize.col('deletions')), 'totalDeletions']
        ],
        raw: true
      }),
      
      // Top contributors
      PullRequest.findAll({
        where: { repositoryId: repository.id },
        include: [{
          model: User,
          as: 'author',
          attributes: ['username', 'name', 'avatarUrl']
        }],
        attributes: [
          'authorId',
          [PullRequest.sequelize.fn('COUNT', '*'), 'prCount']
        ],
        group: ['authorId', 'author.id'],
        order: [[PullRequest.sequelize.fn('COUNT', '*'), 'DESC']],
        limit: 10,
        raw: false
      }),
      
      // Recent activity
      PullRequest.findAll({
        where: { repositoryId: repository.id },
        include: [{
          model: User,
          as: 'author',
          attributes: ['username', 'name', 'avatarUrl']
        }],
        order: [['githubUpdatedAt', 'DESC']],
        limit: 10
      }),
      
      // Language breakdown (if available)
      repository.languages
    ]);
    
    res.json({
      ...repository.toJSON(),
      statistics: {
        pullRequests: {
          total: parseInt(prStats[0]?.total || 0),
          open: parseInt(prStats[0]?.open || 0),
          merged: parseInt(prStats[0]?.merged || 0),
          avgAdditions: parseFloat(prStats[0]?.avgAdditions || 0).toFixed(1),
          avgDeletions: parseFloat(prStats[0]?.avgDeletions || 0).toFixed(1)
        },
        commits: {
          total: parseInt(commitStats[0]?.total || 0),
          totalAdditions: parseInt(commitStats[0]?.totalAdditions || 0),
          totalDeletions: parseInt(commitStats[0]?.totalDeletions || 0)
        }
      },
      topContributors: topContributors.map(item => ({
        user: item.author,
        prCount: parseInt(item.dataValues.prCount)
      })),
      recentActivity: recentActivity.map(pr => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.author,
        createdAt: pr.githubCreatedAt,
        updatedAt: pr.githubUpdatedAt
      })),
      languageBreakdown: languageStats
    });
    
  } catch (error) {
    logger.error('Error fetching repository details:', error.message);
    res.status(500).json({ error: 'Failed to fetch repository details' });
  }
});

// GET /api/repositories/:id/activity - Get repository activity timeline
router.get('/:id/activity', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, limit = 50 } = req.query;
    
    const repository = await Repository.findByPk(id);
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    const start = startDate ? new Date(startDate) : moment().subtract(30, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Get recent PRs and commits
    const [recentPRs, recentCommits] = await Promise.all([
      PullRequest.findAll({
        where: {
          repositoryId: repository.id,
          githubCreatedAt: { [Op.between]: [start, end] }
        },
        include: [{
          model: User,
          as: 'author',
          attributes: ['username', 'name', 'avatarUrl']
        }],
        order: [['githubCreatedAt', 'DESC']],
        limit: parseInt(limit) / 2
      }),
      
      Commit.findAll({
        where: {
          repositoryId: repository.id,
          authorDate: { [Op.between]: [start, end] }
        },
        include: [{
          model: User,
          as: 'author',
          attributes: ['username', 'name', 'avatarUrl']
        }],
        order: [['authorDate', 'DESC']],
        limit: parseInt(limit) / 2
      })
    ]);
    
    // Combine and format activities
    const activities = [
      ...recentPRs.map(pr => ({
        type: 'pull_request',
        action: pr.state === 'open' ? 'opened' : pr.merged ? 'merged' : 'closed',
        timestamp: pr.githubCreatedAt,
        user: pr.author,
        data: {
          number: pr.number,
          title: pr.title,
          htmlUrl: pr.htmlUrl,
          additions: pr.additions,
          deletions: pr.deletions
        }
      })),
      
      ...recentCommits.map(commit => ({
        type: 'commit',
        action: 'committed',
        timestamp: commit.authorDate,
        user: commit.author,
        data: {
          sha: commit.sha.substring(0, 7),
          message: commit.message.split('\n')[0], // First line only
          htmlUrl: commit.htmlUrl,
          additions: commit.additions,
          deletions: commit.deletions
        }
      }))
    ];
    
    // Sort by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
      repository: {
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName
      },
      dateRange: { start, end },
      totalActivities: activities.length,
      activities: activities.slice(0, parseInt(limit))
    });
    
  } catch (error) {
    logger.error('Error fetching repository activity:', error.message);
    res.status(500).json({ error: 'Failed to fetch repository activity' });
  }
});

// GET /api/repositories/analytics/overview - Get repositories overview analytics
router.get('/analytics/overview', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(30, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Get repository statistics
    const [
      totalRepos,
      activeRepos,
      archivedRepos,
      languageDistribution,
      activityStats,
      topReposByPRs,
      topReposByCommits
    ] = await Promise.all([
      Repository.count(),
      Repository.count({ where: { isActive: true, archived: false } }),
      Repository.count({ where: { archived: true } }),
      
      // Language distribution
      Repository.findAll({
        where: { isActive: true, language: { [Op.not]: null } },
        attributes: [
          'language',
          [Repository.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['language'],
        order: [[Repository.sequelize.fn('COUNT', '*'), 'DESC']],
        limit: 10,
        raw: true
      }),
      
      // Activity statistics
      Promise.all([
        PullRequest.count({
          where: { githubCreatedAt: { [Op.between]: [start, end] } }
        }),
        Commit.count({
          where: { authorDate: { [Op.between]: [start, end] } }
        })
      ]),
      
      // Top repositories by PRs
      PullRequest.findAll({
        where: { githubCreatedAt: { [Op.between]: [start, end] } },
        include: [{
          model: Repository,
          as: 'repository',
          attributes: ['name', 'fullName', 'language']
        }],
        attributes: [
          'repositoryId',
          [PullRequest.sequelize.fn('COUNT', '*'), 'prCount']
        ],
        group: ['repositoryId', 'repository.id'],
        order: [[PullRequest.sequelize.fn('COUNT', '*'), 'DESC']],
        limit: 10,
        raw: false
      }),
      
      // Top repositories by commits
      Commit.findAll({
        where: { authorDate: { [Op.between]: [start, end] } },
        include: [{
          model: Repository,
          as: 'repository',
          attributes: ['name', 'fullName', 'language']
        }],
        attributes: [
          'repositoryId',
          [Commit.sequelize.fn('COUNT', '*'), 'commitCount']
        ],
        group: ['repositoryId', 'repository.id'],
        order: [[Commit.sequelize.fn('COUNT', '*'), 'DESC']],
        limit: 10,
        raw: false
      })
    ]);
    
    const [totalPRs, totalCommits] = activityStats;
    
    res.json({
      dateRange: { start, end },
      overview: {
        totalRepositories: totalRepos,
        activeRepositories: activeRepos,
        archivedRepositories: archivedRepos,
        totalPRsInPeriod: totalPRs,
        totalCommitsInPeriod: totalCommits
      },
      languageDistribution: languageDistribution.map(item => ({
        language: item.language,
        count: parseInt(item.count),
        percentage: ((parseInt(item.count) / activeRepos) * 100).toFixed(1)
      })),
      topRepositories: {
        byPRs: topReposByPRs.map(item => ({
          repository: item.repository,
          prCount: parseInt(item.dataValues.prCount)
        })),
        byCommits: topReposByCommits.map(item => ({
          repository: item.repository,
          commitCount: parseInt(item.dataValues.commitCount)
        }))
      }
    });
    
  } catch (error) {
    logger.error('Error fetching repositories analytics:', error.message);
    res.status(500).json({ error: 'Failed to fetch repositories analytics' });
  }
});

// GET /api/repositories/analytics/health - Get repository health scores
router.get('/analytics/health', async (req, res) => {
  try {
    const repositories = await Repository.findAll({
      where: { isActive: true, archived: false }
    });
    
    // Calculate health scores for each repository
    const healthScores = await Promise.all(
      repositories.map(async (repo) => {
        const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
        const ninetyDaysAgo = moment().subtract(90, 'days').toDate();
        
        const [
          recentPRs,
          recentCommits,
          stalePRs,
          avgTimeToMerge,
          mergeRate
        ] = await Promise.all([
          PullRequest.count({
            where: {
              repositoryId: repo.id,
              githubCreatedAt: { [Op.gte]: thirtyDaysAgo }
            }
          }),
          
          Commit.count({
            where: {
              repositoryId: repo.id,
              authorDate: { [Op.gte]: thirtyDaysAgo }
            }
          }),
          
          PullRequest.count({
            where: {
              repositoryId: repo.id,
              state: 'open',
              githubUpdatedAt: { [Op.lt]: moment().subtract(14, 'days').toDate() }
            }
          }),
          
          PullRequest.findAll({
            where: {
              repositoryId: repo.id,
              merged: true,
              timeToMerge: { [Op.not]: null },
              githubCreatedAt: { [Op.gte]: ninetyDaysAgo }
            },
            attributes: ['timeToMerge'],
            raw: true
          }),
          
          PullRequest.findAll({
            where: {
              repositoryId: repo.id,
              githubCreatedAt: { [Op.gte]: ninetyDaysAgo }
            },
            attributes: ['merged'],
            raw: true
          })
        ]);
        
        // Calculate health metrics
        const activityScore = Math.min(100, (recentPRs + recentCommits) * 5); // Max 100
        const staleScore = Math.max(0, 100 - (stalePRs * 10)); // Penalty for stale PRs
        
        const avgMergeTime = avgTimeToMerge.length > 0 ? 
          avgTimeToMerge.reduce((sum, pr) => sum + pr.timeToMerge, 0) / avgTimeToMerge.length : 0;
        const mergeTimeScore = avgMergeTime > 0 ? Math.max(0, 100 - (avgMergeTime / 60)) : 50; // Hours to score
        
        const totalPRs = mergeRate.length;
        const mergedPRs = mergeRate.filter(pr => pr.merged).length;
        const mergeRateScore = totalPRs > 0 ? (mergedPRs / totalPRs) * 100 : 50;
        
        const overallHealth = Math.round(
          (activityScore * 0.3 + staleScore * 0.3 + mergeTimeScore * 0.2 + mergeRateScore * 0.2)
        );
        
        return {
          repository: {
            id: repo.id,
            name: repo.name,
            fullName: repo.fullName,
            language: repo.language
          },
          healthScore: overallHealth,
          metrics: {
            activity: {
              score: Math.round(activityScore),
              recentPRs,
              recentCommits
            },
            staleness: {
              score: Math.round(staleScore),
              stalePRs
            },
            mergeTime: {
              score: Math.round(mergeTimeScore),
              avgHours: avgMergeTime > 0 ? (avgMergeTime / 60).toFixed(1) : 'N/A'
            },
            mergeRate: {
              score: Math.round(mergeRateScore),
              percentage: totalPRs > 0 ? ((mergedPRs / totalPRs) * 100).toFixed(1) : 'N/A'
            }
          }
        };
      })
    );
    
    // Sort by health score descending
    healthScores.sort((a, b) => b.healthScore - a.healthScore);
    
    res.json({
      totalRepositories: repositories.length,
      averageHealthScore: Math.round(
        healthScores.reduce((sum, repo) => sum + repo.healthScore, 0) / healthScores.length
      ),
      healthDistribution: {
        excellent: healthScores.filter(r => r.healthScore >= 80).length,
        good: healthScores.filter(r => r.healthScore >= 60 && r.healthScore < 80).length,
        fair: healthScores.filter(r => r.healthScore >= 40 && r.healthScore < 60).length,
        poor: healthScores.filter(r => r.healthScore < 40).length
      },
      repositories: healthScores
    });
    
  } catch (error) {
    logger.error('Error fetching repository health scores:', error.message);
    res.status(500).json({ error: 'Failed to fetch repository health scores' });
  }
});

module.exports = router;