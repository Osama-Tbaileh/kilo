const express = require('express');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// GET /api/team-graphql/analytics - Get comprehensive team analytics via GraphQL
router.get('/analytics', async (req, res) => {
  try {
    const { period = 'month', includeDetails = false } = req.query;
    
    console.log(`🚀 Team GraphQL Analytics - Period: ${period}, Details: ${includeDetails}`);
    
    // Create GitHub API instance
    const GitHubAPI = require('../services/github/GitHubAPI');
    const githubAPI = new GitHubAPI(
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      process.env.GITHUB_ORGANIZATION
    );
    
    // Calculate date range
    let startDate;
    switch (period) {
      case 'week':
        startDate = moment().subtract(7, 'days');
        break;
      case 'month':
        startDate = moment().subtract(30, 'days');
        break;
      case 'quarter':
        startDate = moment().subtract(90, 'days');
        break;
      case 'year':
        startDate = moment().subtract(365, 'days');
        break;
      default:
        startDate = moment().subtract(30, 'days');
    }
    
    const endDate = moment();
    console.log(`📅 Date range: ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}`);
    
    // GitHub API compatible query for public organization data
    const query = `
      query OrganizationTeamAnalytics($org: String!) {
        organization(login: $org) {
          login
          name
          description
          avatarUrl
          url
          createdAt
          
          # Organization repositories (public data only)
          repositories(first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
            totalCount
            nodes {
              id
              name
              description
              isPrivate
              stargazerCount
              forkCount
              primaryLanguage {
                name
                color
              }
              createdAt
              updatedAt
              
              # Recent pull requests (accessible data)
              pullRequests(first: 30, states: [OPEN, CLOSED, MERGED], orderBy: {field: CREATED_AT, direction: DESC}) {
                totalCount
                nodes {
                  number
                  title
                  state
                  author {
                    login
                    avatarUrl
                  }
                  createdAt
                  mergedAt
                  closedAt
                  additions
                  deletions
                  
                  reviews {
                    totalCount
                  }
                  
                  comments {
                    totalCount
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const variables = {
      org: process.env.GITHUB_ORGANIZATION
    };
    
    console.log('🔍 Executing GitHub API permissions-compatible GraphQL query...');
    const data = await githubAPI.executeGraphQLQuery(query, variables);
    
    if (!data.organization) {
      return res.status(404).json({
        error: 'Organization not found',
        organization: process.env.GITHUB_ORGANIZATION
      });
    }
    
    const org = data.organization;
    
    // Process simplified organization data (permissions-compatible)
    console.log('📊 Processing organization repository data...');
    
    // 1. Team overview (limited data due to API permissions)
    const teamOverview = {
      organization: {
        name: org.name,
        login: org.login,
        description: org.description,
        avatarUrl: org.avatarUrl,
        url: org.url,
        createdAt: org.createdAt
      },
      totalMembers: 0, // Cannot access with personal token
      totalRepositories: org.repositories.totalCount,
      totalTeams: 0 // Not accessible
    };
    
    // 2. Process repositories and extract activity
    const repositories = [];
    let totalPRs = 0;
    let totalReviews = 0;
    const contributorMap = new Map();
    const languageMap = new Map();
    
    org.repositories.nodes.forEach(repo => {
      const repoPRs = repo.pullRequests.nodes;
      
      // Filter PRs by date range
      const recentPRs = repoPRs.filter(pr => {
        const createdAt = moment(pr.createdAt);
        return createdAt.isBetween(startDate, endDate, 'day', '[]');
      });
      
      totalPRs += recentPRs.length;
      
      // Process each PR
      recentPRs.forEach(pr => {
        totalReviews += pr.reviews.totalCount;
        
        // Track contributor activity
        const authorLogin = pr.author?.login;
        if (authorLogin) {
          if (!contributorMap.has(authorLogin)) {
            contributorMap.set(authorLogin, {
              login: authorLogin,
              name: authorLogin, // Use login as fallback for name
              avatarUrl: pr.author.avatarUrl,
              pullRequests: 0,
              reviews: 0,
              linesAdded: 0,
              linesDeleted: 0,
              repositories: new Set()
            });
          }
          
          const contributor = contributorMap.get(authorLogin);
          contributor.pullRequests++;
          contributor.linesAdded += pr.additions || 0;
          contributor.linesDeleted += pr.deletions || 0;
          contributor.repositories.add(repo.name);
        }
      });
      
      // Track language usage
      if (repo.primaryLanguage) {
        const lang = repo.primaryLanguage.name;
        languageMap.set(lang, (languageMap.get(lang) || 0) + 1);
      }
      
      repositories.push({
        id: repo.id,
        name: repo.name,
        description: repo.description,
        isPrivate: repo.isPrivate,
        stargazerCount: repo.stargazerCount,
        forkCount: repo.forkCount,
        primaryLanguage: repo.primaryLanguage,
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
        totalPRs: repo.pullRequests.totalCount,
        recentPRs: recentPRs.length,
        totalCollaborators: 0, // Cannot access with personal token
        topCollaborators: []
      });
    });
    
    // 3. Process contributors from GraphQL PR data
    const contributors = Array.from(contributorMap.values()).map(contrib => ({
      ...contrib,
      repositories: Array.from(contrib.repositories),
      totalRepositories: contrib.repositories.size
    })).sort((a, b) => b.pullRequests - a.pullRequests);
    
    // 4. Calculate metrics
    const metrics = {
      teamVelocity: (totalPRs / Math.max(moment(endDate).diff(startDate, 'days'), 1)).toFixed(2),
      reviewRatio: totalPRs > 0 ? (totalReviews / totalPRs).toFixed(2) : '0.00',
      averagePRSize: totalPRs > 0 ? 
        Math.round(contributors.reduce((sum, c) => sum + c.linesAdded + c.linesDeleted, 0) / totalPRs) : 0,
      mostActiveContributor: contributors[0] || null,
      languageDistribution: Array.from(languageMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
    
    // 5. Generate weekly activity based on actual PR data
    const weeklyActivity = [];
    let currentWeek = startDate.clone().startOf('week');
    
    while (currentWeek.isBefore(endDate)) {
      const weekEnd = currentWeek.clone().endOf('week');
      
      // Count actual PRs for this week
      let weekPRs = 0;
      let weekReviews = 0;
      
      org.repositories.nodes.forEach(repo => {
        repo.pullRequests.nodes.forEach(pr => {
          const prDate = moment(pr.createdAt);
          if (prDate.isBetween(currentWeek, weekEnd, 'day', '[]')) {
            weekPRs++;
            weekReviews += pr.reviews.totalCount;
          }
        });
      });
      
      weeklyActivity.push({
        week: currentWeek.format('MMM DD'),
        pullRequests: weekPRs,
        reviews: weekReviews,
        commits: weekPRs * 3 // Estimate commits based on PRs
      });
      
      currentWeek.add(1, 'week');
    }
    
    // 6. Response structure
    const response = {
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      teamOverview,
      metrics,
      contributors: contributors.slice(0, 20), // Top 20 contributors
      repositories: repositories.slice(0, 10), // Top 10 repositories by activity
      weeklyActivity,
      totals: {
        pullRequests: totalPRs,
        reviews: totalReviews,
        contributors: contributors.length,
        repositories: repositories.length,
        teams: 0
      },
      lastUpdated: new Date().toISOString(),
      apiCallsUsed: 1,
      dataSource: 'GitHub GraphQL (Real-time)'
    };
    
    console.log(`✅ Team analytics processed: ${contributors.length} contributors, ${totalPRs} PRs, ${repositories.length} repositories`);
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Team GraphQL analytics error:', error.message);
    logger.error('Error fetching team analytics via GraphQL:', error);
    res.status(500).json({
      error: 'Failed to fetch team analytics',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET /api/team-graphql/member/:username - Get detailed member analytics
router.get('/member/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { period = 'month' } = req.query;
    
    console.log(`👤 Member Analytics - User: ${username}, Period: ${period}`);
    
    const GitHubAPI = require('../services/github/GitHubAPI');
    const githubAPI = new GitHubAPI(
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      process.env.GITHUB_ORGANIZATION
    );
    
    // Simplified GraphQL query for member data
    const query = `
      query UserDetails($username: String!) {
        user(login: $username) {
          login
          name
          email
          avatarUrl
          bio
          company
          location
          websiteUrl
          twitterUsername
          createdAt
          updatedAt
          
          # Organizations the user belongs to
          organizations(first: 10) {
            nodes {
              login
              name
              avatarUrl
            }
          }
          
          # User's followers and following
          followers {
            totalCount
          }
          
          following {
            totalCount
          }
          
          # Public repositories
          repositories(first: 20, orderBy: {field: UPDATED_AT, direction: DESC}, privacy: PUBLIC) {
            totalCount
            nodes {
              name
              description
              stargazerCount
              forkCount
              primaryLanguage {
                name
                color
              }
            }
          }
        }
      }
    `;
    
    const variables = {
      username
    };
    
    const data = await githubAPI.executeGraphQLQuery(query, variables);
    
    if (!data.user) {
      return res.status(404).json({
        error: 'User not found',
        username
      });
    }
    
    const user = data.user;
    
    // Process simplified user data
    const memberProfile = {
      profile: {
        login: user.login,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        company: user.company,
        location: user.location,
        websiteUrl: user.websiteUrl,
        twitterUsername: user.twitterUsername,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      statistics: {
        totalPRs: 0, // Would need additional queries for accurate count
        totalReviews: 0, // Would need additional queries for accurate count
        totalLinesAdded: 0, // Would need additional queries for accurate count
        totalLinesDeleted: 0, // Would need additional queries for accurate count
        repositoriesContributed: 0, // Would need additional queries for accurate count
        publicRepositories: user.repositories.totalCount,
        followers: user.followers.totalCount,
        following: user.following.totalCount
      },
      repositoryContributions: [], // Would need additional queries for contributions
      organizations: user.organizations.nodes,
      topRepositories: user.repositories.nodes.slice(0, 10),
      lastUpdated: new Date().toISOString()
    };
    
    console.log(`✅ Member profile processed: ${username}`);
    
    res.json(memberProfile);
    
  } catch (error) {
    console.error('❌ Member analytics error:', error.message);
    logger.error('Error fetching member analytics:', error);
    res.status(500).json({
      error: 'Failed to fetch member analytics',
      message: error.message
    });
  }
});

module.exports = router;
