module.exports = (sequelize, DataTypes) => {
  const Commit = sequelize.define('Commit', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sha: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      comment: 'Git commit SHA'
    },
    repositoryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'repositories',
        key: 'id'
      }
    },
    authorId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'GitHub user who authored the commit'
    },
    committerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'GitHub user who committed the commit'
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Commit message'
    },
    htmlUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'GitHub commit URL'
    },
    // Author information (from Git, not necessarily GitHub users)
    authorName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Git author name'
    },
    authorEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Git author email'
    },
    authorDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Git author date'
    },
    // Committer information
    committerName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Git committer name'
    },
    committerEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Git committer email'
    },
    committerDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Git committer date'
    },
    // Tree and parent information
    treeId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Git tree SHA'
    },
    parents: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Parent commit SHAs'
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
    // File changes details
    files: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Detailed file changes information'
    },
    // Verification status
    verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether the commit is verified (signed)'
    },
    verification: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Verification details'
    },
    // Associated pull request
    pullRequestNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'PR number if this commit is part of a PR'
    },
    // Branch information
    branch: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Branch where this commit was made'
    },
    // Calculated metrics
    messageLength: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Length of commit message'
    },
    complexity: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      comment: 'Calculated complexity score based on changes'
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time commit data was synced from GitHub'
    }
  }, {
    tableName: 'commits',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['sha']
      },
      {
        fields: ['repositoryId']
      },
      {
        fields: ['authorId']
      },
      {
        fields: ['committerId']
      },
      {
        fields: ['authorDate']
      },
      {
        fields: ['committerDate']
      },
      {
        fields: ['pullRequestNumber']
      },
      {
        fields: ['branch']
      },
      {
        fields: ['lastSyncAt']
      },
      {
        fields: ['repositoryId', 'authorId']
      },
      {
        fields: ['repositoryId', 'authorDate']
      }
    ]
  });

  return Commit;
};