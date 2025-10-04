const axios = require('axios');
const logger = require('../../utils/logger');

class GitHubAPI {
  constructor(token, organization) {
    this.token = token;
    this.organization = organization;
    this.baseURL = 'https://api.github.com';
    this.graphqlURL = 'https://api.github.com/graphql';
    
    // Create axios instance with default headers
    this.api = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-Team-Insights/1.0'
      }
    });

    // Create GraphQL axios instance
    this.graphql = axios.create({
      baseURL: this.graphqlURL,
      headers: {
        'Authorization': `bearer ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'GitHub-Team-Insights/1.0'
      }
    });

    // Rate limiting tracking
    this.rateLimitRemaining = 5000;
    this.rateLimitReset = Date.now();
    
    // Setup response interceptors for rate limiting
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor for rate limiting
    this.api.interceptors.request.use(async (config) => {
      await this.checkRateLimit();
      return config;
    });

    // Response interceptor to track rate limits
    this.api.interceptors.response.use(
      (response) => {
        this.updateRateLimitInfo(response.headers);
        return response;
      },
      (error) => {
        if (error.response) {
          this.updateRateLimitInfo(error.response.headers);
          
          // Handle rate limit exceeded
          if (error.response.status === 403 && 
              error.response.headers['x-ratelimit-remaining'] === '0') {
            logger.warn('GitHub API rate limit exceeded');
            throw new Error('GitHub API rate limit exceeded');
          }
        }
        throw error;
      }
    );

    // Similar interceptors for GraphQL
    this.graphql.interceptors.request.use(async (config) => {
      await this.checkRateLimit();
      return config;
    });

    this.graphql.interceptors.response.use(
      (response) => {
        this.updateRateLimitInfo(response.headers);
        return response;
      },
      (error) => {
        if (error.response) {
          this.updateRateLimitInfo(error.response.headers);
        }
        throw error;
      }
    );
  }

  updateRateLimitInfo(headers) {
    if (headers['x-ratelimit-remaining']) {
      this.rateLimitRemaining = parseInt(headers['x-ratelimit-remaining']);
    }
    if (headers['x-ratelimit-reset']) {
      this.rateLimitReset = parseInt(headers['x-ratelimit-reset']) * 1000;
    }
  }

  async checkRateLimit() {
    if (this.rateLimitRemaining <= 10) {
      const waitTime = this.rateLimitReset - Date.now();
      if (waitTime > 0) {
        logger.warn(`Rate limit low (${this.rateLimitRemaining}), waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // Organization methods
  async getOrganization() {
    try {
      const response = await this.api.get(`/orgs/${this.organization}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching organization:', error.message);
      throw error;
    }
  }

  async getOrganizationMembers(page = 1, perPage = 100) {
    try {
      const response = await this.api.get(`/orgs/${this.organization}/members`, {
        params: { page, per_page: perPage }
      });
      return {
        data: response.data,
        hasMore: response.data.length === perPage,
        nextPage: page + 1
      };
    } catch (error) {
      logger.error('Error fetching organization members:', error.message);
      throw error;
    }
  }

  // Repository methods
  async getOrganizationRepositories(page = 1, perPage = 100) {
    try {
      const response = await this.api.get(`/orgs/${this.organization}/repos`, {
        params: { 
          page, 
          per_page: perPage,
          sort: 'updated',
          direction: 'desc'
        }
      });
      return {
        data: response.data,
        hasMore: response.data.length === perPage,
        nextPage: page + 1
      };
    } catch (error) {
      logger.error('Error fetching organization repositories:', error.message);
      throw error;
    }
  }

  async getRepository(owner, repo) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching repository ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  async getRepositoryByNodeId(nodeId) {
    try {
      const query = `
        query GetRepositoryByNodeId($nodeId: ID!) {
          node(id: $nodeId) {
            ... on Repository {
              id
              name
              nameWithOwner
              description
              primaryLanguage {
                name
              }
              owner {
                login
                avatarUrl
              }
              url
              stargazerCount
              forkCount
              isPrivate
              createdAt
              updatedAt
            }
          }
        }
      `;
      
      const response = await this.executeGraphQLQuery(query, { nodeId });
      
      if (!response.node) {
        return null;
      }
      
      // Convert GraphQL response to REST API format for compatibility
      const repo = response.node;
      return {
        id: repo.id,
        node_id: repo.id,
        name: repo.name,
        full_name: repo.nameWithOwner,
        description: repo.description,
        language: repo.primaryLanguage?.name,
        owner: repo.owner,
        html_url: repo.url,
        stargazers_count: repo.stargazerCount,
        forks_count: repo.forkCount,
        private: repo.isPrivate,
        created_at: repo.createdAt,
        updated_at: repo.updatedAt
      };
    } catch (error) {
      logger.error(`Error fetching repository by node ID ${nodeId}:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        stack: error.stack
      });
      console.error(`GraphQL Repository Lookup Failed for ${nodeId}:`, {
        errorType: error.constructor.name,
        message: error.message,
        status: error.response?.status,
        githubError: error.response?.data?.errors
      });
      return null;
    }
  }

  async getRepositoryLanguages(owner, repo) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/languages`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching repository languages ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  // Pull Request methods
  async getPullRequests(owner, repo, state = 'all', page = 1, perPage = 100) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/pulls`, {
        params: { 
          state, 
          page, 
          per_page: perPage,
          sort: 'updated',
          direction: 'desc'
        }
      });
      return {
        data: response.data,
        hasMore: response.data.length === perPage,
        nextPage: page + 1
      };
    } catch (error) {
      logger.error(`Error fetching pull requests for ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  async getPullRequest(owner, repo, pullNumber) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/pulls/${pullNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching pull request ${owner}/${repo}#${pullNumber}:`, error.message);
      throw error;
    }
  }

  async getPullRequestFiles(owner, repo, pullNumber, page = 1, perPage = 100) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/pulls/${pullNumber}/files`, {
        params: { page, per_page: perPage }
      });
      return {
        data: response.data,
        hasMore: response.data.length === perPage,
        nextPage: page + 1
      };
    } catch (error) {
      logger.error(`Error fetching PR files ${owner}/${repo}#${pullNumber}:`, error.message);
      throw error;
    }
  }

  // Review methods
  async getPullRequestReviews(owner, repo, pullNumber, page = 1, perPage = 100) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
        params: { page, per_page: perPage }
      });
      return {
        data: response.data,
        hasMore: response.data.length === perPage,
        nextPage: page + 1
      };
    } catch (error) {
      logger.error(`Error fetching PR reviews ${owner}/${repo}#${pullNumber}:`, error.message);
      throw error;
    }
  }

  async getReviewComments(owner, repo, pullNumber, page = 1, perPage = 100) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, {
        params: { page, per_page: perPage }
      });
      return {
        data: response.data,
        hasMore: response.data.length === perPage,
        nextPage: page + 1
      };
    } catch (error) {
      logger.error(`Error fetching review comments ${owner}/${repo}#${pullNumber}:`, error.message);
      throw error;
    }
  }

  // Issue/PR Comment methods
  async getIssueComments(owner, repo, issueNumber, page = 1, perPage = 100) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        params: { page, per_page: perPage }
      });
      return {
        data: response.data,
        hasMore: response.data.length === perPage,
        nextPage: page + 1
      };
    } catch (error) {
      logger.error(`Error fetching issue comments ${owner}/${repo}#${issueNumber}:`, error.message);
      throw error;
    }
  }

  // Commit methods
  async getCommits(owner, repo, since = null, until = null, page = 1, perPage = 100) {
    try {
      const params = { page, per_page: perPage };
      if (since) params.since = since;
      if (until) params.until = until;

      const response = await this.api.get(`/repos/${owner}/${repo}/commits`, { params });
      return {
        data: response.data,
        hasMore: response.data.length === perPage,
        nextPage: page + 1
      };
    } catch (error) {
      logger.error(`Error fetching commits for ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  async getCommit(owner, repo, sha) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/commits/${sha}`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching commit ${owner}/${repo}@${sha}:`, error.message);
      throw error;
    }
  }

  // User methods
  async getUser(username) {
    try {
      const response = await this.api.get(`/users/${username}`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching user ${username}:`, error.message);
      throw error;
    }
  }

  async getAuthenticatedUser() {
    try {
      const response = await this.api.get('/user');
      return response.data;
    } catch (error) {
      logger.error('Error fetching authenticated user:', error.message);
      throw error;
    }
  }

  // GraphQL methods for complex queries with retry logic
  async executeGraphQLQuery(query, variables = {}, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = (attempt) => Math.min(1000 * Math.pow(2, attempt), 8000); // Exponential backoff: 1s, 2s, 4s, 8s max
    
    try {
      // Add timeout to prevent hanging requests (25 seconds)
      const timeoutMs = 25000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('GraphQL query timeout after 25s')), timeoutMs)
      );
      
      const queryPromise = this.graphql.post('', {
        query,
        variables
      });
      
      const response = await Promise.race([queryPromise, timeoutPromise]);
      
      if (response.data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
      }
      
      return response.data.data;
    } catch (error) {
      // Check if it's a retryable error (502 Bad Gateway, 504 Gateway Timeout, timeouts, aborted)
      const isRetryableError = 
        (error.response && [502, 504].includes(error.response.status)) ||
        error.message?.includes('timeout') ||
        error.message?.includes('aborted') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';
      
      if (isRetryableError && retryCount < maxRetries) {
        const delay = retryDelay(retryCount);
        const errorType = error.response?.status || error.message || error.code || 'unknown';
        logger.warn(`GraphQL query failed (${errorType}), retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Recursive retry
        return this.executeGraphQLQuery(query, variables, retryCount + 1);
      }
      
      logger.error('Error executing GraphQL query:', error.message);
      throw error;
    }
  }

  // GitHub Statistics APIs for pre-calculated data
  async getRepositoryContributors(owner, repo, page = 1, perPage = 100) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/contributors`, {
        params: { page, per_page: perPage }
      });
      return {
        data: response.data,
        hasMore: response.data.length === perPage,
        nextPage: page + 1
      };
    } catch (error) {
      logger.error(`Error fetching repository contributors ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  async getContributorStats(owner, repo) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/stats/contributors`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching contributor stats ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  async getRepositoryCommitActivity(owner, repo) {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/stats/commit_activity`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching commit activity ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  // REST API method for date-filtered repository analytics (more efficient for date ranges)
  async getRepositoryAnalyticsREST(owner, repo, options = {}) {
    const { startDate, endDate, maxPRs = 100 } = options;
    
    try {
      logger.info(`Fetching date-filtered PRs via REST API: ${owner}/${repo}`);
      
      // Step 1: Get PRs with date filtering
      const pullsParams = {
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: Math.min(maxPRs, 100) // GitHub max per page is 100
      };
      
      // Add date filtering if provided
      if (startDate) {
        pullsParams.since = startDate; // ISO date string
      }
      
      const pullsResponse = await this.api.get(`/repos/${owner}/${repo}/pulls`, {
        params: pullsParams
      });
      
      let pullRequests = pullsResponse.data || [];
      
      // Step 2: Filter by endDate if provided (REST API only supports 'since', not 'until')
      if (endDate) {
        const endDateObj = new Date(endDate);
        pullRequests = pullRequests.filter(pr => {
          const prUpdated = new Date(pr.updated_at);
          return prUpdated <= endDateObj;
        });
      }
      
      logger.info(`📊 Found ${pullRequests.length} PRs in date range`);
      
      // Step 3: Get detailed data for each PR (reviews, comments, commits)
      const detailedPRs = await Promise.all(pullRequests.map(async (pr) => {
        try {
          // Get reviews
          const reviewsResponse = await this.api.get(`/repos/${owner}/${repo}/pulls/${pr.number}/reviews`);
          const reviews = reviewsResponse.data || [];
          
          // Get comments
          const commentsResponse = await this.api.get(`/repos/${owner}/${repo}/pulls/${pr.number}/comments`);
          const comments = commentsResponse.data || [];
          
          // Get commits
          const commitsResponse = await this.api.get(`/repos/${owner}/${repo}/pulls/${pr.number}/commits`);
          const commits = commitsResponse.data || [];
          
          // Transform to match GraphQL structure
          return {
            id: pr.node_id,
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state.toUpperCase(),
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            mergedAt: pr.merged_at,
            closedAt: pr.closed_at,
            additions: pr.additions || 0,
            deletions: pr.deletions || 0,
            changedFiles: pr.changed_files || 0,
            author: pr.user ? {
              login: pr.user.login,
              name: pr.user.name,
              avatarUrl: pr.user.avatar_url
            } : null,
            reviews: {
              totalCount: reviews.length,
              nodes: reviews.map(review => ({
                id: review.node_id,
                state: review.state,
                submittedAt: review.submitted_at,
                body: review.body,
                author: review.user ? {
                  login: review.user.login,
                  name: review.user.name,
                  avatarUrl: review.user.avatar_url
                } : null,
                comments: {
                  totalCount: 0, // Would need separate API call for review comments
                  nodes: []
                }
              }))
            },
            comments: {
              totalCount: comments.length,
              nodes: comments.map(comment => ({
                id: comment.node_id,
                body: comment.body,
                createdAt: comment.created_at,
                author: comment.user ? {
                  login: comment.user.login,
                  name: comment.user.name,
                  avatarUrl: comment.user.avatar_url
                } : null
              }))
            },
            commits: {
              totalCount: commits.length,
              nodes: commits.map(commit => ({
                commit: {
                  message: commit.commit.message,
                  committedDate: commit.commit.committer.date,
                  author: {
                    name: commit.commit.author.name,
                    email: commit.commit.author.email
                  }
                }
              }))
            }
          };
        } catch (error) {
          logger.error(`Error fetching detailed data for PR #${pr.number}:`, error.message);
          // Return basic PR data if detailed fetch fails
          return {
            id: pr.node_id,
            number: pr.number,
            title: pr.title,
            state: pr.state.toUpperCase(),
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            mergedAt: pr.merged_at,
            author: pr.user ? {
              login: pr.user.login,
              name: pr.user.name,
              avatarUrl: pr.user.avatar_url
            } : null,
            reviews: { totalCount: 0, nodes: [] },
            comments: { totalCount: 0, nodes: [] },
            commits: { totalCount: 0, nodes: [] }
          };
        }
      }));
      
      // Step 4: Get repository collaborators
      const collaboratorsResponse = await this.api.get(`/repos/${owner}/${repo}/collaborators`);
      const collaborators = (collaboratorsResponse.data || []).map(collab => ({
        login: collab.login,
        name: collab.name,
        avatarUrl: collab.avatar_url,
        url: collab.html_url
      }));
      
      // Step 5: Get repository info
      const repoResponse = await this.api.get(`/repos/${owner}/${repo}`);
      const repoData = repoResponse.data;
      
      return {
        repository: {
          name: repoData.name,
          description: repoData.description,
          stargazerCount: repoData.stargazers_count,
          forkCount: repoData.forks_count,
          primaryLanguage: repoData.language ? { name: repoData.language } : null
        },
        pullRequests: {
          totalCount: detailedPRs.length,
          nodes: detailedPRs
        },
        collaborators: {
          totalCount: collaborators.length,
          nodes: collaborators
        }
      };
      
    } catch (error) {
      logger.error(`Error fetching repository analytics via REST ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

    // GraphQL method for comprehensive repository analytics with proper date filtering
  async getRepositoryAnalyticsGraphQL(owner, repo, options = {}) {
    const { startDate, endDate, search, maxPRs = 30, after = null } = options;
    
    // Build search query with date filtering and search term
    let searchQuery = `repo:${owner}/${repo} is:pr`;
    
    // Add date filtering if provided (filter by PR creation date, not update date)
    if (startDate && endDate) {
      const startDateStr = new Date(startDate).toISOString().split('T')[0]; // YYYY-MM-DD
      const endDateStr = new Date(endDate).toISOString().split('T')[0];     // YYYY-MM-DD
      searchQuery += ` created:${startDateStr}..${endDateStr}`;
    }
    
    // Add search term if provided (search in title and description)
    if (search && search.trim()) {
      const searchTerm = search.trim();
      // Use GitHub's search syntax to search in title and body
      // GitHub search is case-insensitive by default, using partial matching
      searchQuery += ` ${searchTerm} in:title`;
    }
    
    // Debug: Log the search query being used
    console.log(`🔍 GraphQL search query: "${searchQuery}"`);
    
    // Build pagination cursor
    const afterCursor = after ? `, after: "${after}"` : '';
    
    const query = `
      query RepositoryAnalytics($owner: String!, $name: String!, $searchQuery: String!) {
        repository(owner: $owner, name: $name) {
          name
          description
          stargazerCount
          forkCount
          primaryLanguage {
            name
          }
          
          # Get all collaborators
          collaborators(first: 100) {
            totalCount
            nodes {
              login
              name
              avatarUrl
              url
            }
          }
        }
        
        # Date-filtered pull requests using search (30 PRs per request)
        search(query: $searchQuery, type: ISSUE, first: ${maxPRs}${afterCursor}) {
          issueCount
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          nodes {
            ... on PullRequest {
              id
              number
              title
              body
              state
              createdAt
              updatedAt
              mergedAt
              closedAt
              url
              permalink
              additions
              deletions
              changedFiles
              
              author {
                login
                ... on User {
                  name
                  avatarUrl
                }
              }
              
              # Get reviews (100 reviews per PR)
              reviews(first: 100) {
                totalCount
                nodes {
                  id
                  state
                  submittedAt
                  body
                  author {
                    login
                    ... on User {
                      name
                      avatarUrl
                    }
                  }
                  comments(first: 50) {
                    totalCount
                    nodes {
                      id
                      body
                      createdAt
                      author {
                        login
                        ... on User {
                          name
                          avatarUrl
                        }
                      }
                    }
                  }
                }
              }
              
              # Get general PR comments (100 comments per PR - GitHub's max limit)
              comments(first: 100) {
                totalCount
                nodes {
                  id
                  body
                  createdAt
                  author {
                    login
                    ... on User {
                      name
                      avatarUrl
                    }
                  }
                }
              }
              

              
              # Get commits (50 commits per PR)
              commits(first: 50) {
                totalCount
                nodes {
                  commit {
                    message
                    committedDate
                    author {
                      name
                      email
                    }
                  }
                }
              }
            }
          }
        }
      }`;
    
    try {
      const variables = { owner, name: repo, searchQuery };
      logger.info(`🔍 GraphQL search query: "${searchQuery}"`);
      
      const result = await this.executeGraphQLQuery(query, variables);
      
      // Transform search results to match expected structure
      return {
        repository: result.repository,
        pullRequests: {
          totalCount: result.search.issueCount,
          nodes: result.search.nodes || [],
          pageInfo: result.search.pageInfo
        },
        collaborators: result.repository.collaborators,
        pagination: {
          hasNextPage: result.search.pageInfo.hasNextPage,
          endCursor: result.search.pageInfo.endCursor,
          totalCount: result.search.issueCount
        }
      };
      
    } catch (error) {
      logger.error(`Error fetching repository analytics via GraphQL ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  // Legacy GraphQL method (keeping for "fetch all" without date filtering)  
  async getRepositoryAnalyticsGraphQLLegacy(owner, repo, options = {}) {
    const { maxPRs = 30, after = null } = options;
    
    // Build pagination cursor
    const afterCursor = after ? `, after: "${after}"` : '';

    const query = `
      query RepositoryAnalytics($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          name
          description
          stargazerCount
          forkCount
          primaryLanguage {
            name
          }
          
          # Paginated pull requests with COMPLETE data (no limits on nested data)
          pullRequests(first: ${maxPRs}, states: [OPEN, CLOSED, MERGED], orderBy: {field: UPDATED_AT, direction: DESC}${afterCursor}) {
            totalCount
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            nodes {
              id
              number
              title
              body
              state
              createdAt
              closedAt
              mergedAt
              mergeable
              url
              permalink
              additions
              deletions
              changedFiles
              
              # Author information
              author {
                login
                avatarUrl
                ... on User {
                name
                }
              }
              
              # Reviews (100 reviews per PR)
              reviews(first: 100) {
                totalCount
                nodes {
                  id
                  state
                  submittedAt
                  body
                  author {
                    login
                    avatarUrl
                    ... on User {
                    name
                  }
                  }
                  comments(first: 50) {
                    totalCount
                    nodes {
                      id
                      body
                      createdAt
                      author {
                        login
                      }
                    }
                  }
                }
              }
              
              # General PR comments (100 comments per PR - GitHub's max limit)
              comments(first: 100) {
                totalCount
                nodes {
                  id
                  body
                  createdAt
                  author {
                    login
                    avatarUrl
                    ... on User {
                    name
                  }
                }
              }
              }
              

              
              # Commits (50 commits per PR)
              commits(first: 50) {
                totalCount
                nodes {
                  commit {
                    oid
                    message
                    committedDate
                    author {
                      name
                      email
                      date
                    }
                    additions
                    deletions
                    changedFiles
                  }
                }
              }
            }
          }
          
          # ALL repository collaborators (GitHub's max limit)
          collaborators(first: 100) {
            totalCount
            nodes {
              login
              name
              avatarUrl
              email
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeGraphQLQuery(query, { owner, name: repo });
      const repoData = response.repository;
      
      // Return data with pagination info
      return {
        ...repoData,
        pagination: {
          hasNextPage: repoData.pullRequests.pageInfo.hasNextPage,
          endCursor: repoData.pullRequests.pageInfo.endCursor,
          totalCount: repoData.pullRequests.totalCount,
          currentPage: repoData.pullRequests.nodes.length,
          requestedCount: maxPRs
        }
      };
    } catch (error) {
      logger.error(`Error fetching repository analytics via GraphQL ${owner}/${repo}:`, error.message);
      throw error;
    }
  }

  // Rate limit info
  getRateLimitInfo() {
    return {
      remaining: this.rateLimitRemaining,
      reset: new Date(this.rateLimitReset),
      resetIn: Math.max(0, this.rateLimitReset - Date.now())
    };
  }
}

module.exports = GitHubAPI;