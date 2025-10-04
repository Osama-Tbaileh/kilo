import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';

import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout/Layout';
import LoadingSpinner from './components/Common/LoadingSpinner';

// Pages
import LoginPage from './pages/Auth/LoginPage-simple';
import DashboardPage from './pages/Dashboard/DashboardPage';
import TeamPage from './pages/Team/TeamPage';
import ContributorPage from './pages/Contributor/ContributorPage';
import UserProfilePage from './pages/User/UserProfilePage';
import PullRequestsPage from './pages/PullRequests/PullRequestsPage';
import PullRequestDetailPage from './pages/PullRequests/PullRequestDetailPage';
import RepositoriesPage from './pages/Repositories/RepositoriesPage';
import RepositoryDetailPage from './pages/Repositories/RepositoryDetailPage';
import RepositoryAnalyticsPage from './pages/Repositories/RepositoryAnalyticsPage';
import MetricsPage from './pages/Metrics/MetricsPage';
import SettingsPage from './pages/Settings/SettingsPage';
import NotFoundPage from './pages/Error/NotFoundPage';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
      >
        <LoadingSpinner size={40} />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Public Route Component (redirect to dashboard if authenticated)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="100vh"
      >
        <LoadingSpinner size={40} />
      </Box>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  return (
    <div className="App">
      <Routes>
        {/* Public Routes */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          } 
        />

        {/* Protected Routes */}
        <Route 
          path="/*" 
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  {/* Dashboard */}
                  <Route path="/dashboard" element={<DashboardPage />} />
                  
                  {/* Team */}
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/contributor/:username" element={<ContributorPage />} />
                  
                  {/* User Profiles */}
                  <Route path="/users/:userId" element={<UserProfilePage />} />
                  
                  {/* Pull Requests */}
                  <Route path="/pull-requests" element={<PullRequestsPage />} />
                  <Route path="/pull-requests/:prId" element={<PullRequestDetailPage />} />
                  
                  {/* Repositories */}
                  <Route path="/repositories" element={<RepositoriesPage />} />
                  <Route path="/repositories/:repositoryId/analytics" element={<RepositoryAnalyticsPage />} />
                  <Route path="/repositories/:repoId" element={<RepositoryDetailPage />} />
                  
                  {/* Metrics */}
                  <Route path="/metrics" element={<MetricsPage />} />
                  
                  {/* Settings */}
                  <Route path="/settings" element={<SettingsPage />} />
                  
                  {/* Default redirect */}
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  
                  {/* 404 */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </div>
  );
}

export default App;