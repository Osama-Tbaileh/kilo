module.exports = (sequelize, DataTypes) => {
  const TeamMember = sequelize.define('TeamMember', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    role: {
      type: DataTypes.ENUM('developer', 'senior_developer', 'tech_lead', 'manager', 'admin'),
      allowNull: false,
      defaultValue: 'developer',
      comment: 'Team role'
    },
    team: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Team or department name'
    },
    seniority: {
      type: DataTypes.ENUM('junior', 'mid', 'senior', 'staff', 'principal'),
      allowNull: true,
      comment: 'Seniority level'
    },
    specialization: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Areas of specialization (frontend, backend, devops, etc.)'
    },
    skills: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Technical skills and proficiency levels'
    },
    timezone: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Team member timezone'
    },
    workingHours: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Working hours schedule'
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the team member joined'
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When the team member left (if applicable)'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether the team member is currently active'
    },
    // Performance tracking
    performanceGoals: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Performance goals and targets'
    },
    lastPerformanceReview: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date of last performance review'
    },
    // Preferences and settings
    notificationPreferences: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Notification and alert preferences'
    },
    dashboardSettings: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Personal dashboard configuration'
    }
  }, {
    tableName: 'team_members',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId']
      },
      {
        fields: ['role']
      },
      {
        fields: ['team']
      },
      {
        fields: ['seniority']
      },
      {
        fields: ['isActive']
      },
      {
        fields: ['startDate']
      },
      {
        fields: ['endDate']
      }
    ]
  });

  return TeamMember;
};