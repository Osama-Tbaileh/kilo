import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Avatar,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Stack,
  Paper,
  Tab,
  Tabs,
  Badge
} from '@mui/material';
import {
  Group as TeamIcon,
  Person as PersonIcon,
  TrendingUp as TrendingUpIcon,
  Commit as CommitIcon,
  MergeType as PullRequestIcon,
  RateReview as ReviewIcon,
  Analytics as AnalyticsIcon,
  Refresh as RefreshIcon,
  Business as CompanyIcon,
  LocationOn as LocationIcon,
  Email as EmailIcon,
  Speed as SpeedIcon,
  Timeline as TimelineIcon,
  EmojiEvents as TrophyIcon
} from '@mui/icons-material';
import { 
  PieChart, 
  Pie, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip
} from 'recharts';
import api from '../../services/api';

const TeamPage = () => {
  const navigate = useNavigate();
  
  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [teamStats, setTeamStats] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [period, setPeriod] = useState('month');
  
  // Colors for charts
  const COLORS = ['#667eea', '#48bb78', '#ed8936', '#e53e3e', '#9f7aea', '#38b2ac'];

  // Fetch team data
  const fetchTeamData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Try to fetch from the new GraphQL endpoint first, fallback to original APIs
      try {
        console.log('🔍 Attempting GraphQL request...');
        const graphqlData = await api.get(`/team-graphql/analytics?period=${period}&includeDetails=true`);
        
        console.log('🔍 Raw GraphQL Data received:', graphqlData);
        console.log('🔍 GraphQL Data type:', typeof graphqlData);
        console.log('🔍 Has contributors?:', !!graphqlData?.contributors);
        console.log('🔍 Has repositories?:', !!graphqlData?.repositories);
        
        if (graphqlData && typeof graphqlData === 'object') {
          console.log('🔍 GraphQL Response received:', graphqlData);
          console.log('🔍 Contributors:', graphqlData.contributors);
          console.log('🔍 Repositories:', graphqlData.repositories);
          console.log('🔍 Totals:', graphqlData.totals);
          
          try {
            console.log('🔄 Starting data transformation...');
            
            const teamStatsData = {
              period: graphqlData.period,
              totals: {
                users: graphqlData.totals?.contributors || 0,
                repositories: graphqlData.totals?.repositories || 0,
                pullRequests: graphqlData.totals?.pullRequests || 0,
                reviews: graphqlData.totals?.reviews || 0
              },
              recent: {
                pullRequests: graphqlData.totals?.pullRequests || 0,
                commits: Math.floor((graphqlData.totals?.pullRequests || 0) * 2.5), // Estimated
                reviews: graphqlData.totals?.reviews || 0
              },
              topContributors: (graphqlData.contributors || []).slice(0, 5).map(contributor => ({
                user: {
                  username: contributor.login || 'unknown',
                  name: contributor.name || contributor.login || 'Unknown',
                  avatarUrl: contributor.avatarUrl || ''
                },
                pullRequests: contributor.pullRequests || 0
              })),
              repositoryActivity: (graphqlData.repositories || []).map(repo => ({
                repository: {
                  name: repo.name || 'Unknown',
                  fullName: repo.name || 'Unknown',
                  language: repo.primaryLanguage?.name || 'Unknown'
                },
                pullRequests: repo.recentPRs || 0
              }))
            };
            
            console.log('🔄 Team stats data prepared:', teamStatsData);
            console.log('📊 Repository Activity Data:', teamStatsData.repositoryActivity);
            console.log('📊 Repositories with activity:', teamStatsData.repositoryActivity.filter(repo => repo.pullRequests > 0));
            console.log('📊 Total repositories:', teamStatsData.repositoryActivity.length);
            setTeamStats(teamStatsData);
            
            // Transform contributors to team members format
            const teamMembersData = (graphqlData.contributors || []).map(contributor => ({
              id: contributor.login || 'unknown',
              username: contributor.login || 'unknown',
              name: contributor.name || contributor.login || 'Unknown',
              avatarUrl: contributor.avatarUrl || '',
              isActive: true,
              role: 'Developer',
              bio: contributor.bio || '',
              company: contributor.company || '',
              location: contributor.location || '',
              email: ''
            }));
            
            console.log('🔄 Team members data prepared:', teamMembersData);
            setTeamMembers(teamMembersData);
            
            setError(null);
            console.log('✅ Using GraphQL data for team analytics');
            return;
          } catch (transformError) {
            console.error('❌ Error during data transformation:', transformError);
            throw transformError; // Re-throw to trigger fallback
          }
        } else {
          console.warn('❌ GraphQL data is empty or invalid:', graphqlData);
          throw new Error('GraphQL data is empty or invalid');
        }
      } catch (graphqlError) {
        console.warn('❌ GraphQL endpoint failed:', graphqlError);
        console.warn('Response status:', graphqlError.response?.status);
        console.warn('Response data:', graphqlError.response?.data);
        console.warn('Falling back to original APIs...');
      }
      
      // Fallback to original APIs
      console.log('🔄 Falling back to original APIs...');
      
      try {
        const [statsData, membersData] = await Promise.all([
          api.get(`/team/stats?period=${period}`),
          api.get('/team/members')
        ]);
        
        console.log('📊 Stats data received:', statsData);
        console.log('📊 Stats data type:', typeof statsData);
        console.log('👥 Members data received:', membersData);
        console.log('👥 Members data type:', typeof membersData);
        
        if (statsData && typeof statsData === 'object') {
          setTeamStats(statsData);
          console.log('📊 Stats data set successfully');
        }
        
        if (membersData) {
          const members = Array.isArray(membersData) 
            ? membersData 
            : (membersData?.members || []);
          setTeamMembers(members);
          console.log('👥 Processed members:', members);
        }
        
        setError(null);
        console.log('✅ Using original APIs for team data');
      } catch (fallbackError) {
        console.error('❌ Fallback APIs also failed:', fallbackError);
        throw fallbackError;
      }
      
    } catch (err) {
      console.error('❌ All attempts to fetch team data failed:', err);
      
      // Emergency fallback: provide placeholder data so the UI doesn't completely break
      setTeamStats({
        period: period,
        totals: {
          users: 0,
          repositories: 0,
          pullRequests: 0,
          reviews: 0
        },
        recent: {
          pullRequests: 0,
          commits: 0,
          reviews: 0
        },
        topContributors: [],
        repositoryActivity: []
      });
      setTeamMembers([]);
      
      setError('Failed to load team data. Please check if the server is running.');
    } finally {
      setLoading(false);
    }
  }, [period]); // useCallback dependencies

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData, period]);

  // Loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={40} />
          <Typography variant="body2" color="text.secondary">
            Loading team insights...
          </Typography>
        </Stack>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={fetchTeamData}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  // Check if we have the required data
  if (!teamStats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={40} />
          <Typography variant="body2" color="text.secondary">
            Processing team data...
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* Header Section */}
      <Paper 
        elevation={0} 
        sx={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          py: 6,
          px: 4,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={8}>
            <Stack spacing={2}>
              <Box display="flex" alignItems="center" gap={2}>
                <Avatar sx={{ width: 60, height: 60, bgcolor: 'rgba(255,255,255,0.2)' }}>
                  <TeamIcon sx={{ fontSize: 32 }} />
                </Avatar>
                <Box>
                  <Typography variant="h3" component="h1" fontWeight="bold">
                    Team Dashboard
                  </Typography>
                  <Typography variant="h6" sx={{ opacity: 0.9 }}>
                    Comprehensive team analytics and insights
                  </Typography>
                </Box>
              </Box>
              
              <Typography variant="body1" sx={{ opacity: 0.8, maxWidth: 500 }}>
                Track your team's productivity, collaboration patterns, and contribution metrics.
              </Typography>
            </Stack>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Stack spacing={2} alignItems="flex-end">
              <Tooltip title="Refresh Data">
                <IconButton 
                  onClick={fetchTeamData}
                  sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              
              <Chip
                label={`${teamMembers.length} Team Members`}
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.2)', 
                  color: 'white',
                  fontWeight: 'bold'
                }}
                icon={<PersonIcon sx={{ color: 'white !important' }} />}
              />
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Tabs Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Tabs 
          value={activeTab} 
          onChange={(event, newValue) => setActiveTab(newValue)}
          sx={{ px: 4 }}
        >
          <Tab icon={<AnalyticsIcon />} label="Overview" />
          <Tab icon={<PersonIcon />} label="Team Members" />
          <Tab icon={<TrendingUpIcon />} label="Performance" />
        </Tabs>
      </Box>

      {/* Main Content */}
      <Box sx={{ p: 4 }}>
        {/* Overview Tab */}
        {activeTab === 0 && (
          <Stack spacing={4}>
            {/* Key Metrics Cards */}
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography color="text.secondary" gutterBottom>
                          Contributors
                        </Typography>
                        <Typography variant="h4" component="div" color="primary">
                          {teamStats?.totals?.users || 0}
                        </Typography>
                      </Box>
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        <PersonIcon />
                      </Avatar>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography color="text.secondary" gutterBottom>
                          Pull Requests
                        </Typography>
                        <Typography variant="h4" component="div" color="success.main">
                          {teamStats?.recent?.pullRequests || 0}
                        </Typography>
                      </Box>
                      <Avatar sx={{ bgcolor: 'success.main' }}>
                        <PullRequestIcon />
                      </Avatar>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography color="text.secondary" gutterBottom>
                          Reviews
                        </Typography>
                        <Typography variant="h4" component="div" color="warning.main">
                          {teamStats?.recent?.reviews || 0}
                        </Typography>
                      </Box>
                      <Avatar sx={{ bgcolor: 'warning.main' }}>
                        <ReviewIcon />
                      </Avatar>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography color="text.secondary" gutterBottom>
                          Commits
                        </Typography>
                        <Typography variant="h4" component="div" color="info.main">
                          {teamStats?.recent?.commits || 0}
                        </Typography>
                      </Box>
                      <Avatar sx={{ bgcolor: 'info.main' }}>
                        <CommitIcon />
                      </Avatar>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Charts Section */}
            <Grid container spacing={3}>
              {/* Top Contributors Chart */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: 400 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Top Contributors
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Most active team members
                    </Typography>
                    {teamStats?.topContributors?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={teamStats.topContributors.map((contributor, index) => ({
                              name: contributor.user?.name || contributor.user?.username || 'Unknown',
                              value: contributor.pullRequests || 0,
                              fill: COLORS[index % COLORS.length]
                            }))}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`}
                          />
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280 }}>
                        <Typography variant="body2" color="text.secondary">
                          No contributor data available
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Repository Activity Chart */}
              <Grid item xs={12} md={6}>
                <Card sx={{ height: 400 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Repository Activity
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Pull requests created in the last {period === 'week' ? '7 days' : period === 'month' ? '30 days' : period === 'quarter' ? '90 days' : '365 days'} (active repositories only)
                    </Typography>
                    {teamStats?.repositoryActivity?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={teamStats.repositoryActivity
                          .filter(repo => (repo.pullRequests || 0) > 0) // Only show repos with activity
                          .sort((a, b) => (b.pullRequests || 0) - (a.pullRequests || 0)) // Sort by activity (descending)
                          .slice(0, 10) // Show top 10 most active repositories
                          .map(repo => ({
                            name: repo.repository?.name || 'Unknown',
                            pullRequests: repo.pullRequests || 0
                          }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="name" 
                            angle={-45}
                            textAnchor="end"
                            height={80}
                            interval={0}
                          />
                          <YAxis />
                          <RechartsTooltip />
                          <Bar dataKey="pullRequests" fill="#667eea" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280 }}>
                        <Typography variant="body2" color="text.secondary">
                          No repository data available
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Stack>
        )}

        {/* Team Members Tab */}
        {activeTab === 1 && (
          <Stack spacing={4}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="h5">Team Members ({teamMembers.length})</Typography>
            </Box>

            <Grid container spacing={3}>
              {teamMembers.map((member) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={member.id}>
                  <Card 
                    sx={{ 
                      height: '100%',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 4,
                        cursor: 'pointer'
                      }
                    }}
                    onClick={() => navigate(`/contributor/${member.username}`)}
                  >
                    <CardContent>
                      <Stack spacing={2} alignItems="center" textAlign="center">
                        <Badge
                          badgeContent={member.isActive ? '●' : '○'}
                          color={member.isActive ? 'success' : 'default'}
                          overlap="circular"
                        >
                          <Avatar 
                            src={member.avatarUrl}
                            sx={{ width: 64, height: 64 }}
                          >
                            {member.name?.[0] || member.username?.[0] || '?'}
                          </Avatar>
                        </Badge>

                        <Box>
                          <Typography variant="h6" noWrap>
                            {member.name || member.username}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            @{member.username}
                          </Typography>
                        </Box>

                        <Chip
                          label={member.role || 'Developer'}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />

                        <Stack direction="row" spacing={1} justifyContent="center">
                          {member.company && (
                            <Tooltip title={member.company}>
                              <CompanyIcon fontSize="small" color="action" />
                            </Tooltip>
                          )}
                          {member.location && (
                            <Tooltip title={member.location}>
                              <LocationIcon fontSize="small" color="action" />
                            </Tooltip>
                          )}
                          {member.email && (
                            <Tooltip title={member.email}>
                              <EmailIcon fontSize="small" color="action" />
                            </Tooltip>
                          )}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Stack>
        )}

        {/* Performance Tab */}
        {activeTab === 2 && (
          <Stack spacing={4}>
            <Typography variant="h5">Team Performance Metrics</Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <TrophyIcon sx={{ fontSize: 48, color: 'warning.main', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Team Velocity
                    </Typography>
                    <Typography variant="h4" color="primary">
                      {((teamStats?.recent?.pullRequests || 0) / 7).toFixed(1)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      PRs per day
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <SpeedIcon sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Review Speed
                    </Typography>
                    <Typography variant="h4" color="success.main">
                      {teamStats?.recent?.reviews && teamStats?.recent?.pullRequests 
                        ? (teamStats.recent.reviews / teamStats.recent.pullRequests).toFixed(1)
                        : '0.0'
                      }
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Reviews per PR
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <TimelineIcon sx={{ fontSize: 48, color: 'info.main', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Code Quality
                    </Typography>
                    <Typography variant="h4" color="info.main">
                      {teamStats?.recent?.commits && teamStats?.recent?.pullRequests
                        ? (teamStats.recent.commits / teamStats.recent.pullRequests).toFixed(1)
                        : '0.0'
                      }
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Commits per PR
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Performance Timeline
        </Typography>
                <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
                  {['week', 'month', 'quarter', 'year'].map((p) => (
                    <Button
                      key={p}
                      size="small"
                      variant={period === p ? 'contained' : 'outlined'}
                      onClick={() => setPeriod(p)}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Button>
                  ))}
                </Stack>

                <Box 
                  sx={{ 
                    height: 200, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    bgcolor: 'action.hover',
                    borderRadius: 1
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Timeline chart will show activity trends
        </Typography>
      </Box>
              </CardContent>
            </Card>
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default TeamPage;
