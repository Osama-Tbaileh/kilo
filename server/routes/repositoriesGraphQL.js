const express = require('express');
const { Repository } = require('../models');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const logger = require('../utils/logger');

const router = express.Router();

// Apply authentication middleware
router.use(verifyToken);
router.use(loadUser);

// GET /api/repositories-graphql - Get all repositories with comprehensive data
router.get('/', async (req, res) => {
  try {
    // Create GitHub API instance
    const GitHubAPI = require('../services/github/GitHubAPI');
    const githubAPI = new GitHubAPI(
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
      process.env.GITHUB_ORGANIZATION
    );
    
    // Fetch repositories with comprehensive data via GraphQL
    const query = `
      query OrganizationRepositories($org: String!) {
        organization(login: $org) {
          repositories(first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) {
            totalCount
            nodes {
              id
              name
              description
              url
              isPrivate
              stargazerCount
              forkCount
              watchers {
                totalCount
              }
              primaryLanguage {
                name
                color
              }
              languages(first: 10) {
                nodes {
                  name
                  color
                }
              }
              createdAt
              updatedAt
              pushedAt
              
              # Repository statistics
              pullRequests(states: [OPEN, CLOSED, MERGED]) {
                totalCount
              }
              openPullRequests: pullRequests(states: [OPEN]) {
                totalCount
              }
              mergedPullRequests: pullRequests(states: [MERGED]) {
                totalCount
              }
              
              issues(states: [OPEN, CLOSED]) {
                totalCount
              }
              openIssues: issues(states: [OPEN]) {
                totalCount
              }
              
              # Recent activity
              defaultBranchRef {
                target {
                  ... on Commit {
                    history(first: 10) {
                      totalCount
                      nodes {
                        committedDate
                        author {
                          user {
                            login
                          }
                        }
                      }
                    }
                  }
                }
              }
              
              # Contributors
              collaborators(first: 20) {
                totalCount
                nodes {
                  login
                  name
                  avatarUrl
                }
              }
            }
          }
        }
      }
    `;
    
    const data = await githubAPI.executeGraphQLQuery(query, { 
      org: process.env.GITHUB_ORGANIZATION 
    });
    
    // Process the GraphQL data
    const repositories = data.organization.repositories.nodes.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: `${process.env.GITHUB_ORGANIZATION}/${repo.name}`,
      description: repo.description,
      htmlUrl: repo.url,
      private: repo.isPrivate,
      language: repo.primaryLanguage?.name,
      languageColor: repo.primaryLanguage?.color,
      languages: repo.languages.nodes,
      stargazersCount: repo.stargazerCount,
      forksCount: repo.forkCount,
      watchersCount: repo.watchers.totalCount,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      pushedAt: repo.pushedAt,
      
      // Statistics
      stats: {
        totalPRs: repo.pullRequests.totalCount,
        openPRs: repo.openPullRequests.totalCount,
        mergedPRs: repo.mergedPullRequests.totalCount,
        totalIssues: repo.issues.totalCount,
        openIssues: repo.openIssues.totalCount,
        totalCommits: repo.defaultBranchRef?.target?.history?.totalCount || 0,
        totalContributors: repo.collaborators.totalCount
      },
      
      // Recent activity
      recentCommits: repo.defaultBranchRef?.target?.history?.nodes?.slice(0, 5).map(commit => ({
        date: commit.committedDate,
        author: commit.author?.user?.login
      })) || [],
      
      // Top contributors
      topContributors: repo.collaborators.nodes.slice(0, 5).map(contributor => ({
        login: contributor.login,
        name: contributor.name,
        avatarUrl: contributor.avatarUrl
      }))
    }));
    
    res.json({
      repositories,
      totalCount: data.organization.repositories.totalCount,
      apiCallsUsed: 1,
      dataSource: 'GitHub GraphQL (Real-time)',
      lastFetched: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching repositories via GraphQL:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch repositories',
      details: error.message
    });
  }
});

module.exports = router;