import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

// Initial state
const initialState = {
  user: null,
  token: null,
  githubToken: null,
  loading: true,
  error: null,
};

// Action types
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_ERROR: 'LOGIN_ERROR',
  LOGOUT: 'LOGOUT',
  UPDATE_USER: 'UPDATE_USER',
  CLEAR_ERROR: 'CLEAR_ERROR',
};

// Reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
      };

    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        githubToken: action.payload.githubToken,
        loading: false,
        error: null,
      };

    case AUTH_ACTIONS.LOGIN_ERROR:
      return {
        ...state,
        user: null,
        token: null,
        githubToken: null,
        loading: false,
        error: action.payload,
      };

    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        token: null,
        githubToken: null,
        loading: false,
        error: null,
      };

    case AUTH_ACTIONS.UPDATE_USER:
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };

    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
};

// Create context
const AuthContext = createContext();

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state from localStorage or URL
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('=== AUTH CONTEXT INITIALIZATION DEBUG ===');
        console.log('Current URL:', window.location.href);
        console.log('All localStorage keys:', Object.keys(localStorage));
        console.log('localStorage auth_token:', localStorage.getItem('auth_token'));
        console.log('localStorage token:', localStorage.getItem('token'));
        
        // Check for token in URL (from OAuth callback)
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        const success = urlParams.get('success');
        const error = urlParams.get('error');

        console.log('URL params - token:', urlToken);
        console.log('URL params - success:', success);
        console.log('URL params - error:', error);

        if (error) {
          console.log('Auth error from URL:', error);
          dispatch({
            type: AUTH_ACTIONS.LOGIN_ERROR,
            payload: decodeURIComponent(error),
          });
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (urlToken && success) {
          console.log('Found token in URL, storing as auth_token');
          // Store token from URL
          localStorage.setItem('auth_token', urlToken);
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
          
          // Get user info with new token
          const userData = await authAPI.getMe();
          console.log('User data from API:', userData);
          
          dispatch({
            type: AUTH_ACTIONS.LOGIN_SUCCESS,
            payload: {
              user: userData,
              token: urlToken,
              githubToken: null,
            },
          });
          return;
        }

        // Check for existing token in localStorage
        const token = localStorage.getItem('auth_token');
        console.log('Existing token from localStorage:', token);
        if (token) {
          console.log('Verifying existing token...');
          // Verify token and get user info
          const userData = await authAPI.getMe();
          console.log('User data from existing token:', userData);
          
          dispatch({
            type: AUTH_ACTIONS.LOGIN_SUCCESS,
            payload: {
              user: userData,
              token,
              githubToken: null,
            },
          });
        } else {
          console.log('No token found, setting loading to false');
          dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        // Clear invalid tokens
        localStorage.removeItem('auth_token');
        localStorage.removeItem('github_token');
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    };

    initializeAuth();
  }, []);

  // Login function
  const login = async (code, state) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });

      const response = await authAPI.handleCallback(code, state);
      
      // Store tokens
      localStorage.setItem('auth_token', response.token);
      if (response.githubToken) {
        localStorage.setItem('github_token', response.githubToken);
      }

      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: {
          user: response.user,
          token: response.token,
          githubToken: response.githubToken,
        },
      });

      toast.success(`Welcome back, ${response.user.name || response.user.username}!`);
      return response;
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      dispatch({
        type: AUTH_ACTIONS.LOGIN_ERROR,
        payload: errorMessage,
      });
      toast.error(errorMessage);
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      const githubToken = localStorage.getItem('github_token');
      
      // Call logout API to revoke tokens
      if (githubToken) {
        await authAPI.logout();
      }
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with logout even if API call fails
    } finally {
      // Clear local storage
      localStorage.removeItem('auth_token');
      localStorage.removeItem('github_token');
      
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      toast.success('Logged out successfully');
    }
  };

  // Refresh token function
  const refreshToken = async () => {
    try {
      const response = await authAPI.refreshToken();
      
      localStorage.setItem('auth_token', response.token);
      
      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: {
          user: state.user,
          token: response.token,
          githubToken: state.githubToken,
        },
      });

      return response.token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      throw error;
    }
  };

  // Update user function
  const updateUser = (userData) => {
    dispatch({
      type: AUTH_ACTIONS.UPDATE_USER,
      payload: userData,
    });
  };

  // Clear error function
  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  };

  // Get GitHub auth URL
  const getGitHubAuthURL = async () => {
    try {
      const response = await authAPI.getGitHubAuthURL();
      return response.authUrl;
    } catch (error) {
      toast.error('Failed to get GitHub auth URL');
      throw error;
    }
  };

  // Check if user has required permissions
  const hasPermission = (permission) => {
    if (!state.user) return false;
    
    const userRole = state.user.role;
    
    switch (permission) {
      case 'admin':
        return userRole === 'admin';
      case 'manager':
        return ['admin', 'manager'].includes(userRole);
      case 'team_lead':
        return ['admin', 'manager', 'tech_lead'].includes(userRole);
      default:
        return true; // Basic permissions for all authenticated users
    }
  };

  // Context value
  const value = {
    // State
    user: state.user,
    token: state.token,
    githubToken: state.githubToken,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user,
    
    // Actions
    login,
    logout,
    refreshToken,
    updateUser,
    clearError,
    getGitHubAuthURL,
    hasPermission,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

export default AuthContext;