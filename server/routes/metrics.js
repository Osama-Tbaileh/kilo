const express = require('express');
const { Op } = require('sequelize');
const { Metric, User, Repository, TeamMember } = require('../models');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// GET /api/metrics/overview - Get metrics overview
router.get('/overview', async (req, res) => {
  try {
    const { startDate, endDate, metricType = 'daily' } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(30, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Get latest metrics for all users
    const userMetrics = await Metric.findAll({
      where: {
        metricType,
        period: { [Op.between]: [start, end] },
        userId: { [Op.not]: null }
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['username', 'name', 'avatarUrl'],
        include: [{
          model: TeamMember,
          as: 'teamMember',
          attributes: ['role', 'team']
        }]
      }],
      order: [['period', 'DESC'], ['pullRequestsOpened', 'DESC']]
    });
    
    // Get repository metrics
    const repoMetrics = await Metric.findAll({
      where: {
        metricType,
        period: { [Op.between]: [start, end] },
        repositoryId: { [Op.not]: null }
      },
      include: [{
        model: Repository,
        as: 'repository',
        attributes: ['name', 'fullName', 'language']
      }],
      order: [['period', 'DESC'], ['pullRequestsOpened', 'DESC']]
    });
    
    // Calculate aggregated metrics
    const aggregatedMetrics = userMetrics.reduce((acc, metric) => {
      acc.totalPRs += metric.pullRequestsOpened || 0;
      acc.totalMerged += metric.pullRequestsMerged || 0;
      acc.totalReviews += metric.reviewsGiven || 0;
      acc.totalComments += metric.commentsGiven || 0;
      acc.totalCommits += metric.commitsCount || 0;
      acc.totalLinesAdded += metric.linesAdded || 0;
      acc.totalLinesDeleted += metric.linesDeleted || 0;
      return acc;
    }, {
      totalPRs: 0,
      totalMerged: 0,
      totalReviews: 0,
      totalComments: 0,
      totalCommits: 0,
      totalLinesAdded: 0,
      totalLinesDeleted: 0
    });
    
    // Get top performers
    const topPerformers = {
      byPRs: userMetrics
        .sort((a, b) => (b.pullRequestsOpened || 0) - (a.pullRequestsOpened || 0))
        .slice(0, 10),
      byReviews: userMetrics
        .sort((a, b) => (b.reviewsGiven || 0) - (a.reviewsGiven || 0))
        .slice(0, 10),
      byCommits: userMetrics
        .sort((a, b) => (b.commitsCount || 0) - (a.commitsCount || 0))
        .slice(0, 10)
    };
    
    res.json({
      dateRange: { start, end },
      metricType,
      aggregated: aggregatedMetrics,
      topPerformers,
      totalUsers: userMetrics.length,
      totalRepositories: repoMetrics.length
    });
    
  } catch (error) {
    logger.error('Error fetching metrics overview:', error.message);
    res.status(500).json({ error: 'Failed to fetch metrics overview' });
  }
});

// GET /api/metrics/trends - Get metrics trends over time
router.get('/trends', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      metricType = 'daily', 
      metric = 'pullRequestsOpened',
      userId,
      repositoryId 
    } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(90, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Build where clause
    const whereClause = {
      metricType,
      period: { [Op.between]: [start, end] }
    };
    
    if (userId) whereClause.userId = userId;
    if (repositoryId) whereClause.repositoryId = repositoryId;
    
    const metrics = await Metric.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['username', 'name', 'avatarUrl'],
          required: false
        },
        {
          model: Repository,
          as: 'repository',
          attributes: ['name', 'fullName'],
          required: false
        }
      ],
      order: [['period', 'ASC']]
    });
    
    // Group by period and calculate trends
    const trendData = {};
    metrics.forEach(m => {
      const periodKey = moment(m.period).format('YYYY-MM-DD');
      if (!trendData[periodKey]) {
        trendData[periodKey] = {
          period: periodKey,
          date: m.period,
          pullRequestsOpened: 0,
          pullRequestsMerged: 0,
          reviewsGiven: 0,
          commentsGiven: 0,
          commitsCount: 0,
          linesAdded: 0,
          linesDeleted: 0
        };
      }
      
      trendData[periodKey].pullRequestsOpened += m.pullRequestsOpened || 0;
      trendData[periodKey].pullRequestsMerged += m.pullRequestsMerged || 0;
      trendData[periodKey].reviewsGiven += m.reviewsGiven || 0;
      trendData[periodKey].commentsGiven += m.commentsGiven || 0;
      trendData[periodKey].commitsCount += m.commitsCount || 0;
      trendData[periodKey].linesAdded += m.linesAdded || 0;
      trendData[periodKey].linesDeleted += m.linesDeleted || 0;
    });
    
    const trends = Object.values(trendData).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    // Calculate moving averages
    const movingAverageWindow = 7; // 7-day moving average
    const trendsWithMA = trends.map((item, index) => {
      const start = Math.max(0, index - movingAverageWindow + 1);
      const window = trends.slice(start, index + 1);
      
      const movingAverage = window.reduce((sum, w) => sum + w[metric], 0) / window.length;
      
      return {
        ...item,
        movingAverage: parseFloat(movingAverage.toFixed(2))
      };
    });
    
    res.json({
      dateRange: { start, end },
      metricType,
      metric,
      filters: { userId, repositoryId },
      trends: trendsWithMA,
      summary: {
        totalPeriods: trends.length,
        average: trends.length > 0 ? 
          (trends.reduce((sum, t) => sum + t[metric], 0) / trends.length).toFixed(2) : 0,
        peak: trends.length > 0 ? Math.max(...trends.map(t => t[metric])) : 0,
        total: trends.reduce((sum, t) => sum + t[metric], 0)
      }
    });
    
  } catch (error) {
    logger.error('Error fetching metrics trends:', error.message);
    res.status(500).json({ error: 'Failed to fetch metrics trends' });
  }
});

// GET /api/metrics/leaderboard - Get team leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      metricType = 'monthly',
      sortBy = 'pullRequestsOpened',
      limit = 20 
    } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(30, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Get latest metrics for each user in the period
    const userMetrics = await Metric.findAll({
      where: {
        metricType,
        period: { [Op.between]: [start, end] },
        userId: { [Op.not]: null }
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['username', 'name', 'avatarUrl'],
        include: [{
          model: TeamMember,
          as: 'teamMember',
          attributes: ['role', 'team', 'seniority']
        }]
      }],
      attributes: [
        'userId',
        [Metric.sequelize.fn('SUM', Metric.sequelize.col('pullRequestsOpened')), 'totalPRs'],
        [Metric.sequelize.fn('SUM', Metric.sequelize.col('pullRequestsMerged')), 'totalMerged'],
        [Metric.sequelize.fn('SUM', Metric.sequelize.col('reviewsGiven')), 'totalReviews'],
        [Metric.sequelize.fn('SUM', Metric.sequelize.col('commentsGiven')), 'totalComments'],
        [Metric.sequelize.fn('SUM', Metric.sequelize.col('commitsCount')), 'totalCommits'],
        [Metric.sequelize.fn('SUM', Metric.sequelize.col('linesAdded')), 'totalLinesAdded'],
        [Metric.sequelize.fn('SUM', Metric.sequelize.col('linesDeleted')), 'totalLinesDeleted'],
        [Metric.sequelize.fn('AVG', Metric.sequelize.col('productivityScore')), 'avgProductivity'],
        [Metric.sequelize.fn('AVG', Metric.sequelize.col('qualityScore')), 'avgQuality'],
        [Metric.sequelize.fn('AVG', Metric.sequelize.col('collaborationScore')), 'avgCollaboration']
      ],
      group: ['userId', 'user.id', 'user.teamMember.id'],
      raw: false
    });
    
    // Calculate additional metrics
    const leaderboard = userMetrics.map((metric, index) => {
      const totalPRs = parseInt(metric.dataValues.totalPRs || 0);
      const totalMerged = parseInt(metric.dataValues.totalMerged || 0);
      const totalReviews = parseInt(metric.dataValues.totalReviews || 0);
      const totalComments = parseInt(metric.dataValues.totalComments || 0);
      const totalCommits = parseInt(metric.dataValues.totalCommits || 0);
      const totalLinesAdded = parseInt(metric.dataValues.totalLinesAdded || 0);
      const totalLinesDeleted = parseInt(metric.dataValues.totalLinesDeleted || 0);
      
      return {
        rank: index + 1,
        user: metric.user,
        metrics: {
          pullRequests: {
            opened: totalPRs,
            merged: totalMerged,
            mergeRate: totalPRs > 0 ? ((totalMerged / totalPRs) * 100).toFixed(1) : 0
          },
          reviews: {
            given: totalReviews
          },
          comments: {
            given: totalComments
          },
          commits: {
            total: totalCommits
          },
          codeMetrics: {
            linesAdded: totalLinesAdded,
            linesDeleted: totalLinesDeleted,
            netLines: totalLinesAdded - totalLinesDeleted
          },
          scores: {
            productivity: parseFloat(metric.dataValues.avgProductivity || 0).toFixed(1),
            quality: parseFloat(metric.dataValues.avgQuality || 0).toFixed(1),
            collaboration: parseFloat(metric.dataValues.avgCollaboration || 0).toFixed(1)
          }
        },
        sortValue: metric.dataValues[sortBy] || 0
      };
    });
    
    // Sort by the requested metric
    leaderboard.sort((a, b) => {
      const aValue = a.sortValue || 0;
      const bValue = b.sortValue || 0;
      return bValue - aValue;
    });
    
    // Update ranks after sorting
    leaderboard.forEach((item, index) => {
      item.rank = index + 1;
    });
    
    res.json({
      dateRange: { start, end },
      metricType,
      sortBy,
      totalParticipants: leaderboard.length,
      leaderboard: leaderboard.slice(0, parseInt(limit))
    });
    
  } catch (error) {
    logger.error('Error fetching leaderboard:', error.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /api/metrics/comparison - Compare metrics between users or time periods
router.get('/comparison', async (req, res) => {
  try {
    const { 
      userIds, 
      startDate, 
      endDate, 
      compareWith,
      metricType = 'monthly' 
    } = req.query;
    
    if (!userIds) {
      return res.status(400).json({ error: 'userIds parameter is required' });
    }
    
    const userIdArray = userIds.split(',').map(id => parseInt(id));
    const start = startDate ? new Date(startDate) : moment().subtract(90, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Get metrics for specified users
    const userMetrics = await Metric.findAll({
      where: {
        metricType,
        period: { [Op.between]: [start, end] },
        userId: { [Op.in]: userIdArray }
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['username', 'name', 'avatarUrl']
      }],
      order: [['period', 'ASC']]
    });
    
    // Group metrics by user
    const userComparison = {};
    userMetrics.forEach(metric => {
      const userId = metric.userId;
      if (!userComparison[userId]) {
        userComparison[userId] = {
          user: metric.user,
          periods: [],
          totals: {
            pullRequestsOpened: 0,
            pullRequestsMerged: 0,
            reviewsGiven: 0,
            commentsGiven: 0,
            commitsCount: 0,
            linesAdded: 0,
            linesDeleted: 0
          }
        };
      }
      
      userComparison[userId].periods.push({
        period: metric.period,
        pullRequestsOpened: metric.pullRequestsOpened || 0,
        pullRequestsMerged: metric.pullRequestsMerged || 0,
        reviewsGiven: metric.reviewsGiven || 0,
        commentsGiven: metric.commentsGiven || 0,
        commitsCount: metric.commitsCount || 0,
        linesAdded: metric.linesAdded || 0,
        linesDeleted: metric.linesDeleted || 0,
        productivityScore: metric.productivityScore,
        qualityScore: metric.qualityScore,
        collaborationScore: metric.collaborationScore
      });
      
      // Add to totals
      userComparison[userId].totals.pullRequestsOpened += metric.pullRequestsOpened || 0;
      userComparison[userId].totals.pullRequestsMerged += metric.pullRequestsMerged || 0;
      userComparison[userId].totals.reviewsGiven += metric.reviewsGiven || 0;
      userComparison[userId].totals.commentsGiven += metric.commentsGiven || 0;
      userComparison[userId].totals.commitsCount += metric.commitsCount || 0;
      userComparison[userId].totals.linesAdded += metric.linesAdded || 0;
      userComparison[userId].totals.linesDeleted += metric.linesDeleted || 0;
    });
    
    // Calculate averages and rankings
    const comparison = Object.values(userComparison).map(userData => {
      const periodCount = userData.periods.length;
      
      return {
        user: userData.user,
        totals: userData.totals,
        averages: {
          pullRequestsOpened: periodCount > 0 ? (userData.totals.pullRequestsOpened / periodCount).toFixed(1) : 0,
          pullRequestsMerged: periodCount > 0 ? (userData.totals.pullRequestsMerged / periodCount).toFixed(1) : 0,
          reviewsGiven: periodCount > 0 ? (userData.totals.reviewsGiven / periodCount).toFixed(1) : 0,
          commentsGiven: periodCount > 0 ? (userData.totals.commentsGiven / periodCount).toFixed(1) : 0,
          commitsCount: periodCount > 0 ? (userData.totals.commitsCount / periodCount).toFixed(1) : 0
        },
        periods: userData.periods,
        periodCount
      };
    });
    
    res.json({
      dateRange: { start, end },
      metricType,
      userIds: userIdArray,
      comparison
    });
    
  } catch (error) {
    logger.error('Error fetching metrics comparison:', error.message);
    res.status(500).json({ error: 'Failed to fetch metrics comparison' });
  }
});

// POST /api/metrics/calculate - Trigger metrics calculation
router.post('/calculate', async (req, res) => {
  try {
    const { metricType = 'daily', startDate, endDate, userId, repositoryId } = req.body;
    
    // This would trigger the metrics calculation service
    // For now, we'll return a placeholder response
    logger.info('Metrics calculation requested', { metricType, startDate, endDate, userId, repositoryId });
    
    res.json({
      message: 'Metrics calculation initiated',
      parameters: { metricType, startDate, endDate, userId, repositoryId },
      status: 'queued'
    });
    
  } catch (error) {
    logger.error('Error initiating metrics calculation:', error.message);
    res.status(500).json({ error: 'Failed to initiate metrics calculation' });
  }
});

// GET /api/metrics/export - Export metrics data
router.get('/export', async (req, res) => {
  try {
    const { 
      format = 'json', 
      startDate, 
      endDate, 
      metricType = 'daily',
      userId,
      repositoryId 
    } = req.query;
    
    const start = startDate ? new Date(startDate) : moment().subtract(30, 'days').toDate();
    const end = endDate ? new Date(endDate) : new Date();
    
    // Build where clause
    const whereClause = {
      metricType,
      period: { [Op.between]: [start, end] }
    };
    
    if (userId) whereClause.userId = userId;
    if (repositoryId) whereClause.repositoryId = repositoryId;
    
    const metrics = await Metric.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['username', 'name'],
          required: false
        },
        {
          model: Repository,
          as: 'repository',
          attributes: ['name', 'fullName'],
          required: false
        }
      ],
      order: [['period', 'ASC']]
    });
    
    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = [
        'Period', 'User', 'Repository', 'PRs Opened', 'PRs Merged', 'Reviews Given',
        'Comments Given', 'Commits', 'Lines Added', 'Lines Deleted', 'Productivity Score'
      ];
      
      const csvRows = metrics.map(metric => [
        moment(metric.period).format('YYYY-MM-DD'),
        metric.user?.username || '',
        metric.repository?.fullName || '',
        metric.pullRequestsOpened || 0,
        metric.pullRequestsMerged || 0,
        metric.reviewsGiven || 0,
        metric.commentsGiven || 0,
        metric.commitsCount || 0,
        metric.linesAdded || 0,
        metric.linesDeleted || 0,
        metric.productivityScore || 0
      ]);
      
      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="metrics-${moment().format('YYYY-MM-DD')}.csv"`);
      res.send(csvContent);
    } else {
      // Return JSON format
      res.json({
        dateRange: { start, end },
        metricType,
        filters: { userId, repositoryId },
        totalRecords: metrics.length,
        metrics: metrics.map(metric => ({
          period: metric.period,
          user: metric.user,
          repository: metric.repository,
          pullRequestsOpened: metric.pullRequestsOpened,
          pullRequestsMerged: metric.pullRequestsMerged,
          reviewsGiven: metric.reviewsGiven,
          commentsGiven: metric.commentsGiven,
          commitsCount: metric.commitsCount,
          linesAdded: metric.linesAdded,
          linesDeleted: metric.linesDeleted,
          productivityScore: metric.productivityScore,
          qualityScore: metric.qualityScore,
          collaborationScore: metric.collaborationScore
        }))
      });
    }
    
  } catch (error) {
    logger.error('Error exporting metrics:', error.message);
    res.status(500).json({ error: 'Failed to export metrics' });
  }
});

module.exports = router;