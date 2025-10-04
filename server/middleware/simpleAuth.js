const jwt = require('jsonwebtoken');
const { User, TeamMember } = require('../models');
const logger = require('../utils/logger');

// Simple JWT verification middleware
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Access denied. No token provided.'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied. Invalid token format.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({
        error: 'Access denied. Token is null or undefined.'
      });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (jwtError) {
      logger.error('Error verifying JWT:', jwtError.message);
      return res.status(401).json({
        error: 'Invalid or expired token.'
      });
    }
  } catch (error) {
    logger.error('Auth middleware error:', error.message);
    res.status(500).json({ error: 'Internal server error during authentication.' });
  }
};

// Load user from database using the JWT payload
const loadUser = async (req, res, next) => {
  try {
    const githubId = req.user?.githubId;
    
    if (!githubId) {
      return res.status(401).json({ 
        error: 'GitHub user ID not found in token.' 
      });
    }

    const user = await User.findOne({
      where: { githubId },
      include: [{
        model: TeamMember,
        as: 'teamMember',
        required: false
      }]
    });

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found in database. Please contact an administrator.' 
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        error: 'User account is inactive.' 
      });
    }

    req.dbUser = user;
    next();
  } catch (error) {
    logger.error('Load user error:', error.message);
    res.status(500).json({ error: 'Error loading user data.' });
  }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  try {
    const userRole = req.dbUser?.teamMember?.role;
    
    if (!userRole) {
      return res.status(403).json({ 
        error: 'User role not found.' 
      });
    }

    const adminRoles = ['admin', 'manager'];
    
    if (!adminRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: `Access denied. Required role: ${adminRoles.join(' or ')}` 
      });
    }

    next();
  } catch (error) {
    logger.error('Admin check error:', error.message);
    res.status(500).json({ error: 'Error checking admin privileges.' });
  }
};

module.exports = {
  verifyToken,
  loadUser,
  requireAdmin
};