const express = require('express');
const { Op } = require('sequelize');
const { User, Repository, PullRequest, Review, Comment, Commit } = require('../models');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// GET /api/repository-analytics-graphql/:repositoryId/contributors - GraphQL-optimized analytics
router.get('/:repositoryId/contributors', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { startDate, endDate, after, maxPRs } = req.query;
    
    // Parse and validate dates
    const start = startDate ? moment(startDate).startOf('day').toDate() : moment().subtract(30, 'days').startOf('day').toDate();
    const end = endDate ? moment(endDate).endOf('day').toDate() : moment().endDate('day').toDate();
    
    console.log(`GraphQL Analytics - Processing repository: ${repositoryId}`);
    
    // Create GitHub API instance
    const GitHubAPI = require('../services/github/GitHubAPI');
    const githubAPI = new GitHubAPI(
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      process.env.GITHUB_ORGANIZATION
    );
    
    // First, get repository info directly from GitHub using the GraphQL repository ID
    let owner, repoName, repository;
    
    try {
      // Decode GitHub GraphQL Node ID to get numeric repository ID
      let numericGithubId;
      let decodingMethod = 'unknown';
      
      try {
        console.log(`Attempting to decode repository ID: ${repositoryId}`);
        
        // Method 1: Try direct base64 decoding for GraphQL Node IDs
        try {
          const decoded = Buffer.from(repositoryId, 'base64').toString('utf-8');
          console.log(`Base64 decoded result: ${decoded}`);
          
          // Look for various patterns
          const repositoryMatch = decoded.match(/Repository:(\d+)/);
          const numericMatch = decoded.match(/(\d+)/);
          
          if (repositoryMatch) {
            numericGithubId = parseInt(repositoryMatch[1]);
            decodingMethod = 'graphql_repository_pattern';
          } else if (numericMatch) {
            numericGithubId = parseInt(numericMatch[1]);
            decodingMethod = 'graphql_numeric_pattern';
          } else {
            throw new Error(`Unexpected decoded format: ${decoded}`);
          }
          
          console.log(`Successfully decoded using ${decodingMethod}: ${numericGithubId}`);
          
        } catch (base64Error) {
          console.log(`Base64 decoding failed: ${base64Error.message}`);
          
          // Method 2: Check if it's already a numeric ID
          if (!isNaN(repositoryId)) {
            numericGithubId = parseInt(repositoryId);
            decodingMethod = 'direct_numeric';
            console.log(`Using as direct numeric ID: ${numericGithubId}`);
          } else {
            // Method 3: For IDs like R_kgDOOGB-Yg, we might need to fetch from GitHub directly
            console.log('Neither base64 nor numeric, will try GitHub API lookup...');
            throw new Error('Need GitHub API lookup');
          }
        }
        
      } catch (decodeError) {
        console.log(`All decoding methods failed: ${decodeError.message}`);
        
        // If we can't decode the ID, we'll need to make a GitHub API call to get repository info
        // For now, let's try to use the GraphQL API directly with this Node ID
        console.log('Will attempt GitHub GraphQL lookup with original ID...');
        
        // Set a flag to indicate we need to use GitHub API
        numericGithubId = null;
        decodingMethod = 'requires_github_api';
      }
      
      console.log(`Decoded GitHub Repository ID: ${numericGithubId} (method: ${decodingMethod})`);
      
      let dbRepo = null;
      
      // Try to find it in our database using the numeric GitHub ID (if we have it)
      if (numericGithubId) {
        dbRepo = await Repository.findOne({
          where: { githubId: numericGithubId, isActive: true },
          attributes: ['id', 'name', 'fullName', 'description', 'language']
        });
        console.log(`Database lookup result: ${dbRepo ? 'Found' : 'Not found'}`);
      }
      
      // If we decoded successfully but didn't find in DB, try another database lookup
      if (!dbRepo && numericGithubId) {
        console.log(`Repository with githubId ${numericGithubId} not found in database, will proceed with GitHub API lookup.`);
      }
      
      if (dbRepo) {
        // Found in database - use that info
        [owner, repoName] = dbRepo.fullName.split('/');
        repository = {
          id: dbRepo.id,
          name: dbRepo.name,
          fullName: dbRepo.fullName,
          description: dbRepo.description,
          language: dbRepo.language
        };
        console.log(`GraphQL Analytics - Found repository in DB: ${repository.fullName}`);
      } else {
        // Not in database - try to get basic info from GitHub
        console.log(`GraphQL Analytics - Repository not in DB, trying GitHub API for: ${repositoryId}`);
        
        // Test GitHub API connectivity first
        try {
          const user = await githubAPI.getAuthenticatedUser();
          console.log(`✅ GitHub API connected as: ${user.login}`);
        } catch (apiError) {
          console.error(`❌ GitHub API connection failed:`, apiError.message);
        }
        
        // For GraphQL node IDs, we need a different approach
        // Let's get the repository info using the node ID directly
        // Validate node ID format (GitHub repository node IDs should start with R_)
        if (!repositoryId.startsWith('R_')) {
          console.warn(`⚠️ Repository ID '${repositoryId}' doesn't follow GitHub node ID format (should start with 'R_')`);
        }
        
        console.log(`🔍 Attempting GitHub GraphQL lookup for repository node ID: ${repositoryId}`);
        const repoInfo = await githubAPI.getRepositoryByNodeId(repositoryId);
        
        if (!repoInfo) {
          console.error(`❌ Repository lookup failed for node ID: ${repositoryId}`);
          
          // Try to list available repos from database for debugging
          const allRepos = await Repository.findAll({
            attributes: ['id', 'name', 'fullName', 'githubId'],
            limit: 10
          });
          
          console.log(`📋 Available repositories in database:`, allRepos.map(r => ({ 
            id: r.id, 
            githubId: r.githubId, 
            name: r.fullName 
          })));
          
          return res.status(404).json({
            error: 'Repository not found',
            debug: {
              requestedId: repositoryId,
              decodingAttempted: true,
              githubApiLookupFailed: true,
              availableRepos: allRepos.map(r => ({ 
                id: r.id, 
                githubId: r.githubId, 
                name: r.fullName 
              })),
              suggestion: 'Try using a repository ID from the available list above, or sync repositories first.',
              note: 'Repository not found in database or GitHub. This could mean: 1) Invalid node ID, 2) Token lacks access, 3) Repository is private/deleted.'
            }
          });
        }
        
        owner = repoInfo.owner.login;
        repoName = repoInfo.name;
        repository = {
          id: repoInfo.node_id,
          name: repoInfo.name,
          fullName: repoInfo.full_name,
          description: repoInfo.description,
          language: repoInfo.language
        };
        console.log(`GraphQL Analytics - Found repository on GitHub: ${repository.fullName}`);
      }
    } catch (dbError) {
      console.error('Error finding repository:', dbError.message);
      return res.status(404).json({
        error: 'Repository lookup failed',
        details: dbError.message
      });
    }
    
    
    try {
      console.log(`GraphQL Analytics - Fetching data for: ${owner}/${repoName}`);
      
      // Method 1: Use GraphQL for comprehensive data with pagination
      const repoData = await githubAPI.getRepositoryAnalyticsGraphQL(owner, repoName, {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        after: after || null,
        maxPRs: maxPRs ? parseInt(maxPRs) : 25
      });
      
      // Method 2: Get pre-calculated contributor statistics (1 API call)
      const contributorStats = await githubAPI.getContributorStats(owner, repoName);
      
      // Process the GraphQL data to match our analytics format
      const contributorMap = new Map();
      
      // Initialize contributors from collaborators
      repoData.collaborators.nodes.forEach(collaborator => {
        contributorMap.set(collaborator.login, {
          contributor: {
            username: collaborator.login,
            name: collaborator.name,
            avatarUrl: collaborator.avatarUrl,
            email: collaborator.email
          },
          stats: {
            pullRequests: { opened: 0, merged: 0, closed: 0, mergeRate: '0.0' },
            linesOfCode: { added: 0, removed: 0, net: 0 },
            reviews: { given: 0, received: 0 },
            commits: { total: 0 }
          },
          pullRequests: []
        });
      });
      
      // Process pull requests and calculate stats
      repoData.pullRequests.nodes.forEach(pr => {
        const authorLogin = pr.author?.login;
        if (!authorLogin) return;
        
        // Ensure contributor exists in map
        if (!contributorMap.has(authorLogin)) {
          contributorMap.set(authorLogin, {
            contributor: {
              username: authorLogin,
              name: pr.author.name,
              avatarUrl: pr.author.avatarUrl,
              email: null
            },
            stats: {
              pullRequests: { opened: 0, merged: 0, closed: 0, mergeRate: '0.0' },
              linesOfCode: { added: 0, removed: 0, net: 0 },
              reviews: { given: 0, received: 0 },
              commits: { total: 0 }
            },
            pullRequests: []
          });
        }
        
        const contributor = contributorMap.get(authorLogin);
        
        // Filter by date range
        const prCreatedAt = new Date(pr.createdAt);
        if (prCreatedAt >= start && prCreatedAt <= end) {
          // Update PR stats
          contributor.stats.pullRequests.opened++;
          if (pr.state === 'MERGED') {
            contributor.stats.pullRequests.merged++;
          } else if (pr.state === 'CLOSED') {
            contributor.stats.pullRequests.closed++;
          }
          
          // Update line stats
          contributor.stats.linesOfCode.added += pr.additions || 0;
          contributor.stats.linesOfCode.removed += pr.deletions || 0;
          
          // Count reviews received on this PR
          contributor.stats.reviews.received += pr.reviews.totalCount || 0;
          
          // Add to PR list with proper counts
          contributor.pullRequests.push({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            state: pr.state,
            merged: pr.state === 'MERGED',
            additions: pr.additions || 0,
            deletions: pr.deletions || 0,
            reviewsCount: pr.reviews.totalCount || 0,
            commentsCount: (pr.comments.totalCount || 0) + 
                          (pr.reviews.nodes.reduce((sum, review) => sum + (review.comments.totalCount || 0), 0)),
            commitsCount: pr.commits.totalCount || 0,
            createdAt: pr.createdAt,
            mergedAt: pr.mergedAt,
            closedAt: pr.closedAt,
            htmlUrl: pr.url
          });
        }
        
        // Count reviews given by each contributor (across all PRs)
        pr.reviews.nodes.forEach(review => {
          const reviewerLogin = review.author?.login;
          if (reviewerLogin && contributorMap.has(reviewerLogin)) {
            const reviewSubmittedAt = new Date(review.submittedAt);
            if (reviewSubmittedAt >= start && reviewSubmittedAt <= end) {
              contributorMap.get(reviewerLogin).stats.reviews.given++;
            }
          }
        });
      });
      
      // Add commit data from Statistics API
      if (contributorStats && Array.isArray(contributorStats)) {
        contributorStats.forEach(stat => {
          const login = stat.author?.login;
          if (login && contributorMap.has(login)) {
            // Filter weeks within date range and sum commits
            const filteredWeeks = stat.weeks.filter(week => {
              const weekDate = new Date(week.w * 1000);
              return weekDate >= start && weekDate <= end;
            });
            
            const totalCommits = filteredWeeks.reduce((sum, week) => sum + week.c, 0);
            contributorMap.get(login).stats.commits.total = totalCommits;
          }
        });
      }
      
      // Calculate merge rates
      contributorMap.forEach(contributor => {
        const { opened, merged } = contributor.stats.pullRequests;
        contributor.stats.pullRequests.mergeRate = opened > 0 ? 
          ((merged / opened) * 100).toFixed(1) : '0.0';
        
        contributor.stats.linesOfCode.net = 
          contributor.stats.linesOfCode.added - contributor.stats.linesOfCode.removed;
      });
      
      // Convert to array and sort by activity
      const contributors = Array.from(contributorMap.values())
        .filter(c => c.stats.pullRequests.opened > 0 || c.stats.commits.total > 0)
        .sort((a, b) => {
          const aActivity = a.stats.pullRequests.opened + a.stats.commits.total;
          const bActivity = b.stats.pullRequests.opened + b.stats.commits.total;
          return bActivity - aActivity;
        });
      
      // Calculate summary
      const summary = {
        totalPRs: contributors.reduce((sum, c) => sum + c.stats.pullRequests.opened, 0),
        totalMerged: contributors.reduce((sum, c) => sum + c.stats.pullRequests.merged, 0),
        totalCommits: contributors.reduce((sum, c) => sum + c.stats.commits.total, 0),
        totalLinesAdded: contributors.reduce((sum, c) => sum + c.stats.linesOfCode.added, 0),
        totalLinesRemoved: contributors.reduce((sum, c) => sum + c.stats.linesOfCode.removed, 0),
        totalReviews: contributors.reduce((sum, c) => sum + c.stats.reviews.given, 0)
      };
      
      res.json({
        repository: {
          id: repository.id,
          name: repository.name,
          fullName: repository.fullName,
          description: repository.description,
          language: repository.language
        },
        dateRange: { start, end },
        totalContributors: contributors.length,
        contributors,
        summary,
        apiCallsUsed: 2,
        optimizationNote: 'Real-time GitHub data via GraphQL (2 API calls)'
      });
      
    } catch (graphqlError) {
      console.error('GraphQL analytics failed:', {
        error: graphqlError.message,
        stack: graphqlError.stack,
        repository: repository.fullName,
        owner,
        repoName
      });
      logger.error('GraphQL analytics failed:', graphqlError.message);
      throw graphqlError;
    }
    
  } catch (error) {
    const { repositoryId } = req.params; // Re-extract to ensure it's available
    console.error('Error fetching GraphQL repository analytics:', {
      error: error.message,
      stack: error.stack,
      repositoryId,
      repository: typeof repository !== 'undefined' && repository ? repository.fullName : 'NOT FOUND'
    });
    logger.error('Error fetching GraphQL repository analytics:', error.message);
    res.status(500).json({
      error: 'Failed to fetch repository analytics',
      details: error.message,
      repositoryId,
      repository: typeof repository !== 'undefined' && repository ? repository.fullName : 'NOT FOUND'
    });
  }
});

module.exports = router;