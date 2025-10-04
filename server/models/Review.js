module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define('Review', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    githubId: {
      type: DataTypes.BIGINT,
      unique: true,
      allowNull: false,
      comment: 'GitHub review ID'
    },
    pullRequestId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'pull_requests',
        key: 'id'
      }
    },
    reviewerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Review comment body'
    },
    state: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'),
      allowNull: false,
      comment: 'Review state'
    },
    htmlUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'GitHub review URL'
    },
    pullRequestUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    commitId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Commit SHA that was reviewed'
    },
    // Review metrics
    commentsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of review comments'
    },
    // GitHub timestamps
    githubSubmittedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the review was submitted on GitHub'
    },
    // Calculated metrics
    responseTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Minutes from PR creation/update to this review'
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time review data was synced from GitHub'
    }
  }, {
    tableName: 'reviews',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['githubId']
      },
      {
        fields: ['pullRequestId']
      },
      {
        fields: ['reviewerId']
      },
      {
        fields: ['state']
      },
      {
        fields: ['githubSubmittedAt']
      },
      {
        fields: ['lastSyncAt']
      },
      {
        fields: ['pullRequestId', 'reviewerId']
      }
    ]
  });

  return Review;
};