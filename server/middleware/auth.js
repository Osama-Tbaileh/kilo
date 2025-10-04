const GitHubAuth = require('../services/github/GitHubAuth');
const { User, TeamMember } = require('../models');
const logger = require('../utils/logger');

const githubAuth = new GitHubAuth();

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided or invalid format.' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = githubAuth.verifyJWT(token);
      req.user = decoded;
      next();
    } catch (jwtError) {
      logger.error('JWT verification failed:', jwtError.message);
      return res.status(401).json({ 
        error: 'Invalid or expired token.' 
      });
    }
  } catch (error) {
    logger.error('Auth middleware error:', error.message);
    res.status(500).json({ error: 'Internal server error during authentication.' });
  }
};

// Middleware to verify GitHub token
const verifyGitHubToken = async (req, res, next) => {
  try {
    const githubToken = req.headers['x-github-token'] || req.user?.githubToken;
    
    if (!githubToken) {
      return res.status(401).json({ 
        error: 'GitHub token required.' 
      });
    }

    const validation = await githubAuth.validateGitHubToken(githubToken);
    
    if (!validation.valid) {
      return res.status(401).json({ 
        error: validation.error || 'Invalid GitHub token.' 
      });
    }

    // Check if token has required scopes
    const requiredScopes = ['read:org', 'repo'];
    if (!githubAuth.hasRequiredScopes(validation.scopes, requiredScopes)) {
      return res.status(403).json({ 
        error: `Insufficient permissions. Required scopes: ${requiredScopes.join(', ')}` 
      });
    }

    req.githubUser = validation.user;
    req.githubToken = githubToken;
    req.githubScopes = validation.scopes;
    
    next();
  } catch (error) {
    logger.error('GitHub token verification error:', error.message);
    res.status(500).json({ error: 'Error verifying GitHub token.' });
  }
};

// Middleware to check organization membership
const checkOrganizationMembership = async (req, res, next) => {
  try {
    const organization = process.env.GITHUB_ORGANIZATION;
    const username = req.githubUser?.login;
    const githubToken = req.githubToken;

    if (!organization) {
      return res.status(500).json({ 
        error: 'Organization not configured.' 
      });
    }

    if (!username || !githubToken) {
      return res.status(401).json({ 
        error: 'GitHub authentication required.' 
      });
    }

    const isMember = await githubAuth.checkOrganizationMembership(
      githubToken, 
      organization, 
      username
    );

    if (!isMember) {
      return res.status(403).json({ 
        error: `Access denied. You must be a member of the ${organization} organization.` 
      });
    }

    req.organization = organization;
    next();
  } catch (error) {
    logger.error('Organization membership check error:', error.message);
    res.status(500).json({ error: 'Error checking organization membership.' });
  }
};

// Middleware to load user from database
const loadUser = async (req, res, next) => {
  try {
    const githubId = req.githubUser?.id;
    
    if (!githubId) {
      return res.status(401).json({ 
        error: 'GitHub user ID not found.' 
      });
    }

    const user = await User.findOne({
      where: { githubId },
      include: [{
        model: TeamMember,
        as: 'teamMember'
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

// Middleware to check user role
const requireRole = (roles) => {
  return (req, res, next) => {
    try {
      const userRole = req.dbUser?.teamMember?.role;
      
      if (!userRole) {
        return res.status(403).json({ 
          error: 'User role not found.' 
        });
      }

      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: `Access denied. Required role: ${allowedRoles.join(' or ')}` 
        });
      }

      next();
    } catch (error) {
      logger.error('Role check error:', error.message);
      res.status(500).json({ error: 'Error checking user role.' });
    }
  };
};

// Middleware to check if user is admin
const requireAdmin = requireRole(['admin', 'manager']);

// Middleware to check if user is team lead or above
const requireTeamLead = requireRole(['admin', 'manager', 'tech_lead']);

// Optional authentication - doesn't fail if no token provided
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = githubAuth.verifyJWT(token);
      req.user = decoded;
      
      // Try to load additional user data if token is valid
      if (decoded.githubId) {
        const user = await User.findOne({
          where: { githubId: decoded.githubId },
          include: [{
            model: TeamMember,
            as: 'teamMember'
          }]
        });
        
        if (user && user.isActive) {
          req.dbUser = user;
        }
      }
    } catch (jwtError) {
      // Invalid token, but continue without authentication
      logger.warn('Optional auth - invalid token:', jwtError.message);
    }
    
    next();
  } catch (error) {
    logger.error('Optional auth error:', error.message);
    next(); // Continue even if there's an error
  }
};

// Rate limiting middleware for API endpoints
const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const userId = req.dbUser?.id || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    if (requests.has(userId)) {
      const userRequests = requests.get(userId).filter(time => time > windowStart);
      requests.set(userId, userRequests);
    } else {
      requests.set(userId, []);
    }
    
    const userRequests = requests.get(userId);
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    userRequests.push(now);
    next();
  };
};

module.exports = {
  verifyToken,
  verifyGitHubToken,
  checkOrganizationMembership,
  loadUser,
  requireRole,
  requireAdmin,
  requireTeamLead,
  optionalAuth,
  rateLimitByUser
};