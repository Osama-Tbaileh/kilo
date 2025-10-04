const express = require('express');
const router = express.Router();
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const GitHubAPI = require('../services/github/GitHubAPI');
const moment = require('moment');

// Initialize GitHub API with proper authentication
const githubAPI = new GitHubAPI(
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
  process.env.GITHUB_ORGANIZATION
);

// GET /api/contributor-analytics-graphql/:username
router.get('/:username', verifyToken, loadUser, async (req, res) => {
  try {
    const { username } = req.params;
    const { startDate, endDate, searchTerm, page = 1 } = req.query;
    
    console.log(`📊 Fetching contributor analytics for: ${username}`);
    console.log(`📅 Date range: ${startDate} to ${endDate}`);
    console.log(`🔍 Search term: ${searchTerm || 'none'}`);
    console.log(`📄 Page: ${page}`);

    // We'll get contributor info from the PR data instead of fetching profile first
    let contributor = null;

    // Build GraphQL query for PRs
    let searchQuery = `author:${username} type:pr`;
    
    // Add date range if provided (include full days like RepositoryAnalyticsPage)
    if (startDate && endDate) {
      const start = moment(startDate).startOf('day').format('YYYY-MM-DD');
      const end = moment(endDate).endOf('day').format('YYYY-MM-DD');
      searchQuery += ` created:${start}..${end}`;
    }
    
    // Add search term if provided
    if (searchTerm) {
      searchQuery += ` ${searchTerm}`;
    }

    // Determine organization from user's current auth context
    const orgName = req.user?.organization || 'defaultorg'; // Fallback to a default
    if (orgName !== 'defaultorg') {
      searchQuery += ` org:${orgName}`;
    }

    console.log(`🔍 GraphQL search query: ${searchQuery}`);

    const itemsPerPage = 20;
    const after = page > 1 ? Buffer.from(`cursor${(page - 1) * itemsPerPage}`).toString('base64') : null;

    const graphqlQuery = `
      query($searchQuery: String!, $first: Int!, $after: String) {
        search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          issueCount
          edges {
            node {
              ... on PullRequest {
                id
                number
                title
                url
                state
                merged
                createdAt
                updatedAt
                closedAt
                mergedAt
                author {
                  login
                  avatarUrl
                }
                repository {
                  name
                  owner {
                    login
                  }
                }
                additions
                deletions
                changedFiles
                reviews(first: 50) {
                  totalCount
                  nodes {
                    id
                    state
                    author {
                      login
                    }
                    body
                    comments(first: 20) {
                      totalCount
                      nodes {
                        body
                      }
                    }
                  }
                }
                comments(first: 50) {
                  totalCount
                  nodes {
                    body
                    author {
                      login
                    }
                  }
                }
                commits(first: 50) {
                  totalCount
                  nodes {
                    commit {
                      message
                      author {
                        name
                        email
                      }
                    }
                  }
                }
                labels(first: 10) {
                  nodes {
                    name
                    color
                  }
                }
                assignees(first: 10) {
                  nodes {
                    login
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      searchQuery,
      first: itemsPerPage,
      after
    };

    console.log('🚀 Executing GraphQL query...');
    const response = await githubAPI.executeGraphQLQuery(graphqlQuery, variables);
    
    if (!response || !response.search) {
      console.error('❌ Invalid GraphQL response structure');
      return res.status(500).json({ 
        error: 'Invalid response from GitHub GraphQL API' 
      });
    }

    const { search } = response;
    const pullRequests = search.edges.map(edge => edge.node);

    console.log(`📈 Found ${pullRequests.length} PRs for analysis`);
    
    // Extract contributor info from PR data if we have PRs
    if (pullRequests.length > 0) {
      const firstPR = pullRequests[0];
      contributor = {
        username: firstPR.author?.login || username,
        name: firstPR.author?.login || username, // Use login as name since name field doesn't exist on Actor
        email: null, // Not available in PR data
        avatarUrl: firstPR.author?.avatarUrl || `https://github.com/${username}.png`,
        bio: null, // Not available in PR data
        company: null, // Not available in PR data
        location: null, // Not available in PR data
        blog: null, // Not available in PR data
        twitterUsername: null, // Not available in PR data
        publicRepos: 0, // Not available in PR data
        followers: 0, // Not available in PR data
        following: 0, // Not available in PR data
        url: `https://github.com/${username}`
      };
      console.log(`✅ Extracted contributor info: ${contributor.name || contributor.username}`);
    } else {
      // No PRs found - create basic contributor info
      contributor = {
        username: username,
        name: username,
        email: null,
        avatarUrl: `https://github.com/${username}.png`,
        bio: null,
        company: null,
        location: null,
        blog: null,
        twitterUsername: null,
        publicRepos: 0,
        followers: 0,
        following: 0,
        url: `https://github.com/${username}`
      };
      console.log(`ℹ️ No PRs found, using basic contributor info for: ${username}`);
    }

    // Calculate statistics
    const stats = {
      totalPRs: search.issueCount,
      openPRs: pullRequests.filter(pr => pr.state === 'OPEN').length,
      closedPRs: pullRequests.filter(pr => pr.state === 'CLOSED').length,
      mergedPRs: pullRequests.filter(pr => pr.state === 'MERGED').length,
      totalCommits: pullRequests.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0),
      // Frontend also expects 'commits' field
      commits: pullRequests.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0),
      // Frontend expects these field names
      linesAdded: pullRequests.reduce((sum, pr) => sum + (pr.additions || 0), 0),
      linesDeleted: pullRequests.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
      changedFiles: pullRequests.reduce((sum, pr) => sum + (pr.changedFiles || 0), 0),
      // Calculate unique repositories
      repositories: new Set(pullRequests.map(pr => pr.repository?.name)).size,
    };

    // Calculate reviews received (reviews on this contributor's PRs)
    stats.reviewsReceived = pullRequests.reduce((sum, pr) => {
      return sum + (pr.reviews?.totalCount || 0);
    }, 0);
    
    // Frontend also expects totalReviews as a fallback
    stats.totalReviews = stats.reviewsReceived;

    // Calculate reviews given (TODO: requires searching all PRs for reviews by this user)
    // For now, set to 0 as this requires a separate GraphQL query
    stats.reviewsGiven = 0;

    // Calculate discussions (PR comments + review comments + review body comments)
    stats.totalDiscussions = pullRequests.reduce((sum, pr) => {
      let prTotal = 0;
      
      // PR comments
      prTotal += pr.comments?.totalCount || 0;
      
      // Review line comments and review body comments
      if (pr.reviews?.nodes) {
        prTotal += pr.reviews.nodes.reduce((reviewSum, review) => {
          let reviewTotal = 0;
          
          // Review body comment (if review has body)
          if (review.body && review.body.trim()) {
            reviewTotal += 1;
          }
          
          // Review line comments
          reviewTotal += review.comments?.totalCount || 0;
          
          return reviewSum + reviewTotal;
        }, 0);
      }
      
      return sum + prTotal;
    }, 0);

    // Pagination info
    const pagination = {
      currentPage: parseInt(page),
      hasNextPage: search.pageInfo.hasNextPage,
      hasPreviousPage: search.pageInfo.hasPreviousPage,
      totalItems: search.issueCount,
      itemsPerPage,
      totalPages: Math.ceil(search.issueCount / itemsPerPage)
    };

    console.log(`✅ Analysis complete - ${stats.totalPRs} PRs, ${stats.reviewsReceived} reviews received`);

    res.json({
      success: true,
      contributor,
      pullRequests,
      stats,
      pagination,
      searchQuery
    });

  } catch (error) {
    console.error('❌ Error in contributor GraphQL analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch contributor analytics',
      details: error.message
    });
  }
});

module.exports = router;
