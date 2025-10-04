const express = require('express');
const GitHubAuth = require('../services/github/GitHubAuth');
const { User, TeamMember } = require('../models');
const logger = require('../utils/logger');
const { verifyToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();
const githubAuth = new GitHubAuth();

// GET /api/auth/github - Get GitHub OAuth URL
router.get('/github', (req, res) => {
  try {
    const state = githubAuth.generateState();
    const authUrl = githubAuth.getAuthURL(state);
    
    // Store state in session or return it to client to verify later
    res.json({
      authUrl,
      state
    });
  } catch (error) {
    logger.error('Error generating GitHub auth URL:', error.message);
    res.status(500).json({ error: 'Failed to generate authentication URL' });
  }
});

// GET /api/auth/callback - Handle GitHub OAuth redirect (alternative route)
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      console.log('OAuth error:', error);
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}?error=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      console.log('No authorization code received');
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}?error=${encodeURIComponent('Authorization code missing')}`);
    }
    
    console.log('Received OAuth callback with code:', code.substring(0, 10) + '...');
    
    // Redirect to frontend with code and state for processing
    const redirectUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}`;
    console.log('Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('OAuth redirect error:', error.message);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}?error=${encodeURIComponent('Authentication failed')}`);
  }
});

// GET /api/auth/github/callback - Handle GitHub OAuth redirect
router.get('/github/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      // Redirect to frontend with error
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}?error=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}?error=${encodeURIComponent('Authorization code missing')}`);
    }
    
    // Redirect to frontend with code and state for processing
    const redirectUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}`;
    res.redirect(redirectUrl);
    
  } catch (error) {
    logger.error('OAuth redirect error:', error.message);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}?error=${encodeURIComponent('Authentication failed')}`);
  }
});

// POST /api/auth/callback - Handle GitHub OAuth callback
router.post('/callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    // Exchange code for access token
    const tokenData = await githubAuth.exchangeCodeForToken(code, state);
    
    // Get user information from GitHub
    const githubUser = await githubAuth.getUserInfo(tokenData.accessToken);
    
    // Check organization membership
    const organization = process.env.GITHUB_ORGANIZATION;
    if (organization) {
      const isMember = await githubAuth.checkOrganizationMembership(
        tokenData.accessToken,
        organization,
        githubUser.login
      );
      
      if (!isMember) {
        return res.status(403).json({
          error: `Access denied. You must be a member of the ${organization} organization.`
        });
      }
    }
    
    // Find or create user in database
    let user = await User.findOne({ where: { githubId: githubUser.id } });
    
    if (!user) {
      // Create new user
      user = await User.create({
        githubId: githubUser.id,
        username: githubUser.login,
        email: githubUser.email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        bio: githubUser.bio,
        company: githubUser.company,
        location: githubUser.location,
        blog: githubUser.blog,
        twitterUsername: githubUser.twitter_username,
        publicRepos: githubUser.public_repos,
        publicGists: githubUser.public_gists,
        followers: githubUser.followers,
        following: githubUser.following,
        githubCreatedAt: githubUser.created_at,
        githubUpdatedAt: githubUser.updated_at,
        isActive: true,
        lastSyncAt: new Date()
      });
      
      // Create team member record
      await TeamMember.create({
        userId: user.id,
        role: 'developer',
        isActive: true
      });
      
      logger.info(`New user registered: ${githubUser.login}`);
    } else {
      // Update existing user
      await user.update({
        email: githubUser.email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        bio: githubUser.bio,
        company: githubUser.company,
        location: githubUser.location,
        blog: githubUser.blog,
        twitterUsername: githubUser.twitter_username,
        publicRepos: githubUser.public_repos,
        publicGists: githubUser.public_gists,
        followers: githubUser.followers,
        following: githubUser.following,
        githubUpdatedAt: githubUser.updated_at,
        lastSyncAt: new Date()
      });
      
      logger.info(`User updated: ${githubUser.login}`);
    }
    
    // Load user with team member info
    const userWithTeam = await User.findByPk(user.id, {
      include: [{
        model: TeamMember,
        as: 'teamMember'
      }]
    });
    
    // Generate JWT token
    const jwtPayload = {
      id: user.id,
      githubId: user.githubId,
      username: user.username,
      role: userWithTeam.teamMember?.role || 'developer'
    };
    
    const jwtToken = githubAuth.generateJWT(jwtPayload);
    
    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: user.id,
        githubId: user.githubId,
        username: user.username,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: userWithTeam.teamMember?.role || 'developer',
        isActive: user.isActive
      },
      githubToken: tokenData.accessToken // Store securely on client side
    });
    
  } catch (error) {
    logger.error('OAuth callback error:', error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{
        model: TeamMember,
        as: 'teamMember'
      }],
      attributes: { exclude: ['createdAt', 'updatedAt'] }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ error: 'User account is inactive' });
    }
    
    res.json({
      id: user.id,
      githubId: user.githubId,
      username: user.username,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      company: user.company,
      location: user.location,
      blog: user.blog,
      twitterUsername: user.twitterUsername,
      publicRepos: user.publicRepos,
      publicGists: user.publicGists,
      followers: user.followers,
      following: user.following,
      githubCreatedAt: user.githubCreatedAt,
      role: user.teamMember?.role || 'developer',
      team: user.teamMember?.team,
      seniority: user.teamMember?.seniority,
      specialization: user.teamMember?.specialization,
      skills: user.teamMember?.skills,
      isActive: user.isActive,
      lastSyncAt: user.lastSyncAt
    });
    
  } catch (error) {
    logger.error('Error fetching user info:', error.message);
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

// POST /api/auth/refresh - Refresh JWT token
router.post('/refresh', verifyToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{
        model: TeamMember,
        as: 'teamMember'
      }]
    });
    
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    
    // Generate new JWT token
    const jwtPayload = {
      id: user.id,
      githubId: user.githubId,
      username: user.username,
      role: user.teamMember?.role || 'developer'
    };
    
    const newToken = githubAuth.generateJWT(jwtPayload);
    
    res.json({
      token: newToken,
      expiresIn: '7d'
    });
    
  } catch (error) {
    logger.error('Token refresh error:', error.message);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// POST /api/auth/logout - Logout user
router.post('/logout', optionalAuth, async (req, res) => {
  try {
    // If GitHub token is provided, revoke it
    const githubToken = req.headers['x-github-token'];
    if (githubToken) {
      try {
        await githubAuth.revokeToken(githubToken);
        logger.info('GitHub token revoked successfully');
      } catch (revokeError) {
        logger.warn('Failed to revoke GitHub token:', revokeError.message);
      }
    }
    
    res.json({ message: 'Logged out successfully' });
    
  } catch (error) {
    logger.error('Logout error:', error.message);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /api/auth/organizations - Get user's GitHub organizations
router.get('/organizations', verifyToken, async (req, res) => {
  try {
    const githubToken = req.headers['x-github-token'];
    
    if (!githubToken) {
      return res.status(401).json({ error: 'GitHub token required' });
    }
    
    const organizations = await githubAuth.getUserOrganizations(githubToken);
    
    res.json(organizations.map(org => ({
      id: org.id,
      login: org.login,
      name: org.name,
      description: org.description,
      avatarUrl: org.avatar_url,
      htmlUrl: org.html_url
    })));
    
  } catch (error) {
    logger.error('Error fetching organizations:', error.message);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// POST /api/auth/validate-token - Validate GitHub token
router.post('/validate-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const validation = await githubAuth.validateGitHubToken(token);
    
    if (!validation.valid) {
      return res.status(401).json({ 
        valid: false, 
        error: validation.error 
      });
    }
    
    // Check required scopes
    const requiredScopes = ['read:org', 'repo'];
    const hasRequiredScopes = githubAuth.hasRequiredScopes(validation.scopes, requiredScopes);
    
    res.json({
      valid: true,
      user: validation.user,
      scopes: validation.scopes,
      hasRequiredScopes,
      requiredScopes
    });
    
  } catch (error) {
    logger.error('Token validation error:', error.message);
    res.status(500).json({ error: 'Token validation failed' });
  }
});

module.exports = router;