const express = require('express');
const { Op } = require('sequelize');
const { User, Repository, PullRequest, Review, Comment, Commit } = require('../models');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// GET /api/repository-analytics/:repositoryId/contributors - Get detailed contributor analytics for a repository
router.get('/:repositoryId/contributors', async (req, res) => {
  try {
    console.log('=== REPOSITORY ANALYTICS API DEBUG ===');
    const { repositoryId } = req.params;
    const { startDate, endDate } = req.query;
    
    console.log('Repository ID:', repositoryId);
    console.log('Date range:', { startDate, endDate });
    
    // Parse and validate dates
    const start = startDate ? moment(startDate).startOf('day').toDate() : moment().subtract(30, 'days').startOf('day').toDate();
    const end = endDate ? moment(endDate).endOf('day').toDate() : moment().endOf('day').toDate();
    
    console.log('Parsed date range:', { start, end });
    
    // Verify repository exists and user has access
    const repository = await Repository.findOne({
      where: { id: repositoryId, isActive: true },
      attributes: ['id', 'name', 'fullName', 'description', 'language']
    });
    
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log('Repository found:', repository.fullName);
    
    // Get all contributors who have activity in this repository during the period
    // Simplified approach: get all users who have PRs or commits in this repo
    const [prContributors, commitContributors] = await Promise.all([
      // Users who authored PRs
      User.findAll({
        include: [{
          model: PullRequest,
          as: 'authoredPRs',
          where: {
            repositoryId,
            githubCreatedAt: { [Op.between]: [start, end] }
          },
          required: true,
          attributes: []
        }],
        attributes: ['id', 'username', 'name', 'email', 'avatarUrl'],
        group: ['User.id'],
        raw: false
      }),
      
      // Users who authored commits
      User.findAll({
        include: [{
          model: Commit,
          as: 'commits',
          where: {
            repositoryId,
            authorDate: { [Op.between]: [start, end] }
          },
          required: true,
          attributes: []
        }],
        attributes: ['id', 'username', 'name', 'email', 'avatarUrl'],
        group: ['User.id'],
        raw: false
      })
    ]);
    
    // Combine and deduplicate contributors
    const contributorMap = new Map();
    [...prContributors, ...commitContributors].forEach(user => {
      contributorMap.set(user.id, user);
    });
    const contributors = Array.from(contributorMap.values());
    
    console.log('Found contributors:', contributors.length);
    
    // Get detailed stats for each contributor
    const contributorStats = await Promise.all(
      contributors.map(async (contributor) => {
        // Removed excessive logging for performance
        
        // Get PR stats with debugging
        const [openedPRs, mergedPRs, prDetails] = await Promise.all([
          // Count opened PRs
          PullRequest.count({
            where: {
              authorId: contributor.id,
              repositoryId,
              githubCreatedAt: { [Op.between]: [start, end] }
            }
          }),
          
          // Count merged PRs
          PullRequest.count({
            where: {
              authorId: contributor.id,
              repositoryId,
              githubCreatedAt: { [Op.between]: [start, end] },
              merged: true
            }
          }),
          
          // Get detailed PR information with additional data
          PullRequest.findAll({
            where: {
              authorId: contributor.id,
              repositoryId,
              githubCreatedAt: { [Op.between]: [start, end] }
            },
            attributes: [
              'id', 'number', 'title', 'state', 'merged', 'additions', 'deletions',
              'reviewsCount', 'commentsCount', 'commitsCount',
              'githubCreatedAt', 'mergedAt', 'closedAt', 'htmlUrl'
            ],
            order: [['githubCreatedAt', 'DESC']]
          })
        ]);
        
        // Calculate total lines added/removed from PRs
        const totalAdditions = prDetails.reduce((sum, pr) => sum + (pr.additions || 0), 0);
        const totalDeletions = prDetails.reduce((sum, pr) => sum + (pr.deletions || 0), 0);
        
        // Get review stats
        const [reviewsGiven, reviewsReceived] = await Promise.all([
          // Reviews given by this contributor
          Review.count({
            where: {
              reviewerId: contributor.id,
              githubSubmittedAt: { [Op.between]: [start, end] }
            },
            include: [{
              model: PullRequest,
              as: 'pullRequest',
              where: { repositoryId },
              required: true,
              attributes: []
            }]
          }),
          
          // Reviews received on this contributor's PRs
          Review.count({
            include: [{
              model: PullRequest,
              as: 'pullRequest',
              where: {
                authorId: contributor.id,
                repositoryId,
                githubCreatedAt: { [Op.between]: [start, end] }
              },
              required: true,
              attributes: []
            }]
          })
        ]);
        
        // Get commit stats - fix the commit counting logic
        const totalCommits = await Commit.count({
          where: {
            authorId: contributor.id,
            repositoryId,
            authorDate: { [Op.between]: [start, end] }
          }
        });
        
        return {
          contributor: {
            id: contributor.id,
            username: contributor.username,
            name: contributor.name,
            email: contributor.email,
            avatarUrl: contributor.avatarUrl
          },
          stats: {
            pullRequests: {
              opened: openedPRs,
              merged: mergedPRs,
              mergeRate: openedPRs > 0 ? ((mergedPRs / openedPRs) * 100).toFixed(1) : '0.0'
            },
            linesOfCode: {
              added: totalAdditions, // Use only PR data, not commits
              removed: totalDeletions, // Use only PR data, not commits
              net: totalAdditions - totalDeletions
            },
            reviews: {
              given: reviewsGiven,
              received: reviewsReceived
            },
            commits: {
              total: totalCommits
            }
          },
          pullRequests: prDetails.map(pr => ({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            state: pr.state,
            merged: pr.merged,
            additions: pr.additions || 0,
            deletions: pr.deletions || 0,
            reviewsCount: pr.reviewsCount || 0,
            commentsCount: pr.commentsCount || 0,
            commitsCount: pr.commitsCount || 0,
            createdAt: pr.githubCreatedAt,
            mergedAt: pr.mergedAt,
            closedAt: pr.closedAt,
            htmlUrl: pr.htmlUrl
          }))
        };
      })
    );
    
    // Sort contributors by total activity (PRs + commits)
    contributorStats.sort((a, b) => {
      const aActivity = a.stats.pullRequests.opened + a.stats.commits.total;
      const bActivity = b.stats.pullRequests.opened + b.stats.commits.total;
      return bActivity - aActivity;
    });
    
    console.log('Contributor stats calculated successfully');
    
    res.json({
      repository: {
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName,
        description: repository.description,
        language: repository.language
      },
      dateRange: { start, end },
      totalContributors: contributorStats.length,
      contributors: contributorStats,
      summary: {
        totalPRs: contributorStats.reduce((sum, c) => sum + c.stats.pullRequests.opened, 0),
        totalMerged: contributorStats.reduce((sum, c) => sum + c.stats.pullRequests.merged, 0),
        totalCommits: contributorStats.reduce((sum, c) => sum + c.stats.commits.total, 0),
        totalLinesAdded: contributorStats.reduce((sum, c) => sum + c.stats.linesOfCode.added, 0),
        totalLinesRemoved: contributorStats.reduce((sum, c) => sum + c.stats.linesOfCode.removed, 0),
        totalReviews: contributorStats.reduce((sum, c) => sum + c.stats.reviews.given, 0)
      }
    });
    
  } catch (error) {
    console.log('=== REPOSITORY ANALYTICS ERROR ===');
    console.log('Error message:', error.message);
    console.log('Error stack:', error.stack);
    logger.error('Error fetching repository analytics:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch repository analytics',
      details: error.message
    });
  }
});

// GET /api/repository-analytics/contributor/:username - Get detailed analytics for a specific contributor
router.get('/contributor/:username', async (req, res) => {
  try {
    console.log('=== CONTRIBUTOR ANALYTICS API DEBUG ===');
    const { username } = req.params;
    const { startDate, endDate, includeDetails } = req.query;
    
    console.log('Username:', username);
    console.log('Date range:', { startDate, endDate });
    console.log('Include details:', includeDetails);
    
    // Parse and validate dates
    const start = startDate ? moment(startDate).startOf('day').toDate() : moment().subtract(7, 'days').startOf('day').toDate();
    const end = endDate ? moment(endDate).endOf('day').toDate() : moment().endOf('day').toDate();
    
    console.log('Parsed date range:', { start, end });
    
    // Find the contributor user
    const whereConditions = [{ username: username }];
    
    // Only search by githubId if username is a valid integer
    const githubIdAsNumber = parseInt(username, 10);
    if (!isNaN(githubIdAsNumber) && githubIdAsNumber.toString() === username) {
      whereConditions.push({ githubId: githubIdAsNumber });
    }
    
    const contributor = await User.findOne({
      where: { 
        [Op.or]: whereConditions
      },
      attributes: ['id', 'username', 'name', 'email', 'avatarUrl', 'bio', 'company', 'location']
    });
    
    if (!contributor) {
      // Return basic structure even if user not found in DB
      console.log('Contributor not found in database, providing basic structure');
      return res.json({
        contributor: {
          username: username,
          name: username,
          avatarUrl: `https://github.com/${username}.png`,
          bio: '',
          company: '',
          location: ''
        },
        stats: {
          totalPRs: 0,
          mergedPRs: 0,
          openPRs: 0,
          closedPRs: 0,
          totalReviews: 0,
          linesAdded: 0,
          linesDeleted: 0,
          commits: 0,
          repositories: 0
        },
        pullRequests: []
      });
    }
    
    console.log('Contributor found:', contributor.username);
    
    // Get contributor's pull requests in the date range
    const pullRequests = await PullRequest.findAll({
      where: {
        authorId: contributor.id,
        githubCreatedAt: {
          [Op.between]: [start, end]
        }
      },
      include: [
        {
          model: Repository,
          as: 'repository',
          attributes: ['id', 'name', 'fullName', 'description', 'language']
        },
        {
          model: Review,
          as: 'reviews',
          attributes: ['id', 'state', 'githubSubmittedAt'],
          required: false
        }
      ],
      order: [['githubCreatedAt', 'DESC']],
      attributes: [
        'id', 'number', 'title', 'state', 'htmlUrl', 'merged',
        'githubCreatedAt', 'mergedAt', 'closedAt',
        'additions', 'deletions', 'reviewsCount', 'commentsCount', 'commitsCount'
      ]
    });
    
    console.log('Pull requests found:', pullRequests.length);
    
    // Get reviews given by this contributor in the date range
    const reviewsGiven = await Review.findAll({
      where: {
        reviewerId: contributor.id,
        githubSubmittedAt: {
          [Op.between]: [start, end]
        }
      }
    });
    
    console.log('Reviews given:', reviewsGiven.length);
    
    // Get commits by this contributor in the date range
    const commits = await Commit.findAll({
      where: {
        authorId: contributor.id,
        authorDate: {
          [Op.between]: [start, end]
        }
      }
    });
    
    console.log('Commits found:', commits.length);
    
    // Calculate statistics
    const stats = {
      totalPRs: pullRequests.length,
      mergedPRs: pullRequests.filter(pr => pr.state === 'merged').length,
      openPRs: pullRequests.filter(pr => pr.state === 'open').length,
      closedPRs: pullRequests.filter(pr => pr.state === 'closed').length,
      totalReviews: reviewsGiven.length,
      linesAdded: pullRequests.reduce((sum, pr) => sum + (pr.additions || 0), 0),
      linesDeleted: pullRequests.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
      commits: commits.length,
      repositories: new Set(pullRequests.map(pr => pr.repository?.name).filter(name => name)).size
    };
    
    console.log('Statistics calculated:', stats);
    
    // Format pull requests for response
    const formattedPRs = pullRequests.map(pr => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      merged: pr.merged,
      url: pr.htmlUrl,
      createdAt: pr.githubCreatedAt,
      mergedAt: pr.mergedAt,
      closedAt: pr.closedAt,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
      reviewsCount: pr.reviewsCount || 0,
      commentsCount: pr.commentsCount || 0,
      commitsCount: pr.commitsCount || 0,
      repository: {
        name: pr.repository?.name || 'Unknown',
        fullName: pr.repository?.fullName || 'Unknown',
        language: pr.repository?.language || null
      }
    }));
    
    // Response structure
    const response = {
      contributor: {
        username: contributor.username,
        name: contributor.name,
        email: contributor.email,
        avatarUrl: contributor.avatarUrl,
        bio: contributor.bio,
        company: contributor.company,
        location: contributor.location
      },
      stats,
      pullRequests: formattedPRs,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      },
      lastUpdated: new Date().toISOString()
    };
    
    console.log('✅ Contributor analytics response prepared');
    console.log('Response summary:', {
      contributor: response.contributor.username,
      totalPRs: response.stats.totalPRs,
      repositories: response.stats.repositories
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Contributor analytics error:', error);
    logger.error('Failed to fetch contributor analytics', {
      username: req.params.username,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Failed to fetch contributor analytics',
      details: error.message
    });
  }
});

module.exports = router;