module.exports = (sequelize, DataTypes) => {
  const PullRequest = sequelize.define('PullRequest', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    githubId: {
      type: DataTypes.BIGINT,
      unique: true,
      allowNull: false,
      comment: 'GitHub pull request ID'
    },
    number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'PR number within the repository'
    },
    title: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'PR description/body'
    },
    state: {
      type: DataTypes.ENUM('open', 'closed', 'merged'),
      allowNull: false,
      defaultValue: 'open'
    },
    draft: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    locked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    htmlUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'GitHub PR URL'
    },
    diffUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    patchUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    issueUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    authorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    assigneeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    repositoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'repositories',
        key: 'id'
      }
    },
    baseBranch: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Target branch'
    },
    headBranch: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Source branch'
    },
    baseSha: {
      type: DataTypes.STRING,
      allowNull: true
    },
    headSha: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mergeCommitSha: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mergeable: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    mergeableState: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'clean, dirty, unstable, blocked, behind, draft'
    },
    merged: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    mergedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    mergedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // File change statistics
    additions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Lines added'
    },
    deletions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Lines deleted'
    },
    changedFiles: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of files changed'
    },
    // Review statistics
    reviewsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    commentsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    commitsCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    // Labels and assignees
    labels: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'PR labels'
    },
    assignees: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'PR assignees'
    },
    requestedReviewers: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Requested reviewers'
    },
    requestedTeams: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Requested review teams'
    },
    // Milestone and project info
    milestone: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    // GitHub timestamps
    githubCreatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'When the PR was created on GitHub'
    },
    githubUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'When the PR was last updated on GitHub'
    },
    // Calculated metrics
    timeToFirstReview: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Minutes from creation to first review'
    },
    timeToMerge: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Minutes from creation to merge'
    },
    reviewCycles: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of review cycles'
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time PR data was synced from GitHub'
    }
  }, {
    tableName: 'pull_requests',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['githubId']
      },
      {
        unique: true,
        fields: ['repositoryId', 'number']
      },
      {
        fields: ['authorId']
      },
      {
        fields: ['assigneeId']
      },
      {
        fields: ['repositoryId']
      },
      {
        fields: ['state']
      },
      {
        fields: ['merged']
      },
      {
        fields: ['draft']
      },
      {
        fields: ['githubCreatedAt']
      },
      {
        fields: ['mergedAt']
      },
      {
        fields: ['closedAt']
      },
      {
        fields: ['lastSyncAt']
      }
    ]
  });

  return PullRequest;
};