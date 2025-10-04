const { Op } = require('sequelize');
const { User, Repository, PullRequest, Review, Comment, Commit, Metric, TeamMember } = require('../../models');
const logger = require('../../utils/logger');
const moment = require('moment');

class MetricsCalculationService {
  constructor() {
    this.calculationInProgress = false;
  }

  // Main method to calculate all metrics
  async calculateMetrics(options = {}) {
    if (this.calculationInProgress) {
      logger.warn('Metrics calculation already in progress');
      return { success: false, message: 'Calculation already in progress' };
    }

    this.calculationInProgress = true;
    const startTime = Date.now();

    try {
      logger.info('Starting metrics calculation...');

      const {
        metricType = 'daily',
        startDate,
        endDate,
        userId,
        repositoryId,
        recalculate = false
      } = options;

      const start = startDate ? new Date(startDate) : this.getDefaultStartDate(metricType);
      const end = endDate ? new Date(endDate) : new Date();

      const results = {
        userMetrics: 0,
        repositoryMetrics: 0,
        teamMetrics: 0,
        errors: []
      };

      // Calculate user metrics
      if (!repositoryId) {
        try {
          results.userMetrics = await this.calculateUserMetrics(metricType, start, end, userId, recalculate);
          logger.info(`Calculated ${results.userMetrics} user metrics`);
        } catch (error) {
          logger.error('Error calculating user metrics:', error.message);
          results.errors.push(`User metrics: ${error.message}`);
        }
      }

      // Calculate repository metrics
      if (!userId) {
        try {
          results.repositoryMetrics = await this.calculateRepositoryMetrics(metricType, start, end, repositoryId, recalculate);
          logger.info(`Calculated ${results.repositoryMetrics} repository metrics`);
        } catch (error) {
          logger.error('Error calculating repository metrics:', error.message);
          results.errors.push(`Repository metrics: ${error.message}`);
        }
      }

      // Calculate team-wide metrics
      if (!userId && !repositoryId) {
        try {
          results.teamMetrics = await this.calculateTeamMetrics(metricType, start, end, recalculate);
          logger.info(`Calculated ${results.teamMetrics} team metrics`);
        } catch (error) {
          logger.error('Error calculating team metrics:', error.message);
          results.errors.push(`Team metrics: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`Metrics calculation completed in ${duration}ms`, results);

      return {
        success: true,
        duration,
        results,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Metrics calculation failed:', error.message);
      throw error;
    } finally {
      this.calculationInProgress = false;
    }
  }

  // Calculate metrics for individual users
  async calculateUserMetrics(metricType, startDate, endDate, userId = null, recalculate = false) {
    logger.info('Calculating user metrics...', { metricType, startDate, endDate, userId });

    const users = userId ? 
      await User.findAll({ where: { id: userId, isActive: true } }) :
      await User.findAll({ where: { isActive: true } });

    let totalCalculated = 0;
    const periods = this.generatePeriods(metricType, startDate, endDate);

    for (const user of users) {
      for (const period of periods) {
        try {
          const periodStart = period.start;
          const periodEnd = period.end;

          // Check if metric already exists
          if (!recalculate) {
            const existingMetric = await Metric.findOne({
              where: {
                userId: user.id,
                metricType,
                period: period.date
              }
            });

            if (existingMetric) {
              continue; // Skip if already calculated
            }
          }

          // Calculate metrics for this user and period
          const metrics = await this.calculateUserPeriodMetrics(user.id, periodStart, periodEnd);

          // Calculate scores
          const scores = this.calculateUserScores(metrics);

          // Upsert metric record
          await Metric.upsert({
            userId: user.id,
            repositoryId: null,
            metricType,
            metricName: 'user_activity',
            period: period.date,
            ...metrics,
            ...scores,
            calculatedAt: new Date(),
            dataPoints: this.countDataPoints(metrics),
            confidence: this.calculateConfidence(metrics)
          });

          totalCalculated++;

        } catch (error) {
          logger.error(`Error calculating metrics for user ${user.username} period ${period.date}:`, error.message);
        }
      }
    }

    return totalCalculated;
  }

  // Calculate metrics for individual repositories
  async calculateRepositoryMetrics(metricType, startDate, endDate, repositoryId = null, recalculate = false) {
    logger.info('Calculating repository metrics...', { metricType, startDate, endDate, repositoryId });

    const repositories = repositoryId ? 
      await Repository.findAll({ where: { id: repositoryId, isActive: true } }) :
      await Repository.findAll({ where: { isActive: true } });

    let totalCalculated = 0;
    const periods = this.generatePeriods(metricType, startDate, endDate);

    for (const repository of repositories) {
      for (const period of periods) {
        try {
          const periodStart = period.start;
          const periodEnd = period.end;

          // Check if metric already exists
          if (!recalculate) {
            const existingMetric = await Metric.findOne({
              where: {
                repositoryId: repository.id,
                metricType,
                period: period.date
              }
            });

            if (existingMetric) {
              continue; // Skip if already calculated
            }
          }

          // Calculate metrics for this repository and period
          const metrics = await this.calculateRepositoryPeriodMetrics(repository.id, periodStart, periodEnd);

          // Calculate scores
          const scores = this.calculateRepositoryScores(metrics);

          // Upsert metric record
          await Metric.upsert({
            userId: null,
            repositoryId: repository.id,
            metricType,
            metricName: 'repository_activity',
            period: period.date,
            ...metrics,
            ...scores,
            calculatedAt: new Date(),
            dataPoints: this.countDataPoints(metrics),
            confidence: this.calculateConfidence(metrics)
          });

          totalCalculated++;

        } catch (error) {
          logger.error(`Error calculating metrics for repository ${repository.fullName} period ${period.date}:`, error.message);
        }
      }
    }

    return totalCalculated;
  }

  // Calculate team-wide aggregated metrics
  async calculateTeamMetrics(metricType, startDate, endDate, recalculate = false) {
    logger.info('Calculating team metrics...', { metricType, startDate, endDate });

    let totalCalculated = 0;
    const periods = this.generatePeriods(metricType, startDate, endDate);

    for (const period of periods) {
      try {
        const periodStart = period.start;
        const periodEnd = period.end;

        // Check if metric already exists
        if (!recalculate) {
          const existingMetric = await Metric.findOne({
            where: {
              userId: null,
              repositoryId: null,
              metricType,
              metricName: 'team_aggregate',
              period: period.date
            }
          });

          if (existingMetric) {
            continue; // Skip if already calculated
          }
        }

        // Calculate aggregated team metrics for this period
        const metrics = await this.calculateTeamPeriodMetrics(periodStart, periodEnd);

        // Calculate team scores
        const scores = this.calculateTeamScores(metrics);

        // Upsert metric record
        await Metric.upsert({
          userId: null,
          repositoryId: null,
          metricType,
          metricName: 'team_aggregate',
          period: period.date,
          ...metrics,
          ...scores,
          calculatedAt: new Date(),
          dataPoints: this.countDataPoints(metrics),
          confidence: this.calculateConfidence(metrics)
        });

        totalCalculated++;

      } catch (error) {
        logger.error(`Error calculating team metrics for period ${period.date}:`, error.message);
      }
    }

    return totalCalculated;
  }

  // Calculate metrics for a specific user and time period
  async calculateUserPeriodMetrics(userId, startDate, endDate) {
    const [
      prStats,
      reviewStats,
      commentStats,
      commitStats,
      collaborationStats
    ] = await Promise.all([
      // Pull Request statistics
      this.calculateUserPRStats(userId, startDate, endDate),
      
      // Review statistics
      this.calculateUserReviewStats(userId, startDate, endDate),
      
      // Comment statistics
      this.calculateUserCommentStats(userId, startDate, endDate),
      
      // Commit statistics
      this.calculateUserCommitStats(userId, startDate, endDate),
      
      // Collaboration statistics
      this.calculateUserCollaborationStats(userId, startDate, endDate)
    ]);

    return {
      // PR metrics
      pullRequestsOpened: prStats.opened,
      pullRequestsClosed: prStats.closed,
      pullRequestsMerged: prStats.merged,
      
      // Review metrics
      reviewsGiven: reviewStats.given,
      reviewsReceived: reviewStats.received,
      
      // Comment metrics
      commentsGiven: commentStats.given,
      commentsReceived: commentStats.received,
      
      // Commit metrics
      commitsCount: commitStats.count,
      linesAdded: commitStats.linesAdded + prStats.linesAdded,
      linesDeleted: commitStats.linesDeleted + prStats.linesDeleted,
      filesChanged: commitStats.filesChanged + prStats.filesChanged,
      
      // Time-based metrics
      avgTimeToFirstReview: prStats.avgTimeToFirstReview,
      avgTimeToMerge: prStats.avgTimeToMerge,
      avgReviewTime: reviewStats.avgReviewTime,
      
      // Quality metrics
      avgReviewsPerPR: prStats.avgReviewsPerPR,
      avgCommentsPerPR: prStats.avgCommentsPerPR,
      avgCommentsPerReview: reviewStats.avgCommentsPerReview,
      mergeRate: prStats.mergeRate,
      approvalRate: reviewStats.approvalRate,
      
      // Collaboration metrics
      uniqueCollaborators: collaborationStats.uniqueCollaborators,
      crossRepoActivity: collaborationStats.crossRepoActivity
    };
  }

  // Calculate PR statistics for a user
  async calculateUserPRStats(userId, startDate, endDate) {
    const prs = await PullRequest.findAll({
      where: {
        authorId: userId,
        githubCreatedAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'state', 'merged', 'additions', 'deletions', 'changedFiles',
        'timeToFirstReview', 'timeToMerge', 'reviewsCount', 'commentsCount'
      ]
    });

    const opened = prs.length;
    const merged = prs.filter(pr => pr.merged).length;
    const closed = prs.filter(pr => pr.state === 'closed' && !pr.merged).length;

    const linesAdded = prs.reduce((sum, pr) => sum + (pr.additions || 0), 0);
    const linesDeleted = prs.reduce((sum, pr) => sum + (pr.deletions || 0), 0);
    const filesChanged = prs.reduce((sum, pr) => sum + (pr.changedFiles || 0), 0);

    const timeToFirstReviews = prs.filter(pr => pr.timeToFirstReview).map(pr => pr.timeToFirstReview);
    const timeToMerges = prs.filter(pr => pr.timeToMerge).map(pr => pr.timeToMerge);

    const avgTimeToFirstReview = timeToFirstReviews.length > 0 ?
      timeToFirstReviews.reduce((sum, time) => sum + time, 0) / timeToFirstReviews.length : null;

    const avgTimeToMerge = timeToMerges.length > 0 ?
      timeToMerges.reduce((sum, time) => sum + time, 0) / timeToMerges.length : null;

    const totalReviews = prs.reduce((sum, pr) => sum + (pr.reviewsCount || 0), 0);
    const totalComments = prs.reduce((sum, pr) => sum + (pr.commentsCount || 0), 0);

    return {
      opened,
      merged,
      closed,
      linesAdded,
      linesDeleted,
      filesChanged,
      avgTimeToFirstReview,
      avgTimeToMerge,
      avgReviewsPerPR: opened > 0 ? totalReviews / opened : 0,
      avgCommentsPerPR: opened > 0 ? totalComments / opened : 0,
      mergeRate: opened > 0 ? (merged / opened) * 100 : 0
    };
  }

  // Calculate review statistics for a user
  async calculateUserReviewStats(userId, startDate, endDate) {
    const [reviewsGiven, reviewsReceived] = await Promise.all([
      Review.findAll({
        where: {
          reviewerId: userId,
          githubSubmittedAt: { [Op.between]: [startDate, endDate] }
        },
        attributes: ['state', 'commentsCount']
      }),

      Review.count({
        where: {
          githubSubmittedAt: { [Op.between]: [startDate, endDate] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          where: { authorId: userId },
          attributes: []
        }]
      })
    ]);

    const given = reviewsGiven.length;
    const received = reviewsReceived;
    const approved = reviewsGiven.filter(r => r.state === 'APPROVED').length;
    const totalComments = reviewsGiven.reduce((sum, r) => sum + (r.commentsCount || 0), 0);

    return {
      given,
      received,
      avgCommentsPerReview: given > 0 ? totalComments / given : 0,
      approvalRate: given > 0 ? (approved / given) * 100 : 0,
      avgReviewTime: null // Would need additional tracking
    };
  }

  // Calculate comment statistics for a user
  async calculateUserCommentStats(userId, startDate, endDate) {
    const [commentsGiven, commentsReceived] = await Promise.all([
      Comment.count({
        where: {
          authorId: userId,
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        }
      }),

      Comment.count({
        where: {
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          where: { authorId: userId },
          attributes: []
        }]
      })
    ]);

    return {
      given: commentsGiven,
      received: commentsReceived
    };
  }

  // Calculate commit statistics for a user
  async calculateUserCommitStats(userId, startDate, endDate) {
    const commits = await Commit.findAll({
      where: {
        authorId: userId,
        authorDate: { [Op.between]: [startDate, endDate] }
      },
      attributes: ['additions', 'deletions', 'changedFiles']
    });

    return {
      count: commits.length,
      linesAdded: commits.reduce((sum, c) => sum + (c.additions || 0), 0),
      linesDeleted: commits.reduce((sum, c) => sum + (c.deletions || 0), 0),
      filesChanged: commits.reduce((sum, c) => sum + (c.changedFiles || 0), 0)
    };
  }

  // Calculate collaboration statistics for a user
  async calculateUserCollaborationStats(userId, startDate, endDate) {
    const [uniqueReviewers, uniqueReviewees, uniqueRepos] = await Promise.all([
      Review.findAll({
        where: {
          githubSubmittedAt: { [Op.between]: [startDate, endDate] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          where: { authorId: userId },
          attributes: []
        }],
        attributes: ['reviewerId'],
        group: ['reviewerId']
      }),

      Review.findAll({
        where: {
          reviewerId: userId,
          githubSubmittedAt: { [Op.between]: [startDate, endDate] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          attributes: ['authorId']
        }],
        attributes: [],
        group: ['pullRequest.authorId']
      }),

      PullRequest.findAll({
        where: {
          authorId: userId,
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        },
        attributes: ['repositoryId'],
        group: ['repositoryId']
      })
    ]);

    return {
      uniqueCollaborators: new Set([
        ...uniqueReviewers.map(r => r.reviewerId),
        ...uniqueReviewees.map(r => r.pullRequest.authorId)
      ]).size,
      crossRepoActivity: uniqueRepos.length
    };
  }

  // Calculate repository metrics for a specific period
  async calculateRepositoryPeriodMetrics(repositoryId, startDate, endDate) {
    const [prCount, commitCount, uniqueContributors, avgPRSize] = await Promise.all([
      PullRequest.count({
        where: {
          repositoryId,
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        }
      }),

      Commit.count({
        where: {
          repositoryId,
          authorDate: { [Op.between]: [startDate, endDate] }
        }
      }),

      PullRequest.findAll({
        where: {
          repositoryId,
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        },
        attributes: ['authorId'],
        group: ['authorId']
      }),

      PullRequest.findAll({
        where: {
          repositoryId,
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        },
        attributes: [
          [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('additions')), 'avgAdditions'],
          [PullRequest.sequelize.fn('AVG', PullRequest.sequelize.col('deletions')), 'avgDeletions']
        ],
        raw: true
      })
    ]);

    return {
      pullRequestsOpened: prCount,
      commitsCount: commitCount,
      uniqueCollaborators: uniqueContributors.length,
      avgPRSize: avgPRSize[0] ? 
        (parseFloat(avgPRSize[0].avgAdditions || 0) + parseFloat(avgPRSize[0].avgDeletions || 0)) : 0
    };
  }

  // Calculate team-wide metrics for a specific period
  async calculateTeamPeriodMetrics(startDate, endDate) {
    const [
      totalPRs,
      totalCommits,
      totalReviews,
      totalComments,
      activeUsers,
      activeRepos
    ] = await Promise.all([
      PullRequest.count({
        where: { githubCreatedAt: { [Op.between]: [startDate, endDate] } }
      }),

      Commit.count({
        where: { authorDate: { [Op.between]: [startDate, endDate] } }
      }),

      Review.count({
        where: { githubSubmittedAt: { [Op.between]: [startDate, endDate] } }
      }),

      Comment.count({
        where: { githubCreatedAt: { [Op.between]: [startDate, endDate] } }
      }),

      PullRequest.findAll({
        where: { githubCreatedAt: { [Op.between]: [startDate, endDate] } },
        attributes: ['authorId'],
        group: ['authorId']
      }),

      PullRequest.findAll({
        where: { githubCreatedAt: { [Op.between]: [startDate, endDate] } },
        attributes: ['repositoryId'],
        group: ['repositoryId']
      })
    ]);

    return {
      pullRequestsOpened: totalPRs,
      commitsCount: totalCommits,
      reviewsGiven: totalReviews,
      commentsGiven: totalComments,
      uniqueCollaborators: activeUsers.length,
      crossRepoActivity: activeRepos.length
    };
  }

  // Calculate user performance scores
  calculateUserScores(metrics) {
    // Productivity score (0-100)
    const productivityScore = Math.min(100, 
      (metrics.pullRequestsOpened * 10) + 
      (metrics.commitsCount * 2) + 
      (metrics.reviewsGiven * 5)
    );

    // Quality score based on merge rate, review participation
    const qualityScore = Math.min(100,
      (metrics.mergeRate * 0.5) +
      (metrics.avgReviewsPerPR * 10) +
      (metrics.approvalRate * 0.3)
    );

    // Collaboration score
    const collaborationScore = Math.min(100,
      (metrics.reviewsGiven * 5) +
      (metrics.commentsGiven * 2) +
      (metrics.uniqueCollaborators * 10)
    );

    return {
      productivityScore: Math.round(productivityScore),
      qualityScore: Math.round(qualityScore),
      collaborationScore: Math.round(collaborationScore)
    };
  }

  // Calculate repository performance scores
  calculateRepositoryScores(metrics) {
    const activityScore = Math.min(100,
      (metrics.pullRequestsOpened * 5) +
      (metrics.commitsCount * 2) +
      (metrics.uniqueCollaborators * 10)
    );

    return {
      productivityScore: Math.round(activityScore),
      qualityScore: 50, // Placeholder
      collaborationScore: Math.min(100, metrics.uniqueCollaborators * 10)
    };
  }

  // Calculate team performance scores
  calculateTeamScores(metrics) {
    const velocityScore = Math.min(100,
      (metrics.pullRequestsOpened * 2) +
      (metrics.commitsCount * 1)
    );

    return {
      velocityScore: Math.round(velocityScore),
      productivityScore: Math.round(velocityScore * 0.8),
      collaborationScore: Math.min(100, metrics.uniqueCollaborators * 5)
    };
  }

  // Generate time periods based on metric type
  generatePeriods(metricType, startDate, endDate) {
    const periods = [];
    const current = moment(startDate);
    const end = moment(endDate);

    while (current.isSameOrBefore(end)) {
      let periodEnd;
      let dateFormat;

      switch (metricType) {
        case 'hourly':
          periodEnd = moment(current).add(1, 'hour');
          dateFormat = 'YYYY-MM-DD HH:00:00';
          break;
        case 'weekly':
          periodEnd = moment(current).add(1, 'week');
          dateFormat = 'YYYY-MM-DD';
          current.startOf('week');
          break;
        case 'monthly':
          periodEnd = moment(current).add(1, 'month');
          dateFormat = 'YYYY-MM-01';
          current.startOf('month');
          break;
        case 'quarterly':
          periodEnd = moment(current).add(1, 'quarter');
          dateFormat = 'YYYY-MM-01';
          current.startOf('quarter');
          break;
        case 'yearly':
          periodEnd = moment(current).add(1, 'year');
          dateFormat = 'YYYY-01-01';
          current.startOf('year');
          break;
        default: // daily
          periodEnd = moment(current).add(1, 'day');
          dateFormat = 'YYYY-MM-DD';
      }

      periods.push({
        date: current.format(dateFormat),
        start: current.toDate(),
        end: moment.min(periodEnd, end).toDate()
      });

      current.add(1, metricType === 'weekly' ? 'week' : 
                     metricType === 'monthly' ? 'month' :
                     metricType === 'quarterly' ? 'quarter' :
                     metricType === 'yearly' ? 'year' :
                     metricType === 'hourly' ? 'hour' : 'day');
    }

    return periods;
  }

  // Get default start date based on metric type
  getDefaultStartDate(metricType) {
    switch (metricType) {
      case 'hourly':
        return moment().subtract(7, 'days').toDate();
      case 'weekly':
        return moment().subtract(12, 'weeks').toDate();
      case 'monthly':
        return moment().subtract(12, 'months').toDate();
      case 'quarterly':
        return moment().subtract(4, 'quarters').toDate();
      case 'yearly':
        return moment().subtract(3, 'years').toDate();
      default: // daily
        return moment().subtract(90, 'days').toDate();
    }
  }

  // Count data points for confidence calculation
  countDataPoints(metrics) {
    return Object.values(metrics).filter(value => 
      value !== null && value !== undefined && value !== 0
    ).length;
  }

  // Calculate confidence score based on data availability
  calculateConfidence(metrics) {
    const totalFields = Object.keys(metrics).length;
    const filledFields = this.countDataPoints(metrics);
    return totalFields > 0 ? (filledFields / totalFields) : 0;
  }

  // Get calculation status
  getCalculationStatus() {
    return {
      inProgress: this.calculationInProgress
    };
  }
}

module.exports = MetricsCalculationService;