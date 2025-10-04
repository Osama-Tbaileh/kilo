import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  CircularProgress,
  Alert,
  IconButton
} from '@mui/material';
import {
  Analytics as AnalyticsIcon,
  Code as CodeIcon,
  Star as StarIcon,
  CallSplit as ForkIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';

const RepositoriesPage = () => {
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRepositories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/repositories-graphql', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch repositories');
      }
      
      const data = await response.json();
      setRepositories(data.repositories || []);
    } catch (err) {
      console.error('Error fetching repositories:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositories();
  }, []);

  const handleAnalyticsClick = (repositoryId) => {
    navigate(`/repositories/${repositoryId}/analytics`);
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Repositories
        </Typography>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, width: '100%' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Repositories
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Click on "View Analytics" to see detailed contributor statistics for each repository.
        </Typography>

        {repositories.length === 0 ? (
          <Alert severity="info">
            No repositories found. Make sure to sync your GitHub data first.
          </Alert>
        ) : (
          <Grid container spacing={3}>
            {repositories.map((repo) => (
              <Grid item xs={12} md={6} lg={4} key={repo.id}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                      <Typography variant="h6" component="h2" noWrap>
                        {repo.name}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => window.open(repo.htmlUrl, '_blank')}
                        title="Open on GitHub"
                      >
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {repo.fullName}
                    </Typography>
                    
                    {repo.description && (
                      <Typography variant="body2" sx={{ mb: 2 }} noWrap>
                        {repo.description}
                      </Typography>
                    )}
                    
                    <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                      {repo.language && (
                        <Chip
                          label={repo.language}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                      {repo.private && (
                        <Chip
                          label="Private"
                          size="small"
                          color="secondary"
                          variant="outlined"
                        />
                      )}
                    </Box>
                    
                    <Box display="flex" gap={2} mb={2}>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <StarIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {repo.stargazersCount || 0}
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <ForkIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {repo.forksCount || 0}
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap={0.5}>
                        <CodeIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {repo.size ? `${Math.round(repo.size / 1024)} MB` : '0 MB'}
                        </Typography>
                      </Box>
                    </Box>
                    
                    <Button
                      variant="contained"
                      startIcon={<AnalyticsIcon />}
                      onClick={() => handleAnalyticsClick(repo.id)}
                      fullWidth
                    >
                      View Analytics
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
    </Box>
  );
};

export default RepositoriesPage;