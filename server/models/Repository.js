module.exports = (sequelize, DataTypes) => {
  const Repository = sequelize.define('Repository', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    githubId: {
      type: DataTypes.INTEGER,
      unique: true,
      allowNull: false,
      comment: 'GitHub repository ID'
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Repository name'
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Full repository name (owner/repo)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    private: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    fork: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    archived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    disabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    htmlUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'GitHub repository URL'
    },
    cloneUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    sshUrl: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    defaultBranch: {
      type: DataTypes.STRING,
      defaultValue: 'main'
    },
    language: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Primary programming language'
    },
    languages: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'All languages used in the repository'
    },
    topics: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Repository topics/tags'
    },
    size: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Repository size in KB'
    },
    stargazersCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    watchersCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    forksCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    openIssuesCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    hasIssues: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    hasProjects: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    hasWiki: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    hasPages: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    hasDownloads: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    githubCreatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the repository was created on GitHub'
    },
    githubUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the repository was last updated on GitHub'
    },
    githubPushedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the repository was last pushed to'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether we are actively tracking this repository'
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time repository data was synced from GitHub'
    }
  }, {
    tableName: 'repositories',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['githubId']
      },
      {
        unique: true,
        fields: ['fullName']
      },
      {
        fields: ['name']
      },
      {
        fields: ['language']
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['archived']
      },
      {
        fields: ['lastSyncAt']
      }
    ]
  });

  return Repository;
};