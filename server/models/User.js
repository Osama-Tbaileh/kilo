module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    githubId: {
      type: DataTypes.INTEGER,
      unique: true,
      allowNull: false,
      comment: 'GitHub user ID'
    },
    username: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      comment: 'GitHub username'
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Full name from GitHub profile'
    },
    avatarUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'GitHub avatar URL'
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    company: {
      type: DataTypes.STRING,
      allowNull: true
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true
    },
    blog: {
      type: DataTypes.STRING,
      allowNull: true
    },
    twitterUsername: {
      type: DataTypes.STRING,
      allowNull: true
    },
    publicRepos: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    publicGists: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    followers: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    following: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    githubCreatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the GitHub account was created'
    },
    githubUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the GitHub profile was last updated'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether the user is currently active in the organization'
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time user data was synced from GitHub'
    }
  }, {
    tableName: 'users',
    timestamps: true,
    indexes: [
      // githubId and username already have unique: true in field definition
      // No need to duplicate unique indexes
      {
        fields: ['isActive']
      },
      {
        fields: ['lastSyncAt']
      },
      {
        fields: ['githubCreatedAt']
      }
    ]
  });

  return User;
};