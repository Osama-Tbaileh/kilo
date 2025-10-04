module.exports = (sequelize, DataTypes) => {
  const Comment = sequelize.define('Comment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    githubId: {
      type: DataTypes.BIGINT,
      unique: true,
      allowNull: false,
      comment: 'GitHub comment ID'
    },
    pullRequestId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'pull_requests',
        key: 'id'
      }
    },
    reviewId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'reviews',
        key: 'id'
      },
      comment: 'Associated review if this is a review comment'
    },
    authorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Comment content'
    },
    htmlUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'GitHub comment URL'
    },
    pullRequestUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM('issue_comment', 'review_comment', 'commit_comment'),
      allowNull: false,
      defaultValue: 'issue_comment',
      comment: 'Type of comment'
    },
    // For review comments (line-specific comments)
    path: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'File path for review comments'
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Position in diff for review comments'
    },
    originalPosition: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Original position in diff'
    },
    line: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Line number in file'
    },
    originalLine: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Original line number'
    },
    side: {
      type: DataTypes.ENUM('LEFT', 'RIGHT'),
      allowNull: true,
      comment: 'Side of diff (for review comments)'
    },
    startLine: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Start line for multi-line comments'
    },
    startSide: {
      type: DataTypes.ENUM('LEFT', 'RIGHT'),
      allowNull: true,
      comment: 'Start side for multi-line comments'
    },
    // For commit comments
    commitId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Commit SHA for commit comments'
    },
    // Reaction and engagement metrics
    reactions: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'GitHub reactions (+1, -1, laugh, hooray, confused, heart, rocket, eyes)'
    },
    // GitHub timestamps
    githubCreatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'When the comment was created on GitHub'
    },
    githubUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'When the comment was last updated on GitHub'
    },
    // Calculated metrics
    wordCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Number of words in the comment'
    },
    sentiment: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      comment: 'Sentiment score (-1 to 1)'
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time comment data was synced from GitHub'
    }
  }, {
    tableName: 'comments',
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
        fields: ['reviewId']
      },
      {
        fields: ['authorId']
      },
      {
        fields: ['type']
      },
      {
        fields: ['githubCreatedAt']
      },
      {
        fields: ['lastSyncAt']
      },
      {
        fields: ['pullRequestId', 'authorId']
      },
      {
        fields: ['pullRequestId', 'type']
      }
    ]
  });

  return Comment;
};