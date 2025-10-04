module.exports = (sequelize, DataTypes) => {
  const Metric = sequelize.define('Metric', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'User this metric belongs to (null for repository/team metrics)'
    },
    repositoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'repositories',
        key: 'id'
      },
      comment: 'Repository this metric belongs to (null for user/team metrics)'
    },
    metricType: {
      type: DataTypes.ENUM(
        'daily', 'weekly', 'monthly', 'quarterly', 'yearly',
        'pr_lifecycle', 'review_efficiency', 'code_quality',
        'collaboration', 'productivity', 'custom'
      ),
      allowNull: false,
      comment: 'Type of metric'
    },
    metricName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Name of the specific metric'
    },
    period: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Time period this metric represents'
    },
    // Core metrics
    pullRequestsOpened: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    pullRequestsClosed: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    pullRequestsMerged: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    reviewsGiven: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    reviewsReceived: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    commentsGiven: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    commentsReceived: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    commitsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    linesAdded: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    linesDeleted: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    filesChanged: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    // Time-based metrics (in minutes)
    avgTimeToFirstReview: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Average time to first review in minutes'
    },
    avgTimeToMerge: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Average time to merge in minutes'
    },
    avgReviewTime: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Average time spent on reviews in minutes'
    },
    // Quality metrics
    avgReviewsPerPR: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    avgCommentsPerPR: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    avgCommentsPerReview: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    mergeRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Percentage of PRs that get merged'
    },
    approvalRate: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Percentage of reviews that are approvals'
    },
    // Collaboration metrics
    uniqueCollaborators: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of unique people collaborated with'
    },
    crossRepoActivity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of different repositories worked on'
    },
    // Productivity metrics
    productivityScore: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Calculated productivity score'
    },
    velocityScore: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Development velocity score'
    },
    qualityScore: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Code quality score'
    },
    collaborationScore: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Team collaboration score'
    },
    // Custom metrics (flexible JSON storage)
    customMetrics: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Additional custom metrics'
    },
    // Ranking and percentiles
    teamRank: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Rank within the team for this metric'
    },
    percentile: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Percentile ranking (0-100)'
    },
    // Metadata
    calculatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When this metric was calculated'
    },
    dataPoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of data points used in calculation'
    },
    confidence: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      comment: 'Confidence level of the metric (0-1)'
    }
  }, {
    tableName: 'metrics',
    timestamps: true,
    indexes: [
      {
        fields: ['userId']
      },
      {
        fields: ['repositoryId']
      },
      {
        fields: ['metricType']
      },
      {
        fields: ['metricName']
      },
      {
        fields: ['period']
      },
      {
        fields: ['calculatedAt']
      },
      {
        unique: true,
        fields: ['userId', 'repositoryId', 'metricType', 'metricName', 'period']
      },
      {
        fields: ['userId', 'metricType', 'period']
      },
      {
        fields: ['repositoryId', 'metricType', 'period']
      }
    ]
  });

  return Metric;
};