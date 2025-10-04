const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool || {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Import models
const User = require('./User')(sequelize, Sequelize.DataTypes);
const Repository = require('./Repository')(sequelize, Sequelize.DataTypes);
const PullRequest = require('./PullRequest')(sequelize, Sequelize.DataTypes);
const Review = require('./Review')(sequelize, Sequelize.DataTypes);
const Comment = require('./Comment')(sequelize, Sequelize.DataTypes);
const Commit = require('./Commit')(sequelize, Sequelize.DataTypes);
const TeamMember = require('./TeamMember')(sequelize, Sequelize.DataTypes);
const Metric = require('./Metric')(sequelize, Sequelize.DataTypes);

// Define associations
const db = {
  sequelize,
  Sequelize,
  User,
  Repository,
  PullRequest,
  Review,
  Comment,
  Commit,
  TeamMember,
  Metric
};

// User associations
User.hasMany(PullRequest, { foreignKey: 'authorId', as: 'authoredPRs' });
User.hasMany(PullRequest, { foreignKey: 'assigneeId', as: 'assignedPRs' });
User.hasMany(Review, { foreignKey: 'reviewerId', as: 'reviews' });
User.hasMany(Comment, { foreignKey: 'authorId', as: 'comments' });
User.hasMany(Commit, { foreignKey: 'authorId', as: 'commits' });
User.hasOne(TeamMember, { foreignKey: 'userId', as: 'teamMember' });

// Repository associations
Repository.hasMany(PullRequest, { foreignKey: 'repositoryId', as: 'pullRequests' });
Repository.hasMany(Commit, { foreignKey: 'repositoryId', as: 'commits' });

// PullRequest associations
PullRequest.belongsTo(User, { foreignKey: 'authorId', as: 'author' });
PullRequest.belongsTo(User, { foreignKey: 'assigneeId', as: 'assignee' });
PullRequest.belongsTo(Repository, { foreignKey: 'repositoryId', as: 'repository' });
PullRequest.hasMany(Review, { foreignKey: 'pullRequestId', as: 'reviews' });
PullRequest.hasMany(Comment, { foreignKey: 'pullRequestId', as: 'comments' });

// Review associations
Review.belongsTo(User, { foreignKey: 'reviewerId', as: 'reviewer' });
Review.belongsTo(PullRequest, { foreignKey: 'pullRequestId', as: 'pullRequest' });
Review.hasMany(Comment, { foreignKey: 'reviewId', as: 'comments' });

// Comment associations
Comment.belongsTo(User, { foreignKey: 'authorId', as: 'author' });
Comment.belongsTo(PullRequest, { foreignKey: 'pullRequestId', as: 'pullRequest' });
Comment.belongsTo(Review, { foreignKey: 'reviewId', as: 'review' });

// Commit associations
Commit.belongsTo(User, { foreignKey: 'authorId', as: 'author' });
Commit.belongsTo(Repository, { foreignKey: 'repositoryId', as: 'repository' });

// TeamMember associations
TeamMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Metric associations
Metric.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Metric.belongsTo(Repository, { foreignKey: 'repositoryId', as: 'repository' });

module.exports = db;