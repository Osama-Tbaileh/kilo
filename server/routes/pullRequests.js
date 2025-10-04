const express = require('express');
const { Op } = require('sequelize');
const { PullRequest, User, Repository, Review, Comment, Commit } = require('../models');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// GET /api/pull-requests/overview - Get PR overview statistics
router.get('/overview', async (req, res) => {
  try {
    const { startDate, endDate, repository, author, state } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(30, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Build where clause
    const whereClause = {
      githubCreatedAt: { [Op.between]: [start, end] }
    };
    
    if (repository) {
      const repo = await Repository.findOne({ where: { fullName: repository } });
      if (repo) whereClause.repositoryId = repo.id;
    }
    
    if (author) {
      const user = await User.findOne({ where: { username: author } });
      if (user) whereClause.authorId = user.id;
    }
    
    if (state) {
      whereClause.state = state;
    }
    
    // Get PR statistics
    const [totalPRs, openPRs, closedPRs, mergedPRs, draftPRs] = await Promise.all([
      PullRequest.count({ where: whereClause }),
      PullRequest.count({ where: { ...whereClause, state: 'open' } }),
      PullRequest.count({ where: { ...whereClause, state: 'closed', merged: false } }),
      PullRequest.count({ where: { ...whereClause, merged: true } }),
      PullRequest.count({ where: { ...whereClause, draft: true } })
    ]);
    
    // Get average metrics
    const avgMetrics = await PullRequest.findAll({
      where: whereClause,
      attributes: [
        [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('additions')), 'avgAdditions'],
        [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('deletions')), 'avgDeletions'],
        [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('changedFiles')), 'avgChangedFiles'],
        [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('reviewsCount')), 'avgReviews'],
        [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('commentsCount')), 'avgComments'],
        [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('timeToMerge')), 'avgTimeToMerge']
      ],
      raw: true
    });
    
    // Get PR size distribution
    const sizeDistribution = await PullRequest.findAll({
      where: whereClause,
      attributes: [
        [PullRequest.sequelize.literal(`
          CASE 
            WHEN additions + deletions <= 10 THEN 'XS'
            WHEN additions + deletions <= 50 THEN 'S'
            WHEN additions + deletions <= 200 THEN 'M'
            WHEN additions + deletions <= 500 THEN 'L'
            ELSE 'XL'
          END
        `), 'size'],
        [PullRequest.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: [PullRequest.sequelize.literal(`
        CASE 
          WHEN additions + deletions <= 10 THEN 'XS'
          WHEN additions + deletions <= 50 THEN 'S'
          WHEN additions + deletions <= 200 THEN 'M'
          WHEN additions + deletions <= 500 THEN 'L'
          ELSE 'XL'
        END
      `)],
      raw: true
    });
    
    // Get top repositories by PR count
    const topRepositories = await PullRequest.findAll({
      where: whereClause,
      include: [{
        model: Repository,
        as: 'repository',
        attributes: ['name', 'fullName']
      }],
      attributes: [
        'repositoryId',
        [PullRequest.sequelize.fn('COUNT', '*'), 'prCount']
      ],
      group: ['repositoryId', 'repository.id'],
      order: [[PullRequest.sequelize.fn('COUNT', '*'), 'DESC']],
      limit: 10,
      raw: false
    });
    
    res.json({
      dateRange: { start, end },
      filters: { repository, author, state },
      statistics: {
        total: totalPRs,
        open: openPRs,
        closed: closedPRs,
        merged: mergedPRs,
        draft: draftPRs,
        mergeRate: totalPRs > 0 ? ((mergedPRs / totalPRs) * 100).toFixed(1) : 0
      },
      averages: {
        additions: parseFloat(avgMetrics[0]?.avgAdditions || 0).toFixed(1),
        deletions: parseFloat(avgMetrics[0]?.avgDeletions || 0).toFixed(1),
        changedFiles: parseFloat(avgMetrics[0]?.avgChangedFiles || 0).toFixed(1),
        reviews: parseFloat(avgMetrics[0]?.avgReviews || 0).toFixed(1),
        comments: parseFloat(avgMetrics[0]?.avgComments || 0).toFixed(1),
        timeToMerge: avgMetrics[0]?.avgTimeToMerge ? 
          moment.duration(avgMetrics[0].avgTimeToMerge, 'minutes').humanize() : 'N/A'
      },
      sizeDistribution: sizeDistribution.map(item => ({
        size: item.size,
        count: parseInt(item.count),
        percentage: totalPRs > 0 ? ((parseInt(item.count) / totalPRs) * 100).toFixed(1) : 0
      })),
      topRepositories: topRepositories.map(item => ({
        repository: item.repository,
        prCount: parseInt(item.dataValues.prCount)
      }))
    });
    
  } catch (error) {
    logger.error('Error fetching PR overview:', error.message);
    res.status(500).json({ error: 'Failed to fetch PR overview' });
  }
});

// GET /api/pull-requests - Get paginated list of pull requests
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      startDate, 
      endDate, 
      repository, 
      author, 
      state, 
      sortBy = 'githubCreatedAt', 
      sortOrder = 'DESC' 
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const start = startDate ? new Date(startDate) : moment().subtract(30, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Build where clause
    const whereClause = {
      githubCreatedAt: { [Op.between]: [start, end] }
    };
    
    if (repository) {
      const repo = await Repository.findOne({ where: { fullName: repository } });
      if (repo) whereClause.repositoryId = repo.id;
    }
    
    if (author) {
      const user = await User.findOne({ where: { username: author } });
      if (user) whereClause.authorId = user.id;
    }
    
    if (state) {
      if (state === 'merged') {
        whereClause.merged = true;
      } else {
        whereClause.state = state;
      }
    }
    
    const { count, rows: pullRequests } = await PullRequest.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['username', 'name', 'avatarUrl']
        },
        {
          model: Repository,
          as: 'repository',
          attributes: ['name', 'fullName', 'language']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['username', 'name', 'avatarUrl'],
          required: false
        }
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: parseInt(limit),
      offset
    });
    
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
      filters: { repository, author, state, startDate, endDate },
      sorting: { sortBy, sortOrder },
      pullRequests: pullRequests.map(pr => ({
        id: pr.id,
        githubId: pr.githubId,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        draft: pr.draft,
        merged: pr.merged,
        htmlUrl: pr.htmlUrl,
        author: pr.author,
        assignee: pr.assignee,
        repository: pr.repository,
        baseBranch: pr.baseBranch,
        headBranch: pr.headBranch,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changedFiles,
        reviewsCount: pr.reviewsCount,
        commentsCount: pr.commentsCount,
        labels: pr.labels,
        createdAt: pr.githubCreatedAt,
        updatedAt: pr.githubUpdatedAt,
        mergedAt: pr.mergedAt,
        closedAt: pr.closedAt,
        timeToMerge: pr.timeToMerge ? moment.duration(pr.timeToMerge, 'minutes').humanize() : null
      }))
    });
    
  } catch (error) {
    logger.error('Error fetching pull requests:', error.message);
    res.status(500).json({ error: 'Failed to fetch pull requests' });
  }
});

// GET /api/pull-requests/:id - Get specific pull request details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const pullRequest = await PullRequest.findByPk(id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['username', 'name', 'avatarUrl', 'email']
        },
        {
          model: Repository,
          as: 'repository',
          attributes: ['name', 'fullName', 'language', 'htmlUrl']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['username', 'name', 'avatarUrl'],
          required: false
        },
        {
          model: User,
          as: 'mergedBy',
          attributes: ['username', 'name', 'avatarUrl'],
          required: false
        }
      ]
    });
    
    if (!pullRequest) {
      return res.status(404).json({ error: 'Pull request not found' });
    }
    
    // Get reviews for this PR
    const reviews = await Review.findAll({
      where: { pullRequestId: pullRequest.id },
      include: [{
        model: User,
        as: 'reviewer',
        attributes: ['username', 'name', 'avatarUrl']
      }],
      order: [['githubSubmittedAt', 'ASC']]
    });
    
    // Get comments for this PR
    const comments = await Comment.findAll({
      where: { pullRequestId: pullRequest.id },
      include: [{
        model: User,
        as: 'author',
        attributes: ['username', 'name', 'avatarUrl']
      }],
      order: [['githubCreatedAt', 'ASC']]
    });
    
    // Get commits for this PR (if available)
    const commits = await Commit.findAll({
      where: { 
        repositoryId: pullRequest.repositoryId,
        // This is a simplified approach - in reality you'd need to track PR-commit relationships
        authorDate: { 
          [Op.between]: [
            moment(pullRequest.githubCreatedAt).subtract(1, 'day').toDate(),
            pullRequest.mergedAt || pullRequest.closedAt || new Date()
          ]
        }
      },
      include: [{
        model: User,
        as: 'author',
        attributes: ['username', 'name', 'avatarUrl']
      }],
      order: [['authorDate', 'ASC']],
      limit: 20
    });
    
    res.json({
      id: pullRequest.id,
      githubId: pullRequest.githubId,
      number: pullRequest.number,
      title: pullRequest.title,
      body: pullRequest.body,
      state: pullRequest.state,
      draft: pullRequest.draft,
      merged: pullRequest.merged,
      locked: pullRequest.locked,
      htmlUrl: pullRequest.htmlUrl,
      diffUrl: pullRequest.diffUrl,
      patchUrl: pullRequest.patchUrl,
      author: pullRequest.author,
      assignee: pullRequest.assignee,
      mergedBy: pullRequest.mergedBy,
      repository: pullRequest.repository,
      baseBranch: pullRequest.baseBranch,
      headBranch: pullRequest.headBranch,
      baseSha: pullRequest.baseSha,
      headSha: pullRequest.headSha,
      mergeCommitSha: pullRequest.mergeCommitSha,
      mergeable: pullRequest.mergeable,
      mergeableState: pullRequest.mergeableState,
      additions: pullRequest.additions,
      deletions: pullRequest.deletions,
      changedFiles: pullRequest.changedFiles,
      labels: pullRequest.labels,
      assignees: pullRequest.assignees,
      requestedReviewers: pullRequest.requestedReviewers,
      requestedTeams: pullRequest.requestedTeams,
      milestone: pullRequest.milestone,
      createdAt: pullRequest.githubCreatedAt,
      updatedAt: pullRequest.githubUpdatedAt,
      mergedAt: pullRequest.mergedAt,
      closedAt: pullRequest.closedAt,
      timeToFirstReview: pullRequest.timeToFirstReview ? 
        moment.duration(pullRequest.timeToFirstReview, 'minutes').humanize() : null,
      timeToMerge: pullRequest.timeToMerge ? 
        moment.duration(pullRequest.timeToMerge, 'minutes').humanize() : null,
      reviewCycles: pullRequest.reviewCycles,
      reviews: reviews.map(review => ({
        id: review.id,
        githubId: review.githubId,
        reviewer: review.reviewer,
        body: review.body,
        state: review.state,
        htmlUrl: review.htmlUrl,
        commitId: review.commitId,
        submittedAt: review.githubSubmittedAt
      })),
      comments: comments.map(comment => ({
        id: comment.id,
        githubId: comment.githubId,
        author: comment.author,
        body: comment.body,
        htmlUrl: comment.htmlUrl,
        type: comment.type,
        path: comment.path,
        line: comment.line,
        reactions: comment.reactions,
        createdAt: comment.githubCreatedAt,
        updatedAt: comment.githubUpdatedAt
      })),
      commits: commits.map(commit => ({
        sha: commit.sha,
        message: commit.message,
        author: commit.author,
        authorDate: commit.authorDate,
        additions: commit.additions,
        deletions: commit.deletions,
        changedFiles: commit.changedFiles
      }))
    });
    
  } catch (error) {
    logger.error('Error fetching pull request details:', error.message);
    res.status(500).json({ error: 'Failed to fetch pull request details' });
  }
});

// GET /api/pull-requests/analytics/lifecycle - Get PR lifecycle analytics
router.get('/analytics/lifecycle', async (req, res) => {
  try {
    const { startDate, endDate, repository } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(90, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    const whereClause = {
      githubCreatedAt: { [Op.between]: [start, end] },
      merged: true,
      timeToMerge: { [Op.not]: null }
    };
    
    if (repository) {
      const repo = await Repository.findOne({ where: { fullName: repository } });
      if (repo) whereClause.repositoryId = repo.id;
    }
    
    // Get lifecycle metrics
    const lifecycleData = await PullRequest.findAll({
      where: whereClause,
      attributes: [
        'timeToMerge',
        'timeToFirstReview',
        'reviewCycles',
        'additions',
        'deletions',
        'changedFiles',
        'reviewsCount',
        'commentsCount'
      ],
      raw: true
    });
    
    if (lifecycleData.length === 0) {
      return res.json({
        dateRange: { start, end },
        message: 'No merged PRs found in the specified date range',
        metrics: null
      });
    }
    
    // Calculate percentiles for time to merge
    const timeToMergeValues = lifecycleData
      .map(pr => pr.timeToMerge)
      .filter(time => time !== null)
      .sort((a, b) => a - b);
    
    const getPercentile = (arr, percentile) => {
      const index = Math.ceil((percentile / 100) * arr.length) - 1;
      return arr[index] || 0;
    };
    
    // Calculate size-based metrics
    const sizeCategories = {
      XS: lifecycleData.filter(pr => (pr.additions + pr.deletions) <= 10),
      S: lifecycleData.filter(pr => (pr.additions + pr.deletions) > 10 && (pr.additions + pr.deletions) <= 50),
      M: lifecycleData.filter(pr => (pr.additions + pr.deletions) > 50 && (pr.additions + pr.deletions) <= 200),
      L: lifecycleData.filter(pr => (pr.additions + pr.deletions) > 200 && (pr.additions + pr.deletions) <= 500),
      XL: lifecycleData.filter(pr => (pr.additions + pr.deletions) > 500)
    };
    
    const sizeMetrics = Object.keys(sizeCategories).map(size => {
      const prs = sizeCategories[size];
      const avgTimeToMerge = prs.length > 0 ? 
        prs.reduce((sum, pr) => sum + pr.timeToMerge, 0) / prs.length : 0;
      
      return {
        size,
        count: prs.length,
        avgTimeToMerge: Math.round(avgTimeToMerge),
        avgTimeToMergeHuman: moment.duration(avgTimeToMerge, 'minutes').humanize()
      };
    });
    
    res.json({
      dateRange: { start, end },
      totalMergedPRs: lifecycleData.length,
      timeToMerge: {
        p50: Math.round(getPercentile(timeToMergeValues, 50)),
        p75: Math.round(getPercentile(timeToMergeValues, 75)),
        p90: Math.round(getPercentile(timeToMergeValues, 90)),
        p95: Math.round(getPercentile(timeToMergeValues, 95)),
        average: Math.round(timeToMergeValues.reduce((a, b) => a + b, 0) / timeToMergeValues.length),
        humanized: {
          p50: moment.duration(getPercentile(timeToMergeValues, 50), 'minutes').humanize(),
          p75: moment.duration(getPercentile(timeToMergeValues, 75), 'minutes').humanize(),
          p90: moment.duration(getPercentile(timeToMergeValues, 90), 'minutes').humanize(),
          p95: moment.duration(getPercentile(timeToMergeValues, 95), 'minutes').humanize(),
          average: moment.duration(timeToMergeValues.reduce((a, b) => a + b, 0) / timeToMergeValues.length, 'minutes').humanize()
        }
      },
      sizeMetrics,
      reviewMetrics: {
        avgReviewsPerPR: (lifecycleData.reduce((sum, pr) => sum + pr.reviewsCount, 0) / lifecycleData.length).toFixed(1),
        avgCommentsPerPR: (lifecycleData.reduce((sum, pr) => sum + pr.commentsCount, 0) / lifecycleData.length).toFixed(1),
        avgReviewCycles: (lifecycleData.reduce((sum, pr) => sum + pr.reviewCycles, 0) / lifecycleData.length).toFixed(1)
      }
    });
    
  } catch (error) {
    logger.error('Error fetching PR lifecycle analytics:', error.message);
    res.status(500).json({ error: 'Failed to fetch PR lifecycle analytics' });
  }
});

// GET /api/pull-requests/analytics/stale - Get stale PR analysis
router.get('/analytics/stale', async (req, res) => {
  try {
    const { threshold = 7 } = req.query; // Days threshold for considering PR stale
    
    const thresholdDate = moment().subtract(parseInt(threshold), 'days').toDate();
    
    const stalePRs = await PullRequest.findAll({
      where: {
        state: 'open',
        githubUpdatedAt: { [Op.lt]: thresholdDate }
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['username', 'name', 'avatarUrl']
        },
        {
          model: Repository,
          as: 'repository',
          attributes: ['name', 'fullName']
        }
      ],
      order: [['githubUpdatedAt', 'ASC']]
    });
    
    // Calculate staleness metrics
    const staleMetrics = stalePRs.map(pr => {
      const daysSinceUpdate = moment().diff(moment(pr.githubUpdatedAt), 'days');
      const daysSinceCreation = moment().diff(moment(pr.githubCreatedAt), 'days');
      
      return {
        ...pr.toJSON(),
        daysSinceUpdate,
        daysSinceCreation,
        staleness: daysSinceUpdate > 30 ? 'critical' : daysSinceUpdate > 14 ? 'high' : 'medium'
      };
    });
    
    // Group by staleness level
    const stalenessBuckets = {
      critical: staleMetrics.filter(pr => pr.staleness === 'critical'),
      high: staleMetrics.filter(pr => pr.staleness === 'high'),
      medium: staleMetrics.filter(pr => pr.staleness === 'medium')
    };
    
    res.json({
      threshold: parseInt(threshold),
      totalStale: stalePRs.length,
      stalenessBuckets: {
        critical: {
          count: stalenessBuckets.critical.length,
          prs: stalenessBuckets.critical.slice(0, 10) // Limit to top 10
        },
        high: {
          count: stalenessBuckets.high.length,
          prs: stalenessBuckets.high.slice(0, 10)
        },
        medium: {
          count: stalenessBuckets.medium.length,
          prs: stalenessBuckets.medium.slice(0, 10)
        }
      },
      oldestPRs: staleMetrics.slice(0, 10)
    });
    
  } catch (error) {
    logger.error('Error fetching stale PR analysis:', error.message);
    res.status(500).json({ error: 'Failed to fetch stale PR analysis' });
  }
});

module.exports = router;