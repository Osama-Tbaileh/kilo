const jwt = require('jsonwebtoken');
const axios = require('axios');
const logger = require('../../utils/logger');

class GitHubAuth {
  constructor() {
    this.clientId = process.env.GITHUB_CLIENT_ID;
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET;
    this.jwtSecret = process.env.JWT_SECRET;
    this.redirectUri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:5000/api/auth/callback';
  }

  // Generate OAuth URL for GitHub authentication
  getAuthURL(state = null) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'read:org,repo,user:email',
      state: state || this.generateState()
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  // Generate random state for OAuth security
  generateState() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code, state = null) {
    try {
      const response = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: this.redirectUri,
        state: state
      }, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GitHub-Team-Insights/1.0'
        }
      });

      if (response.data.error) {
        throw new Error(`GitHub OAuth error: ${response.data.error_description}`);
      }

      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type,
        scope: response.data.scope
      };
    } catch (error) {
      logger.error('Error exchanging code for token:', error.message);
      throw error;
    }
  }

  // Get user information using access token
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Team-Insights/1.0'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching user info:', error.message);
      throw error;
    }
  }

  // Get user's organization memberships
  async getUserOrganizations(accessToken) {
    try {
      const response = await axios.get('https://api.github.com/user/orgs', {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Team-Insights/1.0'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching user organizations:', error.message);
      throw error;
    }
  }

  // Check if user is member of required organization
  async checkOrganizationMembership(accessToken, organization, username) {
    try {
      const response = await axios.get(`https://api.github.com/orgs/${organization}/members/${username}`, {
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Team-Insights/1.0'
        }
      });

      return response.status === 204; // 204 means user is a member
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return false; // User is not a member
      }
      logger.error('Error checking organization membership:', error.message);
      throw error;
    }
  }

  // Generate JWT token for application authentication
  generateJWT(payload, expiresIn = '7d') {
    try {
      return jwt.sign(payload, this.jwtSecret, { expiresIn });
    } catch (error) {
      logger.error('Error generating JWT:', error.message);
      throw error;
    }
  }

  // Verify JWT token
  verifyJWT(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      logger.error('Error verifying JWT:', error.message);
      throw error;
    }
  }

  // Validate GitHub token
  async validateGitHubToken(token) {
    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Team-Insights/1.0'
        }
      });

      return {
        valid: true,
        user: response.data,
        scopes: response.headers['x-oauth-scopes']?.split(', ') || []
      };
    } catch (error) {
      if (error.response && error.response.status === 401) {
        return { valid: false, error: 'Invalid or expired token' };
      }
      logger.error('Error validating GitHub token:', error.message);
      throw error;
    }
  }

  // Check token permissions/scopes
  hasRequiredScopes(scopes, required = ['read:org', 'repo']) {
    return required.every(scope => scopes.includes(scope));
  }

  // Refresh token if using GitHub App
  async refreshToken(refreshToken) {
    try {
      const response = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GitHub-Team-Insights/1.0'
        }
      });

      if (response.data.error) {
        throw new Error(`GitHub OAuth error: ${response.data.error_description}`);
      }

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        tokenType: response.data.token_type,
        scope: response.data.scope
      };
    } catch (error) {
      logger.error('Error refreshing token:', error.message);
      throw error;
    }
  }

  // Revoke token
  async revokeToken(token) {
    try {
      await axios.delete(`https://api.github.com/applications/${this.clientId}/token`, {
        auth: {
          username: this.clientId,
          password: this.clientSecret
        },
        data: {
          access_token: token
        },
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Team-Insights/1.0'
        }
      });

      return true;
    } catch (error) {
      logger.error('Error revoking token:', error.message);
      throw error;
    }
  }

  // Create installation token for GitHub App (if using GitHub App instead of OAuth)
  async createInstallationToken(installationId) {
    try {
      // This would require GitHub App private key and JWT generation
      // Implementation depends on whether you're using GitHub App or OAuth App
      const appJWT = this.generateAppJWT(); // Would need to implement this
      
      const response = await axios.post(`https://api.github.com/app/installations/${installationId}/access_tokens`, {}, {
        headers: {
          'Authorization': `Bearer ${appJWT}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Team-Insights/1.0'
        }
      });

      return {
        token: response.data.token,
        expiresAt: response.data.expires_at,
        permissions: response.data.permissions
      };
    } catch (error) {
      logger.error('Error creating installation token:', error.message);
      throw error;
    }
  }

  // Generate GitHub App JWT (placeholder - would need private key)
  generateAppJWT() {
    // This would require the GitHub App's private key
    // const privateKey = fs.readFileSync('path/to/private-key.pem');
    // const payload = {
    //   iat: Math.floor(Date.now() / 1000),
    //   exp: Math.floor(Date.now() / 1000) + (10 * 60), // 10 minutes
    //   iss: process.env.GITHUB_APP_ID
    // };
    // return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    
    throw new Error('GitHub App JWT generation not implemented - requires private key');
  }
}

module.exports = GitHubAuth;