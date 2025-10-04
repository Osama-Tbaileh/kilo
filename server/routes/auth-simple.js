const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { User, TeamMember } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

// Simple GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// GET /api/auth/github - Start OAuth flow
router.get('/github', (req, res) => {
  const state = Math.random().toString(36).substring(7);
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent('http://localhost:5000/api/auth/github/callback')}&scope=read:org,repo,user:email&state=${state}`;
  
  res.json({ authUrl, state });
});

// GET /api/auth/github/callback - Handle GitHub callback
router.get('/github/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect(`${CLIENT_URL}?error=${encodeURIComponent(error)}`);
  }
  
  if (!code) {
    return res.redirect(`${CLIENT_URL}?error=${encodeURIComponent('No authorization code')}`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code: code
    }, {
      headers: { 'Accept': 'application/json' }
    });

    const accessToken = tokenResponse.data.access_token;
    
    if (!accessToken) {
      throw new Error('No access token received');
    }

    // Get user info
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { 'Authorization': `token ${accessToken}` }
    });

    const githubUser = userResponse.data;

    // Find or create user
    let user = await User.findOne({ where: { githubId: githubUser.id } });
    
    if (!user) {
      user = await User.create({
        githubId: githubUser.id,
        username: githubUser.login,
        email: githubUser.email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        isActive: true,
        lastSyncAt: new Date()
      });

      // Create team member record
      await TeamMember.create({
        userId: user.id,
        role: 'developer',
        isActive: true
      });
    } else {
      // Update existing user
      await user.update({
        email: githubUser.email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        lastSyncAt: new Date()
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        githubId: user.githubId, 
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    res.redirect(`${CLIENT_URL}?token=${token}&success=true`);

  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.redirect(`${CLIENT_URL}?error=${encodeURIComponent('Authentication failed')}`);
  }
});

// GET /api/auth/me - Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findByPk(decoded.id, {
      include: [{ model: TeamMember, as: 'teamMember' }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      githubId: user.githubId,
      username: user.username,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.teamMember?.role || 'developer',
      isActive: user.isActive
    });

  } catch (error) {
    logger.error('Auth me error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;