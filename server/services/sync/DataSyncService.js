const GitHubAPI = require('../github/GitHubAPI');
const { User, Repository, PullRequest, Review, Comment, Commit, TeamMember } = require('../../models');
const { Op } = require('sequelize');
const logger = require('../../utils/logger');
const moment = require('moment');

class DataSyncService {
  constructor() {
    this.githubAPI = new GitHubAPI(
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      process.env.GITHUB_ORGANIZATION
    );
    this.organization = process.env.GITHUB_ORGANIZATION;
    this.syncInProgress = false;
    this.lastSyncTime = null;
  }

  // Main sync method
  async syncAll(options = {}) {
    if (this.syncInProgress) {
      logger.warn('Sync already in progress, skipping...');
      return { success: false, message: 'Sync already in progress' };
    }

    this.syncInProgress = true;
    const startTime = Date.now();
    
    try {
      // Removed excessive logging for performance
      
      const results = {
        users: 0,
        repositories: 0,
        pullRequests: 0,
        reviews: 0,
        comments: 0,
        commits: 0,
        errors: []
      };

      // Sync organization members
      if (!options.skipUsers) {
        try {
          results.users = await this.syncOrganizationMembers();
        } catch (error) {
          logger.error('Error syncing users:', error.message);
          results.errors.push(`Users: ${error.message}`);
        }
      }

      // Sync repositories
      if (!options.skipRepositories) {
        try {
          results.repositories = await this.syncRepositories();
        } catch (error) {
          logger.error('Error syncing repositories:', error.message);
          results.errors.push(`Repositories: ${error.message}`);
        }
      }

      // Sync pull requests and related data
      if (!options.skipPullRequests) {
        try {
          const prResults = await this.syncPullRequestsForAllRepos(options);
          results.pullRequests = prResults.pullRequests;
          results.reviews = prResults.reviews;
          results.comments = prResults.comments;
          // Sync completed silently
        } catch (error) {
          logger.error('Error syncing pull requests:', error.message);
          results.errors.push(`Pull Requests: ${error.message}`);
        }
      }

      // Sync commits
      if (!options.skipCommits) {
        try {
          results.commits = await this.syncCommitsForAllRepos(options);
          // Commits synced silently
        } catch (error) {
          logger.error('Error syncing commits:', error.message);
          results.errors.push(`Commits: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;
      this.lastSyncTime = new Date();
      
      // Sync completed silently
      
      return {
        success: true,
        duration,
        results,
        timestamp: this.lastSyncTime
      };

    } catch (error) {
      logger.error('Full sync failed:', error.message);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  // Sync organization members
  async syncOrganizationMembers() {
    logger.info('Syncing organization members...');
    let totalSynced = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.githubAPI.getOrganizationMembers(page);
        
        for (const member of response.data) {
          try {
            // Get detailed user info
            const userDetails = await this.githubAPI.getUser(member.login);
            
            // Upsert user
            const [user, created] = await User.upsert({
              githubId: userDetails.id,
              username: userDetails.login,
              email: userDetails.email,
              name: userDetails.name,
              avatarUrl: userDetails.avatar_url,
              bio: userDetails.bio,
              company: userDetails.company,
              location: userDetails.location,
              blog: userDetails.blog,
              twitterUsername: userDetails.twitter_username,
              publicRepos: userDetails.public_repos,
              publicGists: userDetails.public_gists,
              followers: userDetails.followers,
              following: userDetails.following,
              githubCreatedAt: userDetails.created_at,
              githubUpdatedAt: userDetails.updated_at,
              isActive: true,
              lastSyncAt: new Date()
            });

            // Create team member record if it doesn't exist
            await TeamMember.findOrCreate({
              where: { userId: user.id },
              defaults: {
                userId: user.id,
                role: 'developer',
                isActive: true
              }
            });

            totalSynced++;
            
            if (created) {
              logger.info(`Created new user: ${userDetails.login}`);
            }
            
          } catch (userError) {
            logger.error(`Error syncing user ${member.login}:`, userError.message);
          }
        }

        hasMore = response.hasMore;
        page = response.nextPage;
        
        // Rate limiting delay
        await this.delay(100);
        
      } catch (error) {
        logger.error(`Error fetching members page ${page}:`, error.message);
        break;
      }
    }

    return totalSynced;
  }

  // Sync repositories
  async syncRepositories() {
    logger.info('Syncing repositories...');
    let totalSynced = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.githubAPI.getOrganizationRepositories(page);
        
        for (const repo of response.data) {
          try {
            // Get repository languages
            let languages = null;
            try {
              languages = await this.githubAPI.getRepositoryLanguages(repo.owner.login, repo.name);
            } catch (langError) {
              logger.warn(`Could not fetch languages for ${repo.full_name}:`, langError.message);
            }

            // Upsert repository
            await Repository.upsert({
              githubId: repo.id,
              name: repo.name,
              fullName: repo.full_name,
              description: repo.description,
              private: repo.private,
              fork: repo.fork,
              archived: repo.archived,
              disabled: repo.disabled,
              htmlUrl: repo.html_url,
              cloneUrl: repo.clone_url,
              sshUrl: repo.ssh_url,
              defaultBranch: repo.default_branch,
              language: repo.language,
              languages: languages,
              topics: repo.topics,
              size: repo.size,
              stargazersCount: repo.stargazers_count,
              watchersCount: repo.watchers_count,
              forksCount: repo.forks_count,
              openIssuesCount: repo.open_issues_count,
              hasIssues: repo.has_issues,
              hasProjects: repo.has_projects,
              hasWiki: repo.has_wiki,
              hasPages: repo.has_pages,
              hasDownloads: repo.has_downloads,
              githubCreatedAt: repo.created_at,
              githubUpdatedAt: repo.updated_at,
              githubPushedAt: repo.pushed_at,
              isActive: !repo.archived && !repo.disabled,
              lastSyncAt: new Date()
            });

            totalSynced++;
            
          } catch (repoError) {
            logger.error(`Error syncing repository ${repo.full_name}:`, repoError.message);
          }
        }

        hasMore = response.hasMore;
        page = response.nextPage;
        
        // Rate limiting delay
        await this.delay(100);
        
      } catch (error) {
        logger.error(`Error fetching repositories page ${page}:`, error.message);
        break;
      }
    }

    return totalSynced;
  }

  // Sync pull requests for all repositories
  async syncPullRequestsForAllRepos(options = {}) {
    logger.info('Syncing pull requests for all repositories...');
    
    const repositories = await Repository.findAll({
      where: { isActive: true },
      order: [['githubUpdatedAt', 'DESC']]
    });

    let totalPRs = 0;
    let totalReviews = 0;
    let totalComments = 0;

    for (const repo of repositories) {
      try {
        logger.info(`Syncing PRs for ${repo.fullName}...`);
        
        const results = await this.syncPullRequestsForRepo(repo, options);
        totalPRs += results.pullRequests;
        totalReviews += results.reviews;
        totalComments += results.comments;
        
        // Rate limiting delay between repositories
        await this.delay(200);
        
      } catch (error) {
        logger.error(`Error syncing PRs for ${repo.fullName}:`, error.message);
      }
    }

    return {
      pullRequests: totalPRs,
      reviews: totalReviews,
      comments: totalComments
    };
  }

  // Sync pull requests for a specific repository
  async syncPullRequestsForRepo(repository, options = {}) {
    const [owner, repoName] = repository.fullName.split('/');
    let totalPRs = 0;
    let totalReviews = 0;
    let totalComments = 0;
    let page = 1;
    let hasMore = true;

    // Determine date range for sync
    const since = options.since || moment().subtract(3, 'months').toDate();
    
    while (hasMore) {
      try {
        const response = await this.githubAPI.getPullRequests(owner, repoName, 'all', page);
        
        for (const pr of response.data) {
          try {
            // Skip if PR is too old (unless doing full sync)
            if (!options.fullSync && new Date(pr.updated_at) < since) {
              continue;
            }

            // Find or create author
            const author = await this.findOrCreateUserByLogin(pr.user.login);
            
            // Find assignee if exists
            let assignee = null;
            if (pr.assignee) {
              assignee = await this.findOrCreateUserByLogin(pr.assignee.login);
            }

            // Get detailed PR info if line counts are missing
            let detailedPR = pr;
            if (!pr.additions && !pr.deletions) {
              try {
                detailedPR = await this.githubAPI.getPullRequest(owner, repoName, pr.number);
              } catch (detailError) {
                logger.warn(`Could not get detailed PR info for #${pr.number}: ${detailError.message}`);
              }
            }

            // Upsert pull request
            const [pullRequest] = await PullRequest.upsert({
              githubId: pr.id,
              number: pr.number,
              title: pr.title,
              body: pr.body,
              state: pr.merged_at ? 'merged' : pr.state,
              draft: pr.draft,
              locked: pr.locked,
              htmlUrl: pr.html_url,
              diffUrl: pr.diff_url,
              patchUrl: pr.patch_url,
              issueUrl: pr.issue_url,
              authorId: author.id,
              assigneeId: assignee?.id,
              repositoryId: repository.id,
              baseBranch: pr.base.ref,
              headBranch: pr.head.ref,
              baseSha: pr.base.sha,
              headSha: pr.head.sha,
              mergeCommitSha: pr.merge_commit_sha,
              mergeable: pr.mergeable,
              mergeableState: pr.mergeable_state,
              merged: !!pr.merged_at,
              mergedAt: pr.merged_at,
              mergedBy: pr.merged_by ? (await this.findOrCreateUserByLogin(pr.merged_by.login)).id : null,
              closedAt: pr.closed_at,
              additions: detailedPR.additions || 0,
              deletions: detailedPR.deletions || 0,
              changedFiles: detailedPR.changed_files || 0,
              reviewsCount: 0, // Will be updated later
              commentsCount: 0, // Will be updated later
              commitsCount: 0, // Will be updated later
              labels: pr.labels,
              assignees: pr.assignees,
              requestedReviewers: pr.requested_reviewers,
              requestedTeams: pr.requested_teams,
              milestone: pr.milestone,
              githubCreatedAt: pr.created_at,
              githubUpdatedAt: pr.updated_at,
              reviewCycles: 0, // Will be calculated later
              lastSyncAt: new Date()
            });

            totalPRs++;

            // Sync reviews for this PR
            const reviewResults = await this.syncPullRequestReviews(repository, pullRequest, pr.number);
            totalReviews += reviewResults.reviews;

            // Sync comments for this PR
            const commentResults = await this.syncPullRequestComments(repository, pullRequest, pr.number);
            totalComments += commentResults.comments;

            // Count commits for this PR - use a more accurate approach
            // Get commits that are actually part of this PR by checking commit SHAs in PR
            let prCommitsCount = 0;
            try {
              // Try to get commits specifically for this PR
              const prCommitsResponse = await this.githubAPI.api.get(`/repos/${owner}/${repoName}/pulls/${pr.number}/commits`);
              prCommitsCount = prCommitsResponse.data.length;
            } catch (commitError) {
              // Fallback: count commits by author in PR timeframe
              prCommitsCount = await Commit.count({
                where: {
                  repositoryId: repository.id,
                  authorId: author.id,
                  authorDate: {
                    [Op.gte]: pr.created_at,
                    [Op.lte]: pr.merged_at || pr.closed_at || new Date()
                  }
                }
              });
            }

            // Count actual reviews (formal review submissions, not comments)
            const actualReviewsCount = await Review.count({
              where: { pullRequestId: pullRequest.id }
            });

            // Count all comments (review comments + issue comments)
            const actualCommentsCount = await Comment.count({
              where: { pullRequestId: pullRequest.id }
            });

            // Update PR with actual counts
            await PullRequest.update({
              reviewsCount: actualReviewsCount,
              commentsCount: actualCommentsCount,
              commitsCount: prCommitsCount
            }, {
              where: { id: pullRequest.id }
            });

            // Rate limiting delay
            await this.delay(50);
            
          } catch (prError) {
            logger.error(`Error syncing PR ${owner}/${repoName}#${pr.number}:`, prError.message);
          }
        }

        hasMore = response.hasMore;
        page = response.nextPage;
        
      } catch (error) {
        logger.error(`Error fetching PRs for ${owner}/${repoName} page ${page}:`, error.message);
        break;
      }
    }

    return {
      pullRequests: totalPRs,
      reviews: totalReviews,
      comments: totalComments
    };
  }

  // Sync reviews for a pull request
  async syncPullRequestReviews(repository, pullRequest, prNumber) {
    const [owner, repoName] = repository.fullName.split('/');
    let totalReviews = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.githubAPI.getPullRequestReviews(owner, repoName, prNumber, page);
        
        for (const review of response.data) {
          try {
            const reviewer = await this.findOrCreateUserByLogin(review.user.login);

            await Review.upsert({
              githubId: review.id,
              pullRequestId: pullRequest.id,
              reviewerId: reviewer.id,
              body: review.body,
              state: review.state,
              htmlUrl: review.html_url,
              pullRequestUrl: review.pull_request_url,
              commitId: review.commit_id,
              githubSubmittedAt: review.submitted_at,
              lastSyncAt: new Date()
            });

            totalReviews++;
            
          } catch (reviewError) {
            logger.error(`Error syncing review ${review.id}:`, reviewError.message);
          }
        }

        hasMore = response.hasMore;
        page = response.nextPage;
        
      } catch (error) {
        logger.error(`Error fetching reviews for ${owner}/${repoName}#${prNumber}:`, error.message);
        break;
      }
    }

    return { reviews: totalReviews };
  }

  // Sync comments for a pull request
  async syncPullRequestComments(repository, pullRequest, prNumber) {
    const [owner, repoName] = repository.fullName.split('/');
    let totalComments = 0;

    try {
      // Sync issue comments (general PR comments)
      const issueComments = await this.syncIssueComments(repository, pullRequest, prNumber);
      totalComments += issueComments.comments;

      // Sync review comments (line-specific comments)
      const reviewComments = await this.syncReviewComments(repository, pullRequest, prNumber);
      totalComments += reviewComments.comments;

    } catch (error) {
      logger.error(`Error syncing comments for ${owner}/${repoName}#${prNumber}:`, error.message);
    }

    return { comments: totalComments };
  }

  // Sync issue comments (general PR comments)
  async syncIssueComments(repository, pullRequest, prNumber) {
    const [owner, repoName] = repository.fullName.split('/');
    let totalComments = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.githubAPI.getIssueComments(owner, repoName, prNumber, page);
        
        for (const comment of response.data) {
          try {
            const author = await this.findOrCreateUserByLogin(comment.user.login);

            await Comment.upsert({
              githubId: comment.id,
              pullRequestId: pullRequest.id,
              authorId: author.id,
              body: comment.body,
              htmlUrl: comment.html_url,
              type: 'issue_comment',
              reactions: comment.reactions,
              githubCreatedAt: comment.created_at,
              githubUpdatedAt: comment.updated_at,
              wordCount: comment.body ? comment.body.split(/\s+/).length : 0,
              lastSyncAt: new Date()
            });

            totalComments++;
            
          } catch (commentError) {
            logger.error(`Error syncing issue comment ${comment.id}:`, commentError.message);
          }
        }

        hasMore = response.hasMore;
        page = response.nextPage;
        
      } catch (error) {
        logger.error(`Error fetching issue comments for ${owner}/${repoName}#${prNumber}:`, error.message);
        break;
      }
    }

    return { comments: totalComments };
  }

  // Sync review comments (line-specific comments)
  async syncReviewComments(repository, pullRequest, prNumber) {
    const [owner, repoName] = repository.fullName.split('/');
    let totalComments = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.githubAPI.getReviewComments(owner, repoName, prNumber, page);
        
        for (const comment of response.data) {
          try {
            const author = await this.findOrCreateUserByLogin(comment.user.login);

            // Find associated review if exists
            let reviewId = null;
            if (comment.pull_request_review_id) {
              const review = await Review.findOne({
                where: { githubId: comment.pull_request_review_id }
              });
              reviewId = review?.id;
            }

            await Comment.upsert({
              githubId: comment.id,
              pullRequestId: pullRequest.id,
              reviewId: reviewId,
              authorId: author.id,
              body: comment.body,
              htmlUrl: comment.html_url,
              type: 'review_comment',
              path: comment.path,
              position: comment.position,
              originalPosition: comment.original_position,
              line: comment.line,
              originalLine: comment.original_line,
              side: comment.side,
              startLine: comment.start_line,
              startSide: comment.start_side,
              commitId: comment.commit_id,
              reactions: comment.reactions,
              githubCreatedAt: comment.created_at,
              githubUpdatedAt: comment.updated_at,
              wordCount: comment.body ? comment.body.split(/\s+/).length : 0,
              lastSyncAt: new Date()
            });

            totalComments++;
            
          } catch (commentError) {
            logger.error(`Error syncing review comment ${comment.id}:`, commentError.message);
          }
        }

        hasMore = response.hasMore;
        page = response.nextPage;
        
      } catch (error) {
        logger.error(`Error fetching review comments for ${owner}/${repoName}#${prNumber}:`, error.message);
        break;
      }
    }

    return { comments: totalComments };
  }

  // Sync commits for all repositories
  async syncCommitsForAllRepos(options = {}) {
    logger.info('Syncing commits for all repositories...');
    
    const repositories = await Repository.findAll({
      where: { isActive: true },
      order: [['githubUpdatedAt', 'DESC']]
    });

    let totalCommits = 0;

    for (const repo of repositories) {
      try {
        logger.info(`Syncing commits for ${repo.fullName}...`);
        
        const results = await this.syncCommitsForRepo(repo, options);
        totalCommits += results.commits;
        
        // Rate limiting delay between repositories
        await this.delay(200);
        
      } catch (error) {
        logger.error(`Error syncing commits for ${repo.fullName}:`, error.message);
      }
    }

    return totalCommits;
  }

  // Sync commits for a specific repository
  async syncCommitsForRepo(repository, options = {}) {
    const [owner, repoName] = repository.fullName.split('/');
    let totalCommits = 0;
    let page = 1;
    let hasMore = true;

    // Determine date range for sync
    const since = options.since || moment().subtract(3, 'months').toISOString();
    
    while (hasMore) {
      try {
        const response = await this.githubAPI.getCommits(owner, repoName, since, null, page);
        
        for (const commit of response.data) {
          try {
            // Find or create author and committer
            let author = null;
            let committer = null;
            
            if (commit.author) {
              author = await this.findOrCreateUserByLogin(commit.author.login);
            }
            
            if (commit.committer && commit.committer.login !== commit.author?.login) {
              committer = await this.findOrCreateUserByLogin(commit.committer.login);
            }

            // Get detailed commit info if needed
            let detailedCommit = commit;
            if (!commit.stats) {
              try {
                detailedCommit = await this.githubAPI.getCommit(owner, repoName, commit.sha);
              } catch (detailError) {
                logger.warn(`Could not fetch detailed commit info for ${commit.sha}:`, detailError.message);
              }
            }

            await Commit.upsert({
              sha: commit.sha,
              repositoryId: repository.id,
              authorId: author?.id,
              committerId: committer?.id,
              message: commit.commit.message,
              htmlUrl: commit.html_url,
              authorName: commit.commit.author.name,
              authorEmail: commit.commit.author.email,
              authorDate: commit.commit.author.date,
              committerName: commit.commit.committer.name,
              committerEmail: commit.commit.committer.email,
              committerDate: commit.commit.committer.date,
              treeId: commit.commit.tree.sha,
              parents: commit.parents?.map(p => p.sha),
              additions: detailedCommit.stats?.additions || 0,
              deletions: detailedCommit.stats?.deletions || 0,
              changedFiles: detailedCommit.files?.length || 0,
              files: detailedCommit.files,
              verified: commit.commit.verification?.verified || false,
              verification: commit.commit.verification,
              messageLength: commit.commit.message?.length || 0,
              lastSyncAt: new Date()
            });

            totalCommits++;
            
          } catch (commitError) {
            logger.error(`Error syncing commit ${commit.sha}:`, commitError.message);
          }
        }

        hasMore = response.hasMore;
        page = response.nextPage;
        
        // Rate limiting delay
        await this.delay(100);
        
      } catch (error) {
        logger.error(`Error fetching commits for ${owner}/${repoName} page ${page}:`, error.message);
        break;
      }
    }

    return { commits: totalCommits };
  }

  // Helper method to find or create user by GitHub login
  async findOrCreateUserByLogin(login) {
    let user = await User.findOne({ where: { username: login } });
    
    if (!user) {
      try {
        const userDetails = await this.githubAPI.getUser(login);
        
        [user] = await User.upsert({
          githubId: userDetails.id,
          username: userDetails.login,
          email: userDetails.email,
          name: userDetails.name,
          avatarUrl: userDetails.avatar_url,
          bio: userDetails.bio,
          company: userDetails.company,
          location: userDetails.location,
          blog: userDetails.blog,
          twitterUsername: userDetails.twitter_username,
          publicRepos: userDetails.public_repos,
          publicGists: userDetails.public_gists,
          followers: userDetails.followers,
          following: userDetails.following,
          githubCreatedAt: userDetails.created_at,
          githubUpdatedAt: userDetails.updated_at,
          isActive: true,
          lastSyncAt: new Date()
        });
        
        logger.info(`Created user from API: ${login}`);
      } catch (error) {
        logger.error(`Error creating user ${login}:`, error.message);
        throw error;
      }
    }
    
    return user;
  }

  // Helper method for delays
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get sync status
  getSyncStatus() {
    return {
      inProgress: this.syncInProgress,
      lastSyncTime: this.lastSyncTime,
      rateLimitInfo: this.githubAPI.getRateLimitInfo()
    };
  }
}

module.exports = DataSyncService;