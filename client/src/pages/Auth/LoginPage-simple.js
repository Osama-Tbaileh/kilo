import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Container,
  Alert,
  CircularProgress
} from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/Common/LoadingSpinner';

const LoginPage = () => {
  const navigate = useNavigate();
  const { getGitHubAuthURL, loading, error, isAuthenticated } = useAuth();
  const [authLoading, setAuthLoading] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleGitHubLogin = async () => {
    try {
      setAuthLoading(true);
      const authUrl = await getGitHubAuthURL();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Failed to get GitHub auth URL:', error);
      setAuthLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <Container maxWidth="sm">
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          minHeight="100vh"
        >
          <LoadingSpinner size={40} message="Authenticating..." />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <Card sx={{ width: '100%', maxWidth: 400 }}>
          <CardContent sx={{ p: 4 }}>
            <Box textAlign="center" mb={4}>
              <GitHubIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
              <Typography variant="h4" component="h1" gutterBottom>
                GitHub Team Insights
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Sign in with your GitHub account to access team analytics and insights
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={authLoading ? <CircularProgress size={20} /> : <GitHubIcon />}
              onClick={handleGitHubLogin}
              disabled={authLoading}
              sx={{ py: 1.5 }}
            >
              {authLoading ? 'Connecting...' : 'Sign in with GitHub'}
            </Button>

            <Box mt={3}>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                By signing in, you agree to access your GitHub organization data
                for analytics purposes.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default LoginPage;