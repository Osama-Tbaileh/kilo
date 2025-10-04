const express = require('express');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');
const moment = require('moment');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(loadUser);

// GET /api/repository-analytics-graphql/:repositoryId/contributors - Real-time GitHub Analytics (No DB)
router.get('/:repositoryId/contributors', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { startDate, endDate, after, maxPRs, search } = req.query;
    
    // Parse and validate dates
    const start = startDate ? moment(startDate).startOf('day') : moment().subtract(30, 'days').startOf('day');
    const end = endDate ? moment(endDate).endOf('day') : moment().endOf('day');
    
    console.log(`🚀 Real-time GitHub Analytics - Repository: ${repositoryId}`);
    console.log(`📅 Date range: ${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')}`);
    
    // Create GitHub API instance
    const GitHubAPI = require('../services/github/GitHubAPI');
    const githubAPI = new GitHubAPI(
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      process.env.GITHUB_ORGANIZATION
    );
    
    // STEP 1: Verify GitHub API connection
    try {
      const user = await githubAPI.getAuthenticatedUser();
      console.log(`✅ GitHub API connected as: ${user.login}`);
    } catch (apiError) {
      console.error(`❌ GitHub API connection failed:`, apiError.message);
      return res.status(401).json({
        error: 'GitHub API authentication failed',
        message: 'Invalid or expired GitHub token'
      });
    }
    
    // STEP 2: Get repository info directly from GitHub
    console.log(`🔍 Fetching repository info from GitHub: ${repositoryId}`);
    const repoInfo = await githubAPI.getRepositoryByNodeId(repositoryId);
    
    if (!repoInfo) {
      console.error(`❌ Repository not found: ${repositoryId}`);
      return res.status(404).json({
        error: 'Repository not found',
        message: 'Repository does not exist or you do not have access to it',
        repositoryId: repositoryId
      });
    }
    
    const owner = repoInfo.owner.login;
    const repoName = repoInfo.name;
    
    console.log(`✅ Repository found: ${owner}/${repoName}`);
    
    // STEP 3: Fetch comprehensive repository analytics from GitHub
          console.log(`📊 Fetching repository analytics: ${owner}/${repoName}`);
      
      // Check if this is a "fetch all" request (ignores date range)
      const fetchAll = req.query.fetchAll === 'true';
      
      try {
        let repoData;
        
        if (fetchAll) {
          // Use legacy GraphQL method for "fetch all" - no date filtering, just pagination
          console.log('🔍 Using legacy GraphQL for all PRs (30 at a time)');
          repoData = await githubAPI.getRepositoryAnalyticsGraphQLLegacy(owner, repoName, {
            after: after || null,
            maxPRs: maxPRs ? parseInt(maxPRs) : 30
          });
        } else {
          // Use GraphQL search with date filtering for date range queries
          const searchInfo = search ? ` with search term: "${search}"` : '';
          console.log(`🔍 Using GraphQL search with date filtering: ${start.format('YYYY-MM-DD')} to ${end.format('YYYY-MM-DD')}${searchInfo}`);
          console.log(`🔍 Full query parameters:`, { startDate, endDate, search, after, maxPRs });
          repoData = await githubAPI.getRepositoryAnalyticsGraphQL(owner, repoName, {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            search: search || null,
            after: after || null,
            maxPRs: maxPRs ? parseInt(maxPRs) : 30
          });
        }
      
      // STEP 4: Process and format the response for frontend compatibility
      const pullRequests = repoData.pullRequests?.nodes || [];
      const collaborators = repoData.collaborators?.nodes || [];
      
      // Group PRs by author to create contributor data
      const contributorMap = new Map();
      
      // Initialize contributors from collaborators list
      collaborators.forEach(collab => {
        contributorMap.set(collab.login, {
          contributor: {
            id: collab.login,
            username: collab.login,
            name: collab.name || collab.login,
            avatarUrl: collab.avatarUrl
          },
          pullRequests: [],
          stats: {
            pullRequests: {
              opened: 0,
              merged: 0,
              mergeRate: 0
            },
            linesOfCode: {
              added: 0,
              removed: 0
            },
            reviews: {
              given: 0,
              received: 0
            },
            commits: {
              total: 0
            }
          }
        });
      });
      
      // Add PRs to contributors and calculate stats
      console.log(`🔍 Processing ${pullRequests.length} PRs for contributor assignment`);
      
      // Sample first 10 PRs to see their authors
      const samplePRs = pullRequests.slice(0, 10);
      console.log(`📋 Sample PR authors:`, samplePRs.map(pr => ({
        number: pr.number,
        title: pr.title?.substring(0, 40),
        author: pr.author?.login || 'NO_AUTHOR',
        authorName: pr.author?.name || 'NO_NAME'
      })));
      
      pullRequests.forEach(pr => {
        const authorLogin = pr.author?.login;
        if (authorLogin) {
          // Ensure contributor exists
          if (!contributorMap.has(authorLogin)) {
            contributorMap.set(authorLogin, {
              contributor: {
                id: authorLogin,
                username: authorLogin,
                name: pr.author.name || authorLogin,
                avatarUrl: pr.author.avatarUrl
              },
              pullRequests: [],
              stats: {
                pullRequests: {
                  opened: 0,
                  merged: 0,
                  mergeRate: 0
                },
                linesOfCode: {
                  added: 0,
                  removed: 0
                },
                reviews: {
                  given: 0,
                  received: 0
                },
                commits: {
                  total: 0
                }
              }
            });
          }
          
          const contributor = contributorMap.get(authorLogin);
          
          // Add PR to contributor
          contributor.pullRequests.push(pr);
          
          // Update stats
          contributor.stats.pullRequests.opened++;
          if (pr.mergedAt) contributor.stats.pullRequests.merged++;
          contributor.stats.commits.total += pr.commits?.totalCount || 0;
          contributor.stats.linesOfCode.added += pr.additions || 0;
          contributor.stats.linesOfCode.removed += pr.deletions || 0;
          contributor.stats.reviews.received += pr.reviews?.totalCount || 0;
        }
      });
      
      console.log(`📊 Contributors created: ${contributorMap.size} total`);
      console.log(`📊 Contributor breakdown:`, Array.from(contributorMap.entries()).map(([login, data]) => ({
        login,
        prsCount: data.pullRequests.length,
        opened: data.stats.pullRequests.opened,
        commits: data.stats.commits.total
      })));
      
      // Calculate merge rates and reviews given for each contributor
      pullRequests.forEach(pr => {
        pr.reviews?.nodes?.forEach(review => {
          const reviewerLogin = review.author?.login;
          if (reviewerLogin && contributorMap.has(reviewerLogin)) {
            contributorMap.get(reviewerLogin).stats.reviews.given++;
          }
        });
      });
      
      // Convert map to array, calculate merge rates, and sort by PR count
      const contributors = Array.from(contributorMap.values())
        .filter(contrib => contrib.pullRequests.length > 0) // Only include contributors with PRs
        .map(contrib => {
          // Calculate merge rate
          if (contrib.stats.pullRequests.opened > 0) {
            contrib.stats.pullRequests.mergeRate = Math.round(
              (contrib.stats.pullRequests.merged / contrib.stats.pullRequests.opened) * 100
            );
          }
          return contrib;
        })
        .sort((a, b) => b.stats.pullRequests.opened - a.stats.pullRequests.opened);
      
      const response = {
        repository: {
          id: repoInfo.node_id,
          name: repoInfo.name,
          fullName: repoInfo.full_name,
          description: repoInfo.description,
          language: repoInfo.language,
          stargazerCount: repoInfo.stargazers_count,
          forkCount: repoInfo.forks_count,
          url: repoInfo.html_url
        },
        
        // Contributors with their PRs (frontend expected format)
        contributors: contributors,
        
        // Total contributors count
        totalContributors: contributors.length,
        
        // Pull requests with all nested data
        pullRequests: repoData.pullRequests,
        
        // Summary statistics (calculated from loaded PRs)
        summary: {
          totalPRs: pullRequests.length,
          totalMerged: pullRequests.filter(pr => pr.mergedAt).length,
          totalCommits: pullRequests.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0),
          totalLinesAdded: pullRequests.reduce((sum, pr) => sum + (pr.additions || 0), 0),
          totalLinesRemoved: pullRequests.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
          totalReviews: pullRequests.reduce((sum, pr) => sum + (pr.reviews?.totalCount || 0), 0)
        },
        
        // Pagination info
        pagination: repoData.pagination,
        
        // Meta information
        meta: {
          fetchedAt: new Date().toISOString(),
          dateRange: {
            start: start.format('YYYY-MM-DD'),
            end: end.format('YYYY-MM-DD')
          },
          source: 'real_time_github_api',
          approach: 'no_database_dependency'
        }
      };
      
      console.log(`✅ Analytics fetched successfully - ${response.summary.totalPRs} PRs loaded`);
      
      res.json(response);
      
    } catch (analyticsError) {
      console.error(`❌ Failed to fetch repository analytics:`, analyticsError.message);
      
      return res.status(500).json({
        error: 'Failed to fetch repository analytics',
        message: analyticsError.message,
        repository: `${owner}/${repoName}`,
        repositoryId: repositoryId
      });
    }
    
  } catch (error) {
    const { repositoryId } = req.params;
    console.error('❌ Repository analytics error:', {
      error: error.message,
      repositoryId,
      stack: error.stack
    });
    
    logger.error('Error fetching repository analytics:', error.message);
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process repository analytics request',
      repositoryId: repositoryId
    });
  }
});

module.exports = router;
