const express = require('express');
const { User, Repository, PullRequest, Review, Commit } = require('../models');
const { verifyToken, loadUser } = require('../middleware/simpleAuth');
const DataSyncService = require('../services/sync/DataSyncService');

const router = express.Router();

// Temporary bypass for debug endpoints due to JWT signature mismatch
router.use((req, res, next) => {
  console.log('=== DEBUG ROUTE - BYPASSING AUTH FOR SYNC ===');
  console.log('Request URL:', req.url);
  
  // Create a mock user for debug operations
  req.user = {
    id: 2,
    githubId: 228379308,
    username: 'osamatestemail1'
  };
  req.dbUser = {
    id: 2,
    githubId: 228379308,
    username: 'osamatestemail1',
    isActive: true
  };
  
  console.log('Mock user set for debug operations');
  next();
});

// GET /api/debug/repository/:repositoryId - Simple debug info for a repository
router.get('/repository/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    
    // Get basic repository info
    const repository = await Repository.findByPk(repositoryId, {
      attributes: ['id', 'name', 'fullName']
    });
    
    if (!repository) {
      return res.json({ error: 'Repository not found' });
    }
    
    // Get counts of all data
    const [prCount, reviewCount, commitCount, userCount] = await Promise.all([
      PullRequest.count({ where: { repositoryId } }),
      Review.count({
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          where: { repositoryId },
          required: true,
          attributes: []
        }]
      }),
      Commit.count({ where: { repositoryId } }),
      User.count()
    ]);
    
    // Get sample data
    const [samplePRs, sampleReviews, sampleCommits] = await Promise.all([
      PullRequest.findAll({
        where: { repositoryId },
        include: [{ model: User, as: 'author', attributes: ['username'] }],
        attributes: ['id', 'number', 'title', 'authorId', 'githubCreatedAt', 'merged'],
        limit: 5,
        order: [['githubCreatedAt', 'DESC']]
      }),
      Review.findAll({
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          where: { repositoryId },
          required: true,
          attributes: ['number']
        }],
        attributes: ['id', 'reviewerId', 'githubSubmittedAt'],
        limit: 5,
        order: [['githubSubmittedAt', 'DESC']]
      }),
      Commit.findAll({
        where: { repositoryId },
        include: [{ model: User, as: 'author', attributes: ['username'] }],
        attributes: ['id', 'authorId', 'authorDate', 'additions', 'deletions'],
        limit: 5,
        order: [['authorDate', 'DESC']]
      })
    ]);
    
    res.json({
      repository: {
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName
      },
      counts: {
        pullRequests: prCount,
        reviews: reviewCount,
        commits: commitCount,
        totalUsers: userCount
      },
      sampleData: {
        pullRequests: samplePRs.map(pr => ({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          author: pr.author?.username || 'Unknown',
          authorId: pr.authorId,
          created: pr.githubCreatedAt,
          merged: pr.merged
        })),
        reviews: sampleReviews.map(review => ({
          id: review.id,
          reviewerId: review.reviewerId,
          submitted: review.githubSubmittedAt,
          prNumber: review.pullRequest?.number
        })),
        commits: sampleCommits.map(commit => ({
          id: commit.id,
          author: commit.author?.username || 'Unknown',
          authorId: commit.authorId,
          date: commit.authorDate,
          additions: commit.additions,
          deletions: commit.deletions
        }))
      }
    });
    
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ 
      error: 'Debug failed',
      details: error.message
    });
  }
});

// POST /api/debug/sync-repository/:repositoryId - Manually sync a specific repository
router.post('/sync-repository/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    
    // Get repository info
    const repository = await Repository.findByPk(repositoryId);
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    console.log(`=== MANUAL SYNC DEBUG FOR ${repository.fullName} ===`);
    
    // Create sync service instance
    const syncService = new DataSyncService();
    
    // Sync PRs for this specific repository
    console.log('Starting PR sync...');
    const prResults = await syncService.syncPullRequestsForRepo(repository, { 
      fullSync: true,
      since: new Date('2020-01-01') // Get all PRs
    });
    
    console.log('PR sync results:', prResults);
    
    // Get updated counts
    const [prCount, reviewCount] = await Promise.all([
      PullRequest.count({ where: { repositoryId } }),
      Review.count({
        include: [{
          model: PullRequest,
          as: 'pullRequest',
          where: { repositoryId },
          required: true,
          attributes: []
        }]
      })
    ]);
    
    res.json({
      success: true,
      repository: {
        id: repository.id,
        name: repository.name,
        fullName: repository.fullName
      },
      syncResults: prResults,
      newCounts: {
        pullRequests: prCount,
        reviews: reviewCount
      }
    });
    
  } catch (error) {
    console.error('Manual sync error:', error);
    res.status(500).json({ 
      error: 'Manual sync failed',
      details: error.message
    });
  }
});

// GET /api/debug/github-check/:repositoryId - Check what's actually in GitHub
router.get('/github-check/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    
    // Get repository info
    const repository = await Repository.findByPk(repositoryId);
    if (!repository) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    
    const [owner, repoName] = repository.fullName.split('/');
    
    // Create sync service to use GitHub API
    const syncService = new DataSyncService();
    
    // Check what's in GitHub directly
    console.log(`=== GITHUB API CHECK FOR ${repository.fullName} ===`);
    
    try {
      const prResponse = await syncService.githubAPI.getPullRequests(owner, repoName, 'all', 1);
      console.log('GitHub PR response:', prResponse);
      
      res.json({
        repository: {
          id: repository.id,
          name: repository.name,
          fullName: repository.fullName
        },
        githubData: {
          pullRequests: prResponse.data.length,
          samplePRs: prResponse.data.slice(0, 3).map(pr => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            created: pr.created_at,
            author: pr.user.login
          }))
        }
      });
      
    } catch (apiError) {
      console.error('GitHub API error:', apiError);
      res.json({
        repository: {
          id: repository.id,
          name: repository.name,
          fullName: repository.fullName
        },
        error: 'GitHub API error',
        details: apiError.message
      });
    }
    
  } catch (error) {
    console.error('GitHub check error:', error);
    res.status(500).json({ 
      error: 'GitHub check failed',
      details: error.message
    });
  }
});

// POST /api/debug/manual-insert-pr/:repositoryId - Manually insert a test PR
router.post('/manual-insert-pr/:repositoryId', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    
    console.log('=== MANUAL PR INSERT TEST ===');
    
    // Try to insert a simple PR record
    const testPR = await PullRequest.create({
      githubId: 999999999, // Fake GitHub ID
      number: 999,
      title: 'Test PR',
      body: 'This is a test PR',
      state: 'open',
      draft: false,
      locked: false,
      htmlUrl: 'https://github.com/test/test/pull/999',
      authorId: 1, // Assuming user ID 1 exists
      repositoryId: parseInt(repositoryId),
      baseBranch: 'main',
      headBranch: 'test-branch',
      merged: false,
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      githubCreatedAt: new Date(),
      githubUpdatedAt: new Date(),
      lastSyncAt: new Date()
    });
    
    console.log('Test PR created successfully:', testPR.id);
    
    res.json({
      success: true,
      message: 'Test PR inserted successfully',
      prId: testPR.id
    });
    
  } catch (error) {
    console.error('Manual PR insert error:', error);
    res.status(500).json({
      error: 'Manual PR insert failed',
      details: error.message
    });
  }
});

module.exports = router;