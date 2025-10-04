import axios from 'axios';
import toast from 'react-hot-toast';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const githubToken = localStorage.getItem('github_token');
    if (githubToken) {
      config.headers['X-GitHub-Token'] = githubToken;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const { response } = error;
    
    if (response?.status === 401) {
      // Unauthorized - clear tokens and redirect to login
      localStorage.removeItem('auth_token');
      localStorage.removeItem('github_token');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (response?.status === 429) {
      toast.error('Too many requests. Please try again later.');
    } else if (response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  getGitHubAuthURL: () => api.get('/auth/github'),
  handleCallback: (code, state) => api.post('/auth/callback', { code, state }),
  getMe: () => api.get('/auth/me'),
  refreshToken: () => api.post('/auth/refresh'),
  logout: () => api.post('/auth/logout'),
  validateToken: (token) => api.post('/auth/validate-token', { token }),
  getOrganizations: () => api.get('/auth/organizations'),
};

// Team API
export const teamAPI = {
  getOverview: (params) => api.get('/team/overview', { params }),
  getMembers: (params) => api.get('/team/members', { params }),
  getRankings: (params) => api.get('/team/rankings', { params }),
  getActivity: (params) => api.get('/team/activity', { params }),
  getCollaboration: (params) => api.get('/team/collaboration', { params }),
};

// Users API
export const usersAPI = {
  getProfile: (userId, params) => api.get(`/users/${userId}`, { params }),
  getTimeline: (userId, params) => api.get(`/users/${userId}/timeline`, { params }),
  getCollaboration: (userId, params) => api.get(`/users/${userId}/collaboration`, { params }),
};

// Pull Requests API
export const pullRequestsAPI = {
  getOverview: (params) => api.get('/pull-requests/overview', { params }),
  getList: (params) => api.get('/pull-requests', { params }),
  getById: (prId) => api.get(`/pull-requests/${prId}`),
  getLifecycleAnalytics: (params) => api.get('/pull-requests/analytics/lifecycle', { params }),
  getStaleAnalysis: (params) => api.get('/pull-requests/analytics/stale', { params }),
};

// Repositories API
export const repositoriesAPI = {
  getList: (params) => api.get('/repositories', { params }),
  getById: (repoId) => api.get(`/repositories/${repoId}`),
  getActivity: (repoId, params) => api.get(`/repositories/${repoId}/activity`, { params }),
  getOverview: (params) => api.get('/repositories/analytics/overview', { params }),
  getHealthScores: (params) => api.get('/repositories/analytics/health', { params }),
};

// Metrics API
export const metricsAPI = {
  getOverview: (params) => api.get('/metrics/overview', { params }),
  getTrends: (params) => api.get('/metrics/trends', { params }),
  getLeaderboard: (params) => api.get('/metrics/leaderboard', { params }),
  getComparison: (params) => api.get('/metrics/comparison', { params }),
  calculate: (data) => api.post('/metrics/calculate', data),
  export: (params) => api.get('/metrics/export', { params }),
};

// Sync API
export const syncAPI = {
  getStatus: () => api.get('/sync/status'),
  trigger: (data) => api.post('/sync/trigger', data),
  stop: () => api.post('/sync/stop'),
  getHistory: (params) => api.get('/sync/history', { params }),
  getScheduledStatus: () => api.get('/sync/scheduled/status'),
  startScheduled: () => api.post('/sync/scheduled/start'),
  stopScheduled: () => api.post('/sync/scheduled/stop'),
  restartScheduled: () => api.post('/sync/scheduled/restart'),
  runJob: (jobName) => api.post('/sync/scheduled/run-job', { jobName }),
  updateJobSchedule: (jobName, cronExpression) => 
    api.put(`/sync/scheduled/job/${jobName}`, { cronExpression }),
  getRateLimit: () => api.get('/sync/rate-limit'),
  testConnection: () => api.post('/sync/test-connection'),
  getStats: () => api.get('/sync/stats'),
};

// Utility functions for API calls
export const apiUtils = {
  // Generic GET request with error handling
  get: async (endpoint, params = {}, options = {}) => {
    try {
      const response = await api.get(endpoint, { params, ...options });
      return response;
    } catch (error) {
      console.error(`API GET error for ${endpoint}:`, error);
      throw error;
    }
  },

  // Generic POST request with error handling
  post: async (endpoint, data = {}, options = {}) => {
    try {
      const response = await api.post(endpoint, data, options);
      return response;
    } catch (error) {
      console.error(`API POST error for ${endpoint}:`, error);
      throw error;
    }
  },

  // Generic PUT request with error handling
  put: async (endpoint, data = {}, options = {}) => {
    try {
      const response = await api.put(endpoint, data, options);
      return response;
    } catch (error) {
      console.error(`API PUT error for ${endpoint}:`, error);
      throw error;
    }
  },

  // Generic DELETE request with error handling
  delete: async (endpoint, options = {}) => {
    try {
      const response = await api.delete(endpoint, options);
      return response;
    } catch (error) {
      console.error(`API DELETE error for ${endpoint}:`, error);
      throw error;
    }
  },

  // Download file
  downloadFile: async (endpoint, filename, params = {}) => {
    try {
      const response = await api.get(endpoint, {
        params,
        responseType: 'blob',
      });

      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      return response;
    } catch (error) {
      console.error(`Download error for ${endpoint}:`, error);
      toast.error('Failed to download file');
      throw error;
    }
  },

  // Upload file
  uploadFile: async (endpoint, file, onProgress = null) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const config = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      };

      if (onProgress) {
        config.onUploadProgress = (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        };
      }

      const response = await api.post(endpoint, formData, config);
      return response;
    } catch (error) {
      console.error(`Upload error for ${endpoint}:`, error);
      toast.error('Failed to upload file');
      throw error;
    }
  },

  // Batch requests
  batch: async (requests) => {
    try {
      const promises = requests.map(({ method, endpoint, data, params }) => {
        switch (method.toLowerCase()) {
          case 'get':
            return api.get(endpoint, { params });
          case 'post':
            return api.post(endpoint, data);
          case 'put':
            return api.put(endpoint, data);
          case 'delete':
            return api.delete(endpoint);
          default:
            throw new Error(`Unsupported method: ${method}`);
        }
      });

      const results = await Promise.allSettled(promises);
      return results.map((result, index) => ({
        ...requests[index],
        success: result.status === 'fulfilled',
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason : null,
      }));
    } catch (error) {
      console.error('Batch request error:', error);
      throw error;
    }
  },

  // Retry mechanism
  retry: async (fn, maxRetries = 3, delay = 1000) => {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
      }
    }
    
    throw lastError;
  },

  // Cache management
  cache: new Map(),
  
  getCached: (key) => {
    const cached = apiUtils.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    return null;
  },

  setCached: (key, data, ttl = 5 * 60 * 1000) => { // 5 minutes default
    apiUtils.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  },

  clearCache: (pattern = null) => {
    if (pattern) {
      const regex = new RegExp(pattern);
      for (const key of apiUtils.cache.keys()) {
        if (regex.test(key)) {
          apiUtils.cache.delete(key);
        }
      }
    } else {
      apiUtils.cache.clear();
    }
  },
};

// Export the main api instance as well
export default api;