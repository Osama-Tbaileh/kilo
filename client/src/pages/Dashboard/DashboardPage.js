import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress
} from '@mui/material';
import {
  Sync as SyncIcon,
  TrendingUp as TrendingUpIcon,
  Code as CodeIcon,
  RateReview as ReviewIcon,
  EmojiEvents as RankIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);

  const fetchStats = async () => {
    try {
      console.log('=== FRONTEND FETCH STATS DEBUG ===');
      const token = localStorage.getItem('auth_token'); // Fixed: was 'token', should be 'auth_token'
      console.log('Token from localStorage:', token);
      console.log('Token type:', typeof token);
      console.log('Token length:', token ? token.length : 0);
      console.log('Token is null:', token === null);
      console.log('Token is "null" string:', token === 'null');
      
      const response = await fetch('/api/team/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Error response text:', errorText);
        throw new Error('Failed to fetch stats');
      }
      
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    try {
      console.log('=== FRONTEND TRIGGER SYNC DEBUG ===');
      setSyncing(true);
      setError(null);
      
      const token = localStorage.getItem('auth_token'); // Fixed: was 'token', should be 'auth_token'
      console.log('Token from localStorage:', token);
      console.log('Token type:', typeof token);
      console.log('Token length:', token ? token.length : 0);
      console.log('Token is null:', token === null);
      console.log('Token is "null" string:', token === 'null');
      console.log('All localStorage keys:', Object.keys(localStorage));
      
      // Check if user is actually logged in
      console.log('User from context:', user);
      
      const response = await fetch('/api/team/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Sync response status:', response.status);
      console.log('Sync response ok:', response.ok);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.log('Sync error response:', errorData);
        throw new Error(errorData.error || 'Failed to trigger sync');
      }
      
      const result = await response.json();
      console.log('Sync triggered:', result);
      
      // Poll for sync completion
      pollSyncStatus();
      
    } catch (err) {
      console.error('Error triggering sync:', err);
      setError(err.message);
      setSyncing(false);
    }
  };

  const pollSyncStatus = async () => {
    const token = localStorage.getItem('token');
    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem('auth_token'); // Add token retrieval for sync status
        const response = await fetch('/api/team/sync/status', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const status = await response.json();
          setSyncStatus(status);
          
          if (!status.inProgress) {
            clearInterval(pollInterval);
            setSyncing(false);
            // Refresh stats after sync completes
            fetchStats();
          }
        }
      } catch (err) {
        console.error('Error polling sync status:', err);
      }
    }, 2000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setSyncing(false);
    }, 300000);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '--';
    return num.toLocaleString();
  };

  const hasData = stats && (stats.totals.pullRequests > 0 || stats.totals.commits > 0);

  return (
    <Box sx={{ p: 3, width: '100%' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Typography variant="h4" component="h1">
            Welcome, {user?.name || user?.username}!
          </Typography>
          <Box display="flex" gap={2}>
            <Button
              variant="contained"
              startIcon={syncing ? <CircularProgress size={20} /> : <SyncIcon />}
              onClick={triggerSync}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync Data'}
            </Button>
            <Button variant="outlined" onClick={logout}>
              Logout
            </Button>
          </Box>
        </Box>

        {syncing && (
          <Box mb={3}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                Syncing GitHub data... This may take a few minutes.
              </Typography>
            </Alert>
            <LinearProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" py={8}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6} lg={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <CodeIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      Pull Requests
                    </Typography>
                  </Box>
                  <Typography variant="h3" color="primary">
                    {stats?.userStats?.pullRequests !== undefined
                      ? formatNumber(stats.userStats.pullRequests)
                      : formatNumber(stats?.recent?.pullRequests)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    This month
                  </Typography>
                  {stats?.totals?.pullRequests > 0 && (
                    <Chip
                      label={`${formatNumber(stats.totals.pullRequests)} total`}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} lg={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <ReviewIcon color="success" sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      Reviews Given
                    </Typography>
                  </Box>
                  <Typography variant="h3" color="success.main">
                    {stats?.userStats?.reviews !== undefined
                      ? formatNumber(stats.userStats.reviews)
                      : formatNumber(stats?.recent?.reviews)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    This month
                  </Typography>
                  {stats?.totals?.reviews > 0 && (
                    <Chip
                      label={`${formatNumber(stats.totals.reviews)} total`}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} lg={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <TrendingUpIcon color="warning" sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      Commits
                    </Typography>
                  </Box>
                  <Typography variant="h3" color="warning.main">
                    {stats?.userStats?.commits !== undefined
                      ? formatNumber(stats.userStats.commits)
                      : formatNumber(stats?.recent?.commits)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    This month
                  </Typography>
                  {stats?.totals?.commits > 0 && (
                    <Chip
                      label={`${formatNumber(stats.totals.commits)} total`}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} lg={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <RankIcon color="info" sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      Team Rank
                    </Typography>
                  </Box>
                  <Typography variant="h3" color="info.main">
                    {stats?.userStats?.rank || '--'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    This month
                  </Typography>
                  {stats?.totals?.users > 0 && (
                    <Chip
                      label={`of ${formatNumber(stats.totals.users)} members`}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>

            {!hasData && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Getting Started
                    </Typography>
                    <Typography variant="body1" paragraph>
                      Welcome to GitHub Team Insights! This dashboard will show your team's GitHub activity and metrics.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      To see your data, click the "Sync Data" button above to fetch your GitHub activity.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      The sync process will collect:
                    </Typography>
                    <Box component="ul" mt={1} mb={2}>
                      <li>Team members and their GitHub profiles</li>
                      <li>Repository information and activity</li>
                      <li>Pull requests, reviews, and comments</li>
                      <li>Commit history and code metrics</li>
                    </Box>
                    <Button
                      variant="contained"
                      startIcon={<SyncIcon />}
                      onClick={triggerSync}
                      disabled={syncing}
                    >
                      Start Data Sync
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {hasData && stats?.topContributors?.length > 0 && (
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Top Contributors This Month
                    </Typography>
                    {stats.topContributors.slice(0, 5).map((contributor, index) => (
                      <Box key={contributor.user?.username || index} display="flex" justifyContent="space-between" alignItems="center" py={1}>
                        <Typography variant="body2">
                          {contributor.user?.name || contributor.user?.username || 'Unknown'}
                        </Typography>
                        <Chip
                          label={`${contributor.pullRequests} PRs`}
                          size="small"
                          color={index === 0 ? 'primary' : 'default'}
                        />
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            )}

            {hasData && stats?.repositoryActivity?.length > 0 && (
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Most Active Repositories
                    </Typography>
                    {stats.repositoryActivity.slice(0, 5).map((repo, index) => (
                      <Box key={repo.repository?.id || index} display="flex" justifyContent="space-between" alignItems="center" py={1}>
                        <Box>
                          <Typography variant="body2">
                            {repo.repository?.name || 'Unknown'}
                          </Typography>
                          {repo.repository?.language && (
                            <Typography variant="caption" color="text.secondary">
                              {repo.repository.language}
                            </Typography>
                          )}
                        </Box>
                        <Chip
                          label={`${repo.pullRequests} PRs`}
                          size="small"
                          color={index === 0 ? 'secondary' : 'default'}
                        />
                      </Box>
                    ))}
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        )}

        {stats && (
          <Box mt={3}>
            <Typography variant="caption" color="text.secondary">
              Last updated: {new Date(stats.lastUpdated).toLocaleString()}
            </Typography>
          </Box>
        )}
    </Box>
  );
};

export default DashboardPage;