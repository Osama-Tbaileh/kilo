const { Op } = require('sequelize');
const { User, Repository, PullRequest, Review, Comment, Commit, Metric } = require('../../models');
const logger = require('../../utils/logger');
const moment = require('moment');

class InsightsService {
  constructor() {
    this.insightTypes = [
      'performance_trends',
      'collaboration_patterns',
      'code_quality_insights',
      'productivity_anomalies',
      'team_dynamics',
      'repository_health'
    ];
  }

  // Generate comprehensive insights for a user, repository, or team
  async generateInsights(options = {}) {
    try {
      const {
        type = 'team', // 'user', 'repository', 'team'
        targetId = null,
        startDate,
        endDate,
        insightTypes = this.insightTypes
      } = options;

      const start = startDate ? new Date(startDate) : moment().subtract(90, 'days').toDate();
      const end = endDate ? new Date(endDate) : new Date();

      logger.info(`Generating insights for ${type}`, { targetId, start, end, insightTypes });

      const insights = {};

      // Generate each type of insight
      for (const insightType of insightTypes) {
        try {
          insights[insightType] = await this.generateSpecificInsight(
            insightType, type, targetId, start, end
          );
        } catch (error) {
          logger.error(`Error generating ${insightType} insight:`, error.message);
          insights[insightType] = { error: error.message };
        }
      }

      return {
        type,
        targetId,
        dateRange: { start, end },
        generatedAt: new Date(),
        insights
      };

    } catch (error) {
      logger.error('Error generating insights:', error.message);
      throw error;
    }
  }

  // Generate specific type of insight
  async generateSpecificInsight(insightType, targetType, targetId, startDate, endDate) {
    switch (insightType) {
      case 'performance_trends':
        return this.generatePerformanceTrends(targetType, targetId, startDate, endDate);
      
      case 'collaboration_patterns':
        return this.generateCollaborationPatterns(targetType, targetId, startDate, endDate);
      
      case 'code_quality_insights':
        return this.generateCodeQualityInsights(targetType, targetId, startDate, endDate);
      
      case 'productivity_anomalies':
        return this.generateProductivityAnomalies(targetType, targetId, startDate, endDate);
      
      case 'team_dynamics':
        return this.generateTeamDynamics(targetType, targetId, startDate, endDate);
      
      case 'repository_health':
        return this.generateRepositoryHealth(targetType, targetId, startDate, endDate);
      
      default:
        throw new Error(`Unknown insight type: ${insightType}`);
    }
  }

  // Generate performance trend insights
  async generatePerformanceTrends(targetType, targetId, startDate, endDate) {
    const whereClause = this.buildWhereClause(targetType, targetId, startDate, endDate);
    
    // Get metrics over time
    const metrics = await Metric.findAll({
      where: {
        ...whereClause,
        period: { [Op.between]: [startDate, endDate] }
      },
      include: this.getIncludeClause(targetType),
      order: [['period', 'ASC']]
    });

    if (metrics.length === 0) {
      return { message: 'No data available for trend analysis' };
    }

    // Calculate trends
    const trends = this.calculateTrends(metrics);
    const insights = this.analyzeTrends(trends);

    return {
      summary: insights.summary,
      trends: trends,
      insights: insights.insights,
      recommendations: insights.recommendations
    };
  }

  // Generate collaboration pattern insights
  async generateCollaborationPatterns(targetType, targetId, startDate, endDate) {
    let collaborationData;

    if (targetType === 'user') {
      collaborationData = await this.getUserCollaborationPatterns(targetId, startDate, endDate);
    } else if (targetType === 'repository') {
      collaborationData = await this.getRepositoryCollaborationPatterns(targetId, startDate, endDate);
    } else {
      collaborationData = await this.getTeamCollaborationPatterns(startDate, endDate);
    }

    const patterns = this.analyzeCollaborationPatterns(collaborationData);

    return {
      summary: patterns.summary,
      networkAnalysis: patterns.networkAnalysis,
      communicationPatterns: patterns.communicationPatterns,
      insights: patterns.insights,
      recommendations: patterns.recommendations
    };
  }

  // Generate code quality insights
  async generateCodeQualityInsights(targetType, targetId, startDate, endDate) {
    const whereClause = this.buildPRWhereClause(targetType, targetId, startDate, endDate);

    const [prData, reviewData, commitData] = await Promise.all([
      PullRequest.findAll({
        where: whereClause,
        attributes: [
          'additions', 'deletions', 'changedFiles', 'reviewsCount', 
          'commentsCount', 'timeToMerge', 'merged'
        ]
      }),

      Review.findAll({
        where: {
          githubSubmittedAt: { [Op.between]: [startDate, endDate] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          where: targetType === 'user' ? { authorId: targetId } : 
                 targetType === 'repository' ? { repositoryId: targetId } : {},
          attributes: []
        }],
        attributes: ['state', 'commentsCount']
      }),

      Commit.findAll({
        where: {
          authorDate: { [Op.between]: [startDate, endDate] },
          ...(targetType === 'user' ? { authorId: targetId } : {}),
          ...(targetType === 'repository' ? { repositoryId: targetId } : {})
        },
        attributes: ['additions', 'deletions', 'changedFiles', 'messageLength']
      })
    ]);

    const qualityMetrics = this.calculateQualityMetrics(prData, reviewData, commitData);
    const insights = this.analyzeQualityMetrics(qualityMetrics);

    return {
      summary: insights.summary,
      metrics: qualityMetrics,
      insights: insights.insights,
      recommendations: insights.recommendations
    };
  }

  // Generate productivity anomaly insights
  async generateProductivityAnomalies(targetType, targetId, startDate, endDate) {
    const whereClause = this.buildWhereClause(targetType, targetId, startDate, endDate);

    const metrics = await Metric.findAll({
      where: {
        ...whereClause,
        period: { [Op.between]: [startDate, endDate] },
        metricType: 'daily'
      },
      include: this.getIncludeClause(targetType),
      order: [['period', 'ASC']]
    });

    if (metrics.length < 7) {
      return { message: 'Insufficient data for anomaly detection' };
    }

    const anomalies = this.detectAnomalies(metrics);
    const insights = this.analyzeAnomalies(anomalies);

    return {
      summary: insights.summary,
      anomalies: anomalies,
      insights: insights.insights,
      recommendations: insights.recommendations
    };
  }

  // Generate team dynamics insights
  async generateTeamDynamics(targetType, targetId, startDate, endDate) {
    if (targetType !== 'team') {
      return { message: 'Team dynamics insights only available for team-level analysis' };
    }

    const [reviewNetwork, prCollaboration, responsePatterns] = await Promise.all([
      this.getReviewNetwork(startDate, endDate),
      this.getPRCollaboration(startDate, endDate),
      this.getResponsePatterns(startDate, endDate)
    ]);

    const dynamics = this.analyzeTeamDynamics(reviewNetwork, prCollaboration, responsePatterns);

    return {
      summary: dynamics.summary,
      networkMetrics: dynamics.networkMetrics,
      collaborationHealth: dynamics.collaborationHealth,
      insights: dynamics.insights,
      recommendations: dynamics.recommendations
    };
  }

  // Generate repository health insights
  async generateRepositoryHealth(targetType, targetId, startDate, endDate) {
    const repositories = targetType === 'repository' && targetId ? 
      await Repository.findAll({ where: { id: targetId } }) :
      await Repository.findAll({ where: { isActive: true } });

    const healthScores = await Promise.all(
      repositories.map(repo => this.calculateRepositoryHealthScore(repo, startDate, endDate))
    );

    const insights = this.analyzeRepositoryHealth(healthScores);

    return {
      summary: insights.summary,
      healthScores: healthScores,
      insights: insights.insights,
      recommendations: insights.recommendations
    };
  }

  // Helper methods for trend analysis
  calculateTrends(metrics) {
    const trends = {};
    const metricKeys = ['pullRequestsOpened', 'reviewsGiven', 'commitsCount', 'productivityScore'];

    metricKeys.forEach(key => {
      const values = metrics.map(m => m[key] || 0);
      trends[key] = {
        values,
        trend: this.calculateLinearTrend(values),
        average: values.reduce((a, b) => a + b, 0) / values.length,
        volatility: this.calculateVolatility(values)
      };
    });

    return trends;
  }

  calculateLinearTrend(values) {
    const n = values.length;
    if (n < 2) return 0;

    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumXX = values.reduce((sum, _, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  calculateVolatility(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  analyzeTrends(trends) {
    const insights = [];
    const recommendations = [];
    let overallTrend = 'stable';

    Object.entries(trends).forEach(([metric, data]) => {
      if (data.trend > 0.1) {
        insights.push(`${metric} is showing an upward trend (+${data.trend.toFixed(2)} per period)`);
        overallTrend = 'improving';
      } else if (data.trend < -0.1) {
        insights.push(`${metric} is showing a downward trend (${data.trend.toFixed(2)} per period)`);
        if (overallTrend !== 'improving') overallTrend = 'declining';
        recommendations.push(`Consider investigating factors affecting ${metric} performance`);
      }

      if (data.volatility > data.average * 0.5) {
        insights.push(`${metric} shows high volatility (${data.volatility.toFixed(2)})`);
        recommendations.push(`Work on stabilizing ${metric} performance`);
      }
    });

    return {
      summary: `Overall performance trend: ${overallTrend}`,
      insights,
      recommendations
    };
  }

  // Helper methods for collaboration analysis
  async getUserCollaborationPatterns(userId, startDate, endDate) {
    const [reviewsGiven, reviewsReceived, prComments] = await Promise.all([
      Review.findAll({
        where: {
          reviewerId: userId,
          githubSubmittedAt: { [Op.between]: [startDate, endDate] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'name']
          }]
        }]
      }),

      Review.findAll({
        where: {
          githubSubmittedAt: { [Op.between]: [startDate, endDate] }
        },
        include: [
          {
            model: User,
            as: 'reviewer',
            attributes: ['id', 'username', 'name']
          },
          {
            model: PullRequest,
            as: 'pullRequest',
            where: { authorId: userId }
          }
        ]
      }),

      Comment.findAll({
        where: {
          authorId: userId,
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        },
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'name']
          }]
        }]
      })
    ]);

    return { reviewsGiven, reviewsReceived, prComments };
  }

  analyzeCollaborationPatterns(collaborationData) {
    const { reviewsGiven, reviewsReceived, prComments } = collaborationData;
    
    // Build collaboration network
    const network = new Map();
    
    reviewsGiven.forEach(review => {
      const partnerId = review.pullRequest.author.id;
      if (!network.has(partnerId)) {
        network.set(partnerId, {
          user: review.pullRequest.author,
          reviewsGiven: 0,
          reviewsReceived: 0,
          comments: 0
        });
      }
      network.get(partnerId).reviewsGiven++;
    });

    reviewsReceived.forEach(review => {
      const partnerId = review.reviewer.id;
      if (!network.has(partnerId)) {
        network.set(partnerId, {
          user: review.reviewer,
          reviewsGiven: 0,
          reviewsReceived: 0,
          comments: 0
        });
      }
      network.get(partnerId).reviewsReceived++;
    });

    const networkArray = Array.from(network.values());
    const insights = [];
    const recommendations = [];

    // Analyze patterns
    const totalCollaborators = networkArray.length;
    const avgInteractions = networkArray.reduce((sum, collab) => 
      sum + collab.reviewsGiven + collab.reviewsReceived + collab.comments, 0) / totalCollaborators;

    insights.push(`Collaborates with ${totalCollaborators} team members`);
    insights.push(`Average ${avgInteractions.toFixed(1)} interactions per collaborator`);

    if (totalCollaborators < 3) {
      recommendations.push('Consider expanding collaboration network');
    }

    return {
      summary: `Active collaboration with ${totalCollaborators} team members`,
      networkAnalysis: networkArray,
      communicationPatterns: {
        reviewsGiven: reviewsGiven.length,
        reviewsReceived: reviewsReceived.length,
        comments: prComments.length
      },
      insights,
      recommendations
    };
  }

  // Helper methods for anomaly detection
  detectAnomalies(metrics) {
    const anomalies = [];
    const metricKeys = ['pullRequestsOpened', 'reviewsGiven', 'commitsCount'];

    metricKeys.forEach(key => {
      const values = metrics.map(m => m[key] || 0);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length);
      
      values.forEach((value, index) => {
        const zScore = Math.abs((value - mean) / stdDev);
        if (zScore > 2) { // 2 standard deviations
          anomalies.push({
            date: metrics[index].period,
            metric: key,
            value,
            expected: mean,
            severity: zScore > 3 ? 'high' : 'medium',
            type: value > mean ? 'spike' : 'drop'
          });
        }
      });
    });

    return anomalies;
  }

  analyzeAnomalies(anomalies) {
    const insights = [];
    const recommendations = [];

    const spikes = anomalies.filter(a => a.type === 'spike');
    const drops = anomalies.filter(a => a.type === 'drop');

    if (spikes.length > 0) {
      insights.push(`Detected ${spikes.length} productivity spikes`);
    }

    if (drops.length > 0) {
      insights.push(`Detected ${drops.length} productivity drops`);
      recommendations.push('Investigate causes of productivity drops');
    }

    const highSeverity = anomalies.filter(a => a.severity === 'high');
    if (highSeverity.length > 0) {
      recommendations.push('Review high-severity anomalies for potential issues');
    }

    return {
      summary: `Found ${anomalies.length} anomalies (${spikes.length} spikes, ${drops.length} drops)`,
      insights,
      recommendations
    };
  }

  // Helper methods for repository health
  async calculateRepositoryHealthScore(repository, startDate, endDate) {
    const [prStats, commitStats, stalePRs, avgResponseTime] = await Promise.all([
      PullRequest.findAll({
        where: {
          repositoryId: repository.id,
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        },
        attributes: ['state', 'merged', 'timeToMerge']
      }),

      Commit.count({
        where: {
          repositoryId: repository.id,
          authorDate: { [Op.between]: [startDate, endDate] }
        }
      }),

      PullRequest.count({
        where: {
          repositoryId: repository.id,
          state: 'open',
          githubUpdatedAt: { [Op.lt]: moment().subtract(14, 'days').toDate() }
        }
      }),

      PullRequest.findAll({
        where: {
          repositoryId: repository.id,
          timeToFirstReview: { [Op.not]: null },
          githubCreatedAt: { [Op.between]: [startDate, endDate] }
        },
        attributes: ['timeToFirstReview']
      })
    ]);

    const totalPRs = prStats.length;
    const mergedPRs = prStats.filter(pr => pr.merged).length;
    const mergeRate = totalPRs > 0 ? (mergedPRs / totalPRs) * 100 : 0;
    
    const avgResponse = avgResponseTime.length > 0 ?
      avgResponseTime.reduce((sum, pr) => sum + pr.timeToFirstReview, 0) / avgResponseTime.length : 0;

    // Calculate health score (0-100)
    const activityScore = Math.min(100, (totalPRs * 5) + (commitStats * 2));
    const qualityScore = mergeRate;
    const responsivenessScore = avgResponse > 0 ? Math.max(0, 100 - (avgResponse / 60)) : 50;
    const staleScore = Math.max(0, 100 - (stalePRs * 10));

    const overallHealth = Math.round(
      (activityScore * 0.3) + (qualityScore * 0.3) + (responsivenessScore * 0.2) + (staleScore * 0.2)
    );

    return {
      repository: {
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName
      },
      healthScore: overallHealth,
      metrics: {
        activity: Math.round(activityScore),
        quality: Math.round(qualityScore),
        responsiveness: Math.round(responsivenessScore),
        staleness: Math.round(staleScore)
      },
      stats: {
        totalPRs,
        mergedPRs,
        commits: commitStats,
        stalePRs,
        avgResponseHours: avgResponse > 0 ? (avgResponse / 60).toFixed(1) : 'N/A'
      }
    };
  }

  // Helper methods for building queries
  buildWhereClause(targetType, targetId, startDate, endDate) {
    const whereClause = {};
    
    if (targetType === 'user' && targetId) {
      whereClause.userId = targetId;
    } else if (targetType === 'repository' && targetId) {
      whereClause.repositoryId = targetId;
    }

    return whereClause;
  }

  buildPRWhereClause(targetType, targetId, startDate, endDate) {
    const whereClause = {
      githubCreatedAt: { [Op.between]: [startDate, endDate] }
    };

    if (targetType === 'user' && targetId) {
      whereClause.authorId = targetId;
    } else if (targetType === 'repository' && targetId) {
      whereClause.repositoryId = targetId;
    }

    return whereClause;
  }

  getIncludeClause(targetType) {
    const includes = [];
    
    if (targetType !== 'user') {
      includes.push({
        model: User,
        as: 'user',
        attributes: ['username', 'name'],
        required: false
      });
    }
    
    if (targetType !== 'repository') {
      includes.push({
        model: Repository,
        as: 'repository',
        attributes: ['name', 'fullName'],
        required: false
      });
    }

    return includes;
  }

  // Calculate quality metrics
  calculateQualityMetrics(prData, reviewData, commitData) {
    const totalPRs = prData.length;
    const mergedPRs = prData.filter(pr => pr.merged).length;
    
    return {
      mergeRate: totalPRs > 0 ? (mergedPRs / totalPRs) * 100 : 0,
      avgPRSize: totalPRs > 0 ? 
        prData.reduce((sum, pr) => sum + (pr.additions || 0) + (pr.deletions || 0), 0) / totalPRs : 0,
      avgReviewsPerPR: totalPRs > 0 ?
        prData.reduce((sum, pr) => sum + (pr.reviewsCount || 0), 0) / totalPRs : 0,
      avgCommentsPerPR: totalPRs > 0 ?
        prData.reduce((sum, pr) => sum + (pr.commentsCount || 0), 0) / totalPRs : 0,
      approvalRate: reviewData.length > 0 ?
        (reviewData.filter(r => r.state === 'APPROVED').length / reviewData.length) * 100 : 0,
      avgCommitSize: commitData.length > 0 ?
        commitData.reduce((sum, c) => sum + (c.additions || 0) + (c.deletions || 0), 0) / commitData.length : 0
    };
  }

  analyzeQualityMetrics(metrics) {
    const insights = [];
    const recommendations = [];

    if (metrics.mergeRate < 70) {
      insights.push(`Low merge rate: ${metrics.mergeRate.toFixed(1)}%`);
      recommendations.push('Review PR rejection reasons and improve code quality');
    }

    if (metrics.avgPRSize > 500) {
      insights.push(`Large average PR size: ${metrics.avgPRSize.toFixed(0)} lines`);
      recommendations.push('Consider breaking down large PRs into smaller, reviewable chunks');
    }

    if (metrics.avgReviewsPerPR < 1.5) {
      insights.push(`Low review participation: ${metrics.avgReviewsPerPR.toFixed(1)} reviews per PR`);
      recommendations.push('Encourage more thorough code review practices');
    }

    return {
      summary: `Code quality score: ${this.calculateOverallQualityScore(metrics)}/100`,
      insights,
      recommendations
    };
  }

  calculateOverallQualityScore(metrics) {
    const mergeScore = metrics.mergeRate;
    const sizeScore = Math.max(0, 100 - (metrics.avgPRSize / 10));
    const reviewScore = Math.min(100, metrics.avgReviewsPerPR * 50);
    const approvalScore = metrics.approvalRate;

    return Math.round((mergeScore + sizeScore + reviewScore + approvalScore) / 4);
  }
}

module.exports = InsightsService;