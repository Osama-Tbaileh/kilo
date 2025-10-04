const express = require('express');
const { Op } = require('sequelize');
const { User, TeamMember, PullRequest, Review, Comment, Commit, Repository } = require('../models');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// GET /api/users/:id - Get specific user profile with statistics
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(90, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    const user = await User.findByPk(id, {
      include: [{
        model: TeamMember,
        as: 'teamMember'
      }],
      attributes: { exclude: ['createdAt', 'updatedAt'] }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get comprehensive statistics
    const [
      prStats,
      reviewStats,
      commentStats,
      commitStats,
      collaborationStats,
      recentActivity,
      topRepositories
    ] = await Promise.all([
      // Pull Request statistics
      PullRequest.findAll({
        where: {
          authorId: user.id,
          githubCreatedAt: { [Op.between]: [start, end] }
        },
        attributes: [
          [PullRequest.sequelize.fn('COUNT', '*'), 'total'],
          [PullRequest.sequelize.fn('COUNT', PullRequest.sequelize.literal('CASE WHEN state = \'open\' THEN 1 END')), 'open'],
          [PullRequest.sequelize.fn('COUNT', PullRequest.sequelize.literal('CASE WHEN merged = true THEN 1 END')), 'merged'],
          [PullRequest.sequelize.fn('COUNT', PullRequest.sequelize.literal('CASE WHEN state = \'closed\' AND merged = false THEN 1 END')), 'closed'],
          [PullRequest.sequelize.fn('SUM', PullRequest.sequelize.col('additions')), 'totalAdditions'],
          [PullRequest.sequelize.fn('SUM', PullRequest.sequelize.col('deletions')), 'totalDeletions'],
          [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('timeToMerge')), 'avgTimeToMerge']
        ],
        raw: true
      }),
      
      // Review statistics
      Review.findAll({
        where: {
          reviewerId: user.id,
          githubSubmittedAt: { [Op.between]: [start, end] }
        },
        attributes: [
          [Review.sequelize.fn('COUNT', '*'), 'total'],
          [Review.sequelize.fn('COUNT', Review.sequelize.literal('CASE WHEN state = \'APPROVED\' THEN 1 END')), 'approved'],
          [Review.sequelize.fn('COUNT', Review.sequelize.literal('CASE WHEN state = \'CHANGES_REQUESTED\' THEN 1 END')), 'changesRequested'],
          [Review.sequelize.fn('COUNT', Review.sequelize.literal('CASE WHEN state = \'COMMENTED\' THEN 1 END')), 'commented']
        ],
        raw: true
      }),
      
      // Comment statistics
      Comment.findAll({
        where: {
          authorId: user.id,
          githubCreatedAt: { [Op.between]: [start, end] }
        },
        attributes: [
          [Comment.sequelize.fn('COUNT', '*'), 'total'],
          [Comment.sequelize.fn('COUNT', Comment.sequelize.literal('CASE WHEN type = \'issue_comment\' THEN 1 END')), 'issueComments'],
          [Comment.sequelize.fn('COUNT', Comment.sequelize.literal('CASE WHEN type = \'review_comment\' THEN 1 END')), 'reviewComments'],
          [Comment.sequelize.fn('SUM', Comment.sequelize.col('wordCount')), 'totalWords']
        ],
        raw: true
      }),
      
      // Commit statistics
      Commit.findAll({
        where: {
          authorId: user.id,
          authorDate: { [Op.between]: [start, end] }
        },
        attributes: [
          [Commit.sequelize.fn('COUNT', '*'), 'total'],
          [Commit.sequelize.fn('SUM', Commit.sequelize.col('additions')), 'totalAdditions'],
          [Commit.sequelize.fn('SUM', Commit.sequelize.col('deletions')), 'totalDeletions'],
          [Commit.sequelize.fn('COUNT', Commit.sequelize.literal('DISTINCT repositoryId')), 'uniqueRepos']
        ],
        raw: true
      }),
      
      // Collaboration statistics (reviews received)
      Review.findAll({
        where: {
          githubSubmittedAt: { [Op.between]: [start, end] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          where: { authorId: user.id },
          attributes: []
        }],
        attributes: [
          [Review.sequelize.fn('COUNT', '*'), 'reviewsReceived'],
          [Review.sequelize.fn('COUNT', Review.sequelize.literal('DISTINCT reviewerId')), 'uniqueReviewers']
        ],
        raw: true
      }),
      
      // Recent activity
      Promise.all([
        PullRequest.findAll({
          where: {
            authorId: user.id,
            githubUpdatedAt: { [Op.gte]: moment().subtract(30, 'days').toDate() }
          },
          include: [{
            model: Repository,
            as: 'repository',
            attributes: ['name', 'fullName']
          }],
          order: [['githubUpdatedAt', 'DESC']],
          limit: 10
        }),
        
        Review.findAll({
          where: {
            reviewerId: user.id,
            githubSubmittedAt: { [Op.gte]: moment().subtract(30, 'days').toDate() }
          },
          include: [{
            model: PullRequest,
            as: 'pullRequest',
            include: [{
              model: Repository,
              as: 'repository',
              attributes: ['name', 'fullName']
            }],
            attributes: ['number', 'title']
          }],
          order: [['githubSubmittedAt', 'DESC']],
          limit: 10
        })
      ]),
      
      // Top repositories by contribution
      PullRequest.findAll({
        where: {
          authorId: user.id,
          githubCreatedAt: { [Op.between]: [start, end] }
        },
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
      })
    ]);
    
    const [recentPRs, recentReviews] = recentActivity;
    
    // Calculate productivity metrics
    const totalPRs = parseInt(prStats[0]?.total || 0);
    const mergedPRs = parseInt(prStats[0]?.merged || 0);
    const totalReviews = parseInt(reviewStats[0]?.total || 0);
    const totalCommits = parseInt(commitStats[0]?.total || 0);
    
    const daysDiff = moment(end).diff(moment(start), 'days') || 1;
    const productivity = {
      prsPerDay: (totalPRs / daysDiff).toFixed(2),
      reviewsPerDay: (totalReviews / daysDiff).toFixed(2),
      commitsPerDay: (totalCommits / daysDiff).toFixed(2)
    };
    
    // Combine recent activities
    const combinedActivity = [
      ...recentPRs.map(pr => ({
        type: 'pull_request',
        action: pr.state === 'open' ? 'opened' : pr.merged ? 'merged' : 'closed',
        timestamp: pr.githubUpdatedAt,
        data: {
          number: pr.number,
          title: pr.title,
          repository: pr.repository,
          htmlUrl: pr.htmlUrl
        }
      })),
      ...recentReviews.map(review => ({
        type: 'review',
        action: review.state.toLowerCase(),
        timestamp: review.githubSubmittedAt,
        data: {
          pullRequest: review.pullRequest,
          repository: review.pullRequest.repository
        }
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);
    
    res.json({
      user: {
        id: user.id,
        githubId: user.githubId,
        username: user.username,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        company: user.company,
        location: user.location,
        blog: user.blog,
        twitterUsername: user.twitterUsername,
        publicRepos: user.publicRepos,
        publicGists: user.publicGists,
        followers: user.followers,
        following: user.following,
        githubCreatedAt: user.githubCreatedAt,
        role: user.teamMember?.role,
        team: user.teamMember?.team,
        seniority: user.teamMember?.seniority,
        specialization: user.teamMember?.specialization,
        skills: user.teamMember?.skills
      },
      dateRange: { start, end },
      statistics: {
        pullRequests: {
          total: totalPRs,
          open: parseInt(prStats[0]?.open || 0),
          merged: mergedPRs,
          closed: parseInt(prStats[0]?.closed || 0),
          mergeRate: totalPRs > 0 ? ((mergedPRs / totalPRs) * 100).toFixed(1) : 0,
          totalAdditions: parseInt(prStats[0]?.totalAdditions || 0),
          totalDeletions: parseInt(prStats[0]?.totalDeletions || 0),
          avgTimeToMerge: prStats[0]?.avgTimeToMerge ? 
            moment.duration(prStats[0].avgTimeToMerge, 'minutes').humanize() : 'N/A'
        },
        reviews: {
          given: totalReviews,
          approved: parseInt(reviewStats[0]?.approved || 0),
          changesRequested: parseInt(reviewStats[0]?.changesRequested || 0),
          commented: parseInt(reviewStats[0]?.commented || 0),
          received: parseInt(collaborationStats[0]?.reviewsReceived || 0)
        },
        comments: {
          total: parseInt(commentStats[0]?.total || 0),
          issueComments: parseInt(commentStats[0]?.issueComments || 0),
          reviewComments: parseInt(commentStats[0]?.reviewComments || 0),
          totalWords: parseInt(commentStats[0]?.totalWords || 0)
        },
        commits: {
          total: totalCommits,
          totalAdditions: parseInt(commitStats[0]?.totalAdditions || 0),
          totalDeletions: parseInt(commitStats[0]?.totalDeletions || 0),
          uniqueRepositories: parseInt(commitStats[0]?.uniqueRepos || 0)
        },
        collaboration: {
          reviewsReceived: parseInt(collaborationStats[0]?.reviewsReceived || 0),
          uniqueReviewers: parseInt(collaborationStats[0]?.uniqueReviewers || 0)
        }
      },
      productivity,
      topRepositories: topRepositories.map(item => ({
        repository: item.repository,
        prCount: parseInt(item.dataValues.prCount)
      })),
      recentActivity: combinedActivity
    });
    
  } catch (error) {
    logger.error('Error fetching user profile:', error.message);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// GET /api/users/:id/timeline - Get user activity timeline
router.get('/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, granularity = 'day' } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(90, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate date format based on granularity
    let dateFormat;
    switch (granularity) {
      case 'hour':
        dateFormat = 'YYYY-MM-DD HH:00:00';
        break;
      case 'week':
        dateFormat = 'YYYY-[W]WW';
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }
    
    // Get activity data grouped by time period
    const [prActivity, reviewActivity, commitActivity] = await Promise.all([
      PullRequest.findAll({
        where: {
          authorId: user.id,
          githubCreatedAt: { [Op.between]: [start, end] }
        },
        attributes: [
          [PullRequest.sequelize.fn('DATE_FORMAT', PullRequest.sequelize.col('githubCreatedAt'), dateFormat), 'period'],
          [PullRequest.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: [PullRequest.sequelize.fn('DATE_FORMAT', PullRequest.sequelize.col('githubCreatedAt'), dateFormat)],
        order: [[PullRequest.sequelize.fn('DATE_FORMAT', PullRequest.sequelize.col('githubCreatedAt'), dateFormat), 'ASC']],
        raw: true
      }),
      
      Review.findAll({
        where: {
          reviewerId: user.id,
          githubSubmittedAt: { [Op.between]: [start, end] }
        },
        attributes: [
          [Review.sequelize.fn('DATE_FORMAT', Review.sequelize.col('githubSubmittedAt'), dateFormat), 'period'],
          [Review.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: [Review.sequelize.fn('DATE_FORMAT', Review.sequelize.col('githubSubmittedAt'), dateFormat)],
        order: [[Review.sequelize.fn('DATE_FORMAT', Review.sequelize.col('githubSubmittedAt'), dateFormat), 'ASC']],
        raw: true
      }),
      
      Commit.findAll({
        where: {
          authorId: user.id,
          authorDate: { [Op.between]: [start, end] }
        },
        attributes: [
          [Commit.sequelize.fn('DATE_FORMAT', Commit.sequelize.col('authorDate'), dateFormat), 'period'],
          [Commit.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: [Commit.sequelize.fn('DATE_FORMAT', Commit.sequelize.col('authorDate'), dateFormat)],
        order: [[Commit.sequelize.fn('DATE_FORMAT', Commit.sequelize.col('authorDate'), dateFormat), 'ASC']],
        raw: true
      })
    ]);
    
    // Create timeline with all periods
    const timeline = [];
    const current = moment(start);
    const endMoment = moment(end);
    
    while (current.isSameOrBefore(endMoment)) {
      const periodKey = current.format(dateFormat.replace(/\[|\]/g, ''));
      
      const prCount = prActivity.find(item => item.period === periodKey)?.count || 0;
      const reviewCount = reviewActivity.find(item => item.period === periodKey)?.count || 0;
      const commitCount = commitActivity.find(item => item.period === periodKey)?.count || 0;
      
      timeline.push({
        period: periodKey,
        date: current.format('YYYY-MM-DD'),
        pullRequests: parseInt(prCount),
        reviews: parseInt(reviewCount),
        commits: parseInt(commitCount),
        totalActivity: parseInt(prCount) + parseInt(reviewCount) + parseInt(commitCount)
      });
      
      // Increment based on granularity
      switch (granularity) {
        case 'hour':
          current.add(1, 'hour');
          break;
        case 'week':
          current.add(1, 'week');
          break;
        case 'month':
          current.add(1, 'month');
          break;
        default:
          current.add(1, 'day');
      }
    }
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl
      },
      dateRange: { start, end },
      granularity,
      timeline
    });
    
  } catch (error) {
    logger.error('Error fetching user timeline:', error.message);
    res.status(500).json({ error: 'Failed to fetch user timeline' });
  }
});

// GET /api/users/:id/collaboration - Get user collaboration network
router.get('/:id/collaboration', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(90, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get collaboration data
    const [reviewsGiven, reviewsReceived, prCollaborations] = await Promise.all([
      // Reviews given by this user
      Review.findAll({
        where: {
          reviewerId: user.id,
          githubSubmittedAt: { [Op.between]: [start, end] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'name', 'avatarUrl']
          }]
        }],
        attributes: ['state']
      }),
      
      // Reviews received by this user's PRs
      Review.findAll({
        where: {
          githubSubmittedAt: { [Op.between]: [start, end] }
        },
        include: [
          {
            model: User,
            as: 'reviewer',
            attributes: ['id', 'username', 'name', 'avatarUrl']
          },
          {
            model: PullRequest,
            as: 'pullRequest',
            where: { authorId: user.id },
            attributes: ['id']
          }
        ],
        attributes: ['state']
      }),
      
      // PRs where this user collaborated (commented on others' PRs)
      Comment.findAll({
        where: {
          authorId: user.id,
          githubCreatedAt: { [Op.between]: [start, end] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'name', 'avatarUrl']
          }],
          where: {
            authorId: { [Op.ne]: user.id } // Exclude own PRs
          }
        }]
      })
    ]);
    
    // Build collaboration network
    const collaborators = new Map();
    
    // Process reviews given
    reviewsGiven.forEach(review => {
      const collaboratorId = review.pullRequest.author.id;
      if (collaboratorId === user.id) return; // Skip self
      
      if (!collaborators.has(collaboratorId)) {
        collaborators.set(collaboratorId, {
          user: review.pullRequest.author,
          reviewsGiven: 0,
          reviewsReceived: 0,
          comments: 0,
          totalInteractions: 0
        });
      }
      
      collaborators.get(collaboratorId).reviewsGiven++;
      collaborators.get(collaboratorId).totalInteractions++;
    });
    
    // Process reviews received
    reviewsReceived.forEach(review => {
      const collaboratorId = review.reviewer.id;
      if (collaboratorId === user.id) return; // Skip self
      
      if (!collaborators.has(collaboratorId)) {
        collaborators.set(collaboratorId, {
          user: review.reviewer,
          reviewsGiven: 0,
          reviewsReceived: 0,
          comments: 0,
          totalInteractions: 0
        });
      }
      
      collaborators.get(collaboratorId).reviewsReceived++;
      collaborators.get(collaboratorId).totalInteractions++;
    });
    
    // Process comments on others' PRs
    prCollaborations.forEach(comment => {
      const collaboratorId = comment.pullRequest.author.id;
      if (collaboratorId === user.id) return; // Skip self
      
      if (!collaborators.has(collaboratorId)) {
        collaborators.set(collaboratorId, {
          user: comment.pullRequest.author,
          reviewsGiven: 0,
          reviewsReceived: 0,
          comments: 0,
          totalInteractions: 0
        });
      }
      
      collaborators.get(collaboratorId).comments++;
      collaborators.get(collaboratorId).totalInteractions++;
    });
    
    // Convert to array and sort by total interactions
    const collaborationNetwork = Array.from(collaborators.values())
      .sort((a, b) => b.totalInteractions - a.totalInteractions);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatarUrl
      },
      dateRange: { start, end },
      totalCollaborators: collaborationNetwork.length,
      collaborationNetwork: collaborationNetwork.slice(0, 20), // Top 20 collaborators
      summary: {
        totalReviewsGiven: reviewsGiven.length,
        totalReviewsReceived: reviewsReceived.length,
        totalComments: prCollaborations.length,
        totalInteractions: reviewsGiven.length + reviewsReceived.length + prCollaborations.length
      }
    });
    
  } catch (error) {
    logger.error('Error fetching user collaboration:', error.message);
    res.status(500).json({ error: 'Failed to fetch user collaboration data' });
  }
});

module.exports = router;