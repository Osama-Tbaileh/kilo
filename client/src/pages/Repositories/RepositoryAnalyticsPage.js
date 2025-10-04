import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Collapse,
  IconButton,
  Chip,
  Avatar,
  CircularProgress,
  Alert,
  Stack,
  InputAdornment,
  Tooltip,
  Checkbox
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Code as CodeIcon,
  Merge as PullRequestIcon,
  RateReview as ReviewIcon,
  Commit as CommitIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
  Link as LinkIcon,
  PictureAsPdf as PdfIcon,
  Clear as ClearIcon,
  Analytics as AnalyticsIcon,
  Assessment as AssessmentIcon,
  SelectAll as SelectAllIcon,
  ClearAll as DeselectAllIcon
} from '@mui/icons-material';
import moment from 'moment';
import jsPDF from 'jspdf';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer
} from 'recharts';

const RepositoryAnalyticsPage = () => {
  const { repositoryId } = useParams();
  const navigate = useNavigate();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(moment().subtract(30, 'days'));
  const [endDate, setEndDate] = useState(moment());
  const [expandedContributors, setExpandedContributors] = useState(new Set());

  // PR data state
  const [allPRs, setAllPRs] = useState([]);
  
  // Search/Filter state
  const [searchTerm, setSearchTerm] = useState('');
  
  // Insights visibility state
  const [showInsights, setShowInsights] = useState(false);
  
  // PR selection state (for filtering analytics)
  const [selectedPRs, setSelectedPRs] = useState(new Set());

  // Calculate PR duration (time from creation to close/merge)
  const getPRDuration = (pr) => {
    const createdAt = moment(pr.createdAt);
    const closedAt = pr.mergedAt || pr.closedAt;
    
    if (!closedAt) {
      return 'Open'; // Still open
    }
    
    const endDate = moment(closedAt);
    const totalHours = endDate.diff(createdAt, 'hours');
    const totalDays = Math.floor(totalHours / 24);
    const remainingHours = totalHours % 24;
    
    if (totalDays > 0 && remainingHours > 0) {
      return `${totalDays}d ${remainingHours}h`;
    } else if (totalDays > 0) {
      return `${totalDays}d`;
    } else if (totalHours > 0) {
      return `${totalHours}h`;
    } else {
      return '<1h';
    }
  };

  // Calculate average PR duration for closed PRs
  const getAveragePRDuration = (prs) => {
    const closedPRs = prs.filter(pr => pr.mergedAt || pr.closedAt);
    if (closedPRs.length === 0) return '0d';
    
    const totalHours = closedPRs.reduce((sum, pr) => {
      const createdAt = moment(pr.createdAt);
      const closedAt = moment(pr.mergedAt || pr.closedAt);
      return sum + closedAt.diff(createdAt, 'hours');
    }, 0);
    
    const avgHours = Math.round(totalHours / closedPRs.length);
    const avgDays = Math.floor(avgHours / 24);
    const remainingHours = avgHours % 24;
    
    if (avgDays > 0 && remainingHours > 0) {
      return `${avgDays}d ${remainingHours}h`;
    } else if (avgDays > 0) {
      return `${avgDays}d`;
    } else if (avgHours > 0) {
      return `${avgHours}h`;
    } else {
      return '<1h';
    }
  };

  // Calculate average PR duration for merged PRs only (excluding closed PRs)
  const getAverageMergedPRDuration = (prs) => {
    const mergedPRs = prs.filter(pr => pr.mergedAt && pr.state === 'MERGED');
    if (mergedPRs.length === 0) return '0d';
    
    const totalHours = mergedPRs.reduce((sum, pr) => {
      const createdAt = moment(pr.createdAt);
      const mergedAt = moment(pr.mergedAt);
      return sum + mergedAt.diff(createdAt, 'hours');
    }, 0);
    
    const avgHours = Math.round(totalHours / mergedPRs.length);
    const avgDays = Math.floor(avgHours / 24);
    const remainingHours = avgHours % 24;
    
    if (avgDays > 0 && remainingHours > 0) {
      return `${avgDays}d ${remainingHours}h`;
    } else if (avgDays > 0) {
      return `${avgDays}d`;
    } else if (avgHours > 0) {
      return `${avgHours}h`;
    } else {
      return '<1h';
    }
  };

  // PR selection handlers
  const togglePRSelection = (prId) => {
    const newSelected = new Set(selectedPRs);
    if (newSelected.has(prId)) {
      newSelected.delete(prId);
    } else {
      newSelected.add(prId);
    }
    setSelectedPRs(newSelected);
  };

  const selectAllPRs = () => {
    const allIds = new Set(allPRs.map(pr => pr.id));
    setSelectedPRs(allIds);
  };

  const deselectAllPRs = () => {
    setSelectedPRs(new Set());
  };

  // Get filtered statistics based on selected PRs
  const getFilteredStats = () => {
    const selectedPRsList = allPRs.filter(pr => selectedPRs.has(pr.id));
    return {
      totalPRs: selectedPRsList.length,
      mergedPRs: selectedPRsList.filter(pr => pr.state === 'MERGED').length,
      openPRs: selectedPRsList.filter(pr => pr.state === 'OPEN').length,
      closedPRs: selectedPRsList.filter(pr => pr.state === 'CLOSED').length,
      linesAdded: selectedPRsList.reduce((sum, pr) => sum + (pr.additions || 0), 0),
      linesDeleted: selectedPRsList.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
      commits: selectedPRsList.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0)
    };
  };

  // Get dynamic contributor stats based on selected PRs
  const getDynamicContributorStats = (contributorData) => {
    if (!contributorData.pullRequests) return contributorData.stats;
    
    // Filter contributor's PRs based on selected PRs
    const selectedContributorPRs = contributorData.pullRequests.filter(pr => selectedPRs.has(pr.id));
    
    const opened = selectedContributorPRs.length;
    const merged = selectedContributorPRs.filter(pr => pr.state === 'MERGED').length;
    const closed = selectedContributorPRs.filter(pr => pr.state === 'CLOSED').length;
    
    // Overall merge rate (includes both merged and closed PRs as "resolved")
    const mergeRate = opened > 0 ? Math.round((merged / opened) * 100) : 0;
    
    // Merge rate excluding closed PRs (only successful merges)
    const nonClosedPRs = selectedContributorPRs.filter(pr => pr.state !== 'CLOSED');
    const mergeRateExcludingClosed = nonClosedPRs.length > 0 ? Math.round((merged / nonClosedPRs.length) * 100) : 0;
    
    const linesAdded = selectedContributorPRs.reduce((sum, pr) => sum + (pr.additions || 0), 0);
    const linesRemoved = selectedContributorPRs.reduce((sum, pr) => sum + (pr.deletions || 0), 0);
    const commits = selectedContributorPRs.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0);
    const reviewsReceived = selectedContributorPRs.reduce((sum, pr) => sum + (pr.reviews?.totalCount || 0), 0);
    
    // Calculate total comments GIVEN by this contributor across ALL selected PRs
    const allSelectedPRs = allPRs.filter(pr => selectedPRs.has(pr.id));
    const totalCommentsGiven = getCommentsGivenByContributor(contributorData.contributor.username, allSelectedPRs);
    
    return {
      pullRequests: { 
        opened, 
        merged, 
        mergeRate,
        mergeRateExcludingClosed
      },
      linesOfCode: { added: linesAdded, removed: linesRemoved },
      reviews: { 
        given: contributorData.stats.reviews.given, // This comes from server, not PR-specific
        received: reviewsReceived 
      },
      commits: { total: commits },
      comments: { total: totalCommentsGiven }
    };
  };







  // Calculate insights based on selected PRs (FIXED - was missing!)
  const calculateInsights = () => {
    const selectedPRsList = allPRs.filter(pr => selectedPRs.has(pr.id));
    
    if (selectedPRsList.length === 0) {
      return null;
    }

    // Status distribution
    const statusDistribution = {};
    selectedPRsList.forEach(pr => {
      statusDistribution[pr.state] = (statusDistribution[pr.state] || 0) + 1;
    });

    // Code volume
    const codeVolume = {
      additions: selectedPRsList.reduce((sum, pr) => sum + (pr.additions || 0), 0),
      deletions: selectedPRsList.reduce((sum, pr) => sum + (pr.deletions || 0), 0)
    };

    // Code quality distribution
    const codeQualityDistribution = {
      'Small (< 100 lines)': 0,
      'Medium (100-500 lines)': 0,
      'Large (500-1000 lines)': 0,
      'XLarge (> 1000 lines)': 0
    };
    
    selectedPRsList.forEach(pr => {
      const totalLines = (pr.additions || 0) + (pr.deletions || 0);
      if (totalLines < 100) codeQualityDistribution['Small (< 100 lines)']++;
      else if (totalLines < 500) codeQualityDistribution['Medium (100-500 lines)']++;
      else if (totalLines < 1000) codeQualityDistribution['Large (500-1000 lines)']++;
      else codeQualityDistribution['XLarge (> 1000 lines)']++;
    });

    // Team metrics
    const teamMetrics = {
      avgLinesPerPR: Math.round(codeVolume.additions / selectedPRsList.length || 0),
      avgReviewsPerPR: (selectedPRsList.reduce((sum, pr) => sum + (pr.reviews?.totalCount || 0), 0) / selectedPRsList.length || 0).toFixed(1),
      totalCommits: selectedPRsList.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0),
      avgCommitsPerPR: (selectedPRsList.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0) / selectedPRsList.length || 0).toFixed(1)
    };

    // Collaboration matrix
    const collaborationMatrix = {};
    selectedPRsList.forEach(pr => {
      const author = pr.author?.login;
      if (author && !collaborationMatrix[author]) {
        collaborationMatrix[author] = { reviewsGiven: 0, reviewsReceived: 0, collaborationScore: 0 };
      }
      if (author) {
        collaborationMatrix[author].reviewsReceived += pr.reviews?.totalCount || 0;
        collaborationMatrix[author].collaborationScore = collaborationMatrix[author].reviewsGiven + collaborationMatrix[author].reviewsReceived;
      }
    });

    // Review quality data
    const reviewQualityData = Object.keys(collaborationMatrix).map(username => {
      const contributorData = data?.contributors?.find(c => c.contributor.username === username);
      if (!contributorData) return null;
      const stats = getDynamicContributorStats(contributorData);
      return {
        name: username,
        mergeRate: stats.pullRequests.mergeRate,
        avgReviewsPerPR: stats.pullRequests.opened > 0 ? (stats.reviews.received / stats.pullRequests.opened).toFixed(1) : '0.0'
      };
    }).filter(Boolean);

    // Contributor activity
    const contributorActivity = Object.keys(collaborationMatrix).map(username => {
      const userPRs = selectedPRsList.filter(pr => pr.author?.login === username);
      return {
        name: username,
        prs: userPRs.length,
        reviews: collaborationMatrix[username].reviewsReceived,
        commits: userPRs.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0)
      };
    }).sort((a, b) => b.prs - a.prs);

    // Weekly distribution
    const weeklyDistributionData = [
      { day: 'Mon', total: 0, contributors: 0, avgPerContributor: 0 },
      { day: 'Tue', total: 0, contributors: 0, avgPerContributor: 0 },
      { day: 'Wed', total: 0, contributors: 0, avgPerContributor: 0 },
      { day: 'Thu', total: 0, contributors: 0, avgPerContributor: 0 },
      { day: 'Fri', total: 0, contributors: 0, avgPerContributor: 0 },
      { day: 'Sat', total: 0, contributors: 0, avgPerContributor: 0 },
      { day: 'Sun', total: 0, contributors: 0, avgPerContributor: 0 }
    ];

    selectedPRsList.forEach(pr => {
      const dayIndex = moment(pr.createdAt).day();
      const adjustedIndex = dayIndex === 0 ? 6 : dayIndex - 1;
      weeklyDistributionData[adjustedIndex].total++;
    });

    weeklyDistributionData.forEach(day => {
      const uniqueContributors = new Set(
        selectedPRsList
          .filter(pr => {
            const dayIndex = moment(pr.createdAt).day();
            const adjustedIndex = dayIndex === 0 ? 6 : dayIndex - 1;
            return adjustedIndex === weeklyDistributionData.indexOf(day);
          })
          .map(pr => pr.author?.login)
          .filter(Boolean)
      ).size;
      day.contributors = uniqueContributors;
      day.avgPerContributor = uniqueContributors > 0 ? (day.total / uniqueContributors).toFixed(1) : 0;
    });

    // Hourly activity
    const hourlyActivityData = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      hourLabel: `${hour}:00`,
      count: 0
    }));

    selectedPRsList.forEach(pr => {
      const hour = moment(pr.createdAt).hour();
      hourlyActivityData[hour].count++;
    });

    return {
      statusDistribution,
      codeVolume,
      codeQualityDistribution,
      teamMetrics,
      collaborationMatrix,
      reviewQualityData,
      contributorActivity,
      weeklyDistributionData,
      hourlyActivityData,
      insights: [
        {
          title: 'Most Active Day',
          value: weeklyDistributionData.reduce((max, day) => day.total > max.total ? day : max, weeklyDistributionData[0]).day,
          criteria: 'Day with highest PR creation count from selected PRs'
        },
        {
          title: 'Avg PR Size',
          value: `${teamMetrics.avgLinesPerPR} lines`,
          criteria: 'Average lines changed per selected PR'
        }
      ]
    };
  };

  useEffect(() => {
    if (repositoryId) {
      handleDateRangeUpdate(); // Auto-fetch all PRs in default date range
    }
  }, [repositoryId]); // eslint-disable-line react-hooks/exhaustive-deps



    const handleDateRangeUpdate = async () => {
      setLoading(true);
      setError(null);
    setAllPRs([]);
      
    console.log(`🔄 Auto-fetching ALL PRs in date range: ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}`);
    console.log('🚨🚨🚨 WATCH FOR REVIEW COUNT DEBUG INFO BELOW! 🚨🚨🚨');
      
    try {
      const token = localStorage.getItem('auth_token');
      let allPRsCollected = [];
      let hasMorePages = true;
      let afterCursor = null;
      let totalFetched = 0;
      
      // Track cumulative contributor stats
      const accumulatedContributors = new Map();
      
      // Keep fetching until we get all PRs in the date range
      while (hasMorePages) {
      const params = new URLSearchParams({
        startDate: startDate.format('YYYY-MM-DD'),
          endDate: endDate.format('YYYY-MM-DD'),
          maxPRs: '30'
        });
        
        // Add search term if provided
        if (searchTerm && searchTerm.trim()) {
          params.append('search', searchTerm.trim());
        }
        
        if (afterCursor) {
          params.append('after', afterCursor);
        }
        
        console.log(`🔄 Fetching batch (${totalFetched} PRs loaded so far)...`);
        console.log(`🔍 Search parameters:`, { searchTerm, startDate: startDate.format('YYYY-MM-DD'), endDate: endDate.format('YYYY-MM-DD') });
      
      const response = await fetch(`/api/repository-analytics-graphql/${repositoryId}/contributors?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch repository analytics');
      }
      
      const analyticsData = await response.json();
        const newPRs = analyticsData.pullRequests?.nodes || [];
        const batchContributors = analyticsData.contributors || [];
        
        // DEBUG REVIEW COUNTS FOR DATE RANGE FUNCTION TOO!
        if (newPRs.length > 0) {
          console.log(`🔍 ========================================`);
          console.log(`🔍 DATE RANGE: CHECKING ${newPRs.length} PRs FOR REVIEW COUNT ISSUES:`);
          console.log(`🚨 LOOK FOR LINES WITH "FORMAL REVIEWS COUNT" BELOW! 🚨`);
          console.log(`🔍 ========================================`);
          newPRs.forEach(pr => {
            const formalReviewCount = pr.reviews?.totalCount || 0;
            console.log(`🚨🚨🚨 PR #${pr.number} - FORMAL REVIEWS COUNT: ${formalReviewCount} 🚨🚨🚨`);
            
            if (formalReviewCount > 0) {
              console.log(`🔍 DETAILED REVIEW BREAKDOWN for PR #${pr.number}:`);
              console.log(`   Total reviews reported by API: ${formalReviewCount}`);
              
              if (pr.reviews?.nodes && pr.reviews.nodes.length > 0) {
                console.log(`   Found ${pr.reviews.nodes.length} review nodes in API response:`);
                pr.reviews.nodes.forEach((review, index) => {
                  console.log(`   Review ${index + 1}:`, {
                    id: review.id?.substring(0, 20) + '...',
                    state: review.state,
                    author: review.author?.login,
                    submittedAt: review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : 'No date',
                    hasBody: review.body ? review.body.length > 0 : false,
                    bodyPreview: review.body ? review.body.substring(0, 50) + '...' : 'No body'
                  });
                });
              } else {
                console.log(`   ⚠️ PROBLEM: API says ${formalReviewCount} reviews but nodes array is empty or missing!`);
              }
            }
          });
        }
        
        // Accumulate PRs
        allPRsCollected = [...allPRsCollected, ...newPRs];
        totalFetched += newPRs.length;
        
        // Update UI with current progress
        setAllPRs(allPRsCollected);
        
        // Auto-select all PRs for analytics
        const allIds = new Set(allPRsCollected.map(pr => pr.id));
        setSelectedPRs(allIds);
        
        // ACCUMULATE CONTRIBUTORS across batches
        console.log(`🔧 BEFORE accumulation - Current contributors: ${accumulatedContributors.size}`);
        
        batchContributors.forEach(batchContributor => {
          const login = batchContributor.contributor.username || batchContributor.contributor.id;
          
          console.log(`🔧 Processing contributor: ${login} with ${batchContributor.stats.pullRequests.opened} PRs`);
          
          if (!accumulatedContributors.has(login)) {
            // First time seeing this contributor - initialize with their data
            console.log(`🆕 NEW contributor: ${login}`);
            accumulatedContributors.set(login, {
              contributor: batchContributor.contributor,
              pullRequests: [], // Initialize empty PR array
              stats: {
                pullRequests: { opened: 0, merged: 0, mergeRate: 0 },
                linesOfCode: { added: 0, removed: 0 },
                reviews: { given: 0, received: 0 },
                commits: { total: 0 }
              }
            });
          } else {
            console.log(`♻️ EXISTING contributor: ${login} (current: ${accumulatedContributors.get(login).stats.pullRequests.opened} PRs)`);
          }
          
          // Get accumulated stats for this contributor
          const accumulated = accumulatedContributors.get(login);
          const batchStats = batchContributor.stats;
          const batchPRs = batchContributor.pullRequests || [];
          
          // Add this batch's PRs to the accumulated PRs array
          accumulated.pullRequests = [...accumulated.pullRequests, ...batchPRs];
          
          // Add this batch's stats to the accumulated totals
          accumulated.stats.pullRequests.opened += batchStats.pullRequests?.opened || 0;
          accumulated.stats.pullRequests.merged += batchStats.pullRequests?.merged || 0;
          accumulated.stats.linesOfCode.added += batchStats.linesOfCode?.added || 0;
          accumulated.stats.linesOfCode.removed += batchStats.linesOfCode?.removed || 0;
          accumulated.stats.reviews.given += batchStats.reviews?.given || 0;
          accumulated.stats.reviews.received += batchStats.reviews?.received || 0;
          accumulated.stats.commits.total += batchStats.commits?.total || 0;
          
          // Recalculate merge rate
          accumulated.stats.pullRequests.mergeRate = accumulated.stats.pullRequests.opened > 0 
            ? ((accumulated.stats.pullRequests.merged / accumulated.stats.pullRequests.opened) * 100).toFixed(1)
            : 0;
            
          console.log(`✅ Updated ${login}: ${accumulated.stats.pullRequests.opened} PRs total, ${accumulated.stats.pullRequests.merged} merged`);
        });
        
        console.log(`🔧 AFTER accumulation - Total contributors: ${accumulatedContributors.size}`);
        
        // Check if there are more pages
        hasMorePages = analyticsData.pullRequests?.pageInfo?.hasNextPage || false;
        afterCursor = analyticsData.pullRequests?.pageInfo?.endCursor || null;
        
        console.log(`✅ Batch loaded: ${newPRs.length} PRs. Total: ${totalFetched}. Has more: ${hasMorePages}`);
        
        // Store the final data structure on last iteration
        if (!hasMorePages) {
          // Convert accumulated contributors Map to array
          const finalContributors = Array.from(accumulatedContributors.values());
          
          // Update data with all collected PRs and accumulated contributors
          const finalData = { 
            ...analyticsData,
            contributors: finalContributors,
            pullRequests: {
              ...analyticsData.pullRequests,
              nodes: allPRsCollected
            }
          };
          setData(finalData);
          
          console.log(`🎯 Completed! Total PRs: ${totalFetched}, Total Contributors: ${finalContributors.length}`);
        }
      }
      
    } catch (err) {
      console.error('❌ Error auto-fetching date-filtered PRs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // PDF Export Function
  const exportToPDF = async () => {
    try {
      console.log('🔄 Starting comprehensive PDF export with selected PRs only...');
      
      // Get filtered data based on selected PRs
      const selectedPRsList = allPRs.filter(pr => selectedPRs.has(pr.id));
      const selectedContributors = (data?.contributors || []).filter(c => {
        const dynamicStats = getDynamicContributorStats(c);
        return dynamicStats.pullRequests.opened > 0; // Only contributors with selected PRs
      });
      
      console.log(`📊 PDF Export - Selected PRs: ${selectedPRsList.length}/${allPRs.length}`);
      console.log(`👥 PDF Export - Active Contributors: ${selectedContributors.length}`);
      
      // Create a new jsPDF instance in landscape for more space
      const pdf = new jsPDF('l', 'mm', 'a4'); // landscape
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 20;
      
      // Helper function to add text with automatic line wrapping
      const addText = (text, x, y, options = {}) => {
        const fontSize = options.fontSize || 10;
        const fontStyle = options.fontStyle || 'normal';
        const maxWidth = options.maxWidth || pageWidth - 40;
        
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', fontStyle);
        
        const lines = pdf.splitTextToSize(text, maxWidth);
        pdf.text(lines, x, y);
        return y + (lines.length * fontSize * 0.5);
      };
      
      // Helper function to check if we need a new page
      const checkNewPage = (requiredHeight) => {
        if (yPosition + requiredHeight > pageHeight - 15) {
          pdf.addPage();
          yPosition = 20;
        }
      };
      
      // Title
      yPosition = addText('Repository Analytics Report - Selected Data Export', 20, yPosition, { fontSize: 18, fontStyle: 'bold' });
      yPosition += 8;
      
      // Repository Info
      if (data?.repository) {
        yPosition = addText(`Repository: ${data.repository.name || repositoryId}`, 20, yPosition, { fontSize: 12, fontStyle: 'bold' });
        if (data.repository.description) {
          yPosition = addText(`Description: ${data.repository.description}`, 20, yPosition + 4, { fontSize: 9 });
        }
      }
      yPosition += 8;
      
      // Date Range & Data Source Info
      yPosition = addText(`Report Period: ${startDate.format('MMM DD, YYYY')} to ${endDate.format('MMM DD, YYYY')}`, 20, yPosition, { fontSize: 10 });
      yPosition = addText(`Data Source: ${selectedPRs.size} selected PRs out of ${allPRs.length} total PRs`, 20, yPosition + 4, { fontSize: 8, fontStyle: 'italic' });
      yPosition += 12;
      
      // Summary Statistics (horizontal layout) - BASED ON SELECTED PRs ONLY
      checkNewPage(30);
      yPosition = addText('Summary Statistics (Selected PRs Only)', 20, yPosition, { fontSize: 14, fontStyle: 'bold' });
      yPosition += 8;
      
      // Calculate real-time statistics from selected PRs
      const selectedStats = {
        totalPRs: selectedPRsList.length,
        mergedPRs: selectedPRsList.filter(pr => pr.mergedAt).length,
        openPRs: selectedPRsList.filter(pr => pr.state === 'OPEN').length,
        closedPRs: selectedPRsList.filter(pr => pr.state === 'CLOSED').length,
        totalCommits: selectedPRsList.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0),
        totalLinesAdded: selectedPRsList.reduce((sum, pr) => sum + (pr.additions || 0), 0),
        totalLinesRemoved: selectedPRsList.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
        totalReviews: selectedPRsList.reduce((sum, pr) => sum + (pr.reviews?.totalCount || 0), 0),
        activeContributors: new Set(selectedPRsList.map(pr => pr.author?.login).filter(Boolean)).size,
        avgDuration: getAveragePRDuration(selectedPRsList),
        avgMergedDuration: getAverageMergedPRDuration(selectedPRsList)
      };
      
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      const col1X = 20, col2X = 120, col3X = 220;
      
      pdf.text(`Total PRs: ${selectedStats.totalPRs}`, col1X, yPosition);
      pdf.text(`Merged: ${selectedStats.mergedPRs}`, col2X, yPosition);
      pdf.text(`Contributors: ${selectedStats.activeContributors}`, col3X, yPosition);
      yPosition += 6;
      
      pdf.text(`Lines Added: ${selectedStats.totalLinesAdded.toLocaleString()}`, col1X, yPosition);
      pdf.text(`Lines Removed: ${selectedStats.totalLinesRemoved.toLocaleString()}`, col2X, yPosition);
      pdf.text(`Total Reviews: ${selectedStats.totalReviews}`, col3X, yPosition);
      yPosition += 6;
      
      pdf.text(`Total Commits: ${selectedStats.totalCommits}`, col1X, yPosition);
      pdf.text(`Avg Duration: ${selectedStats.avgDuration}`, col2X, yPosition);
      pdf.text(`Avg Merged: ${selectedStats.avgMergedDuration}`, col3X, yPosition);
      yPosition += 12;
      
      // Contributors Data with SELECTED PRs ONLY
      checkNewPage(40);
      yPosition = addText('Contributors & Selected Pull Requests Data', 20, yPosition, { fontSize: 14, fontStyle: 'bold' });
      yPosition += 10;
      
      if (selectedContributors.length > 0) {
        selectedContributors.forEach((contributor, contributorIndex) => {
          // Start EVERY contributor on a new page (including the first one)
          pdf.addPage();
          yPosition = 20;
          
          // Get dynamic stats based on selected PRs
          const dynamicStats = getDynamicContributorStats(contributor);
          
          // Contributor Header
          const name = contributor.contributor?.username || contributor.contributor?.id || 'Unknown';
          const prsOpened = dynamicStats.pullRequests.opened;
          const prsMerged = dynamicStats.pullRequests.merged;
          const mergeRate = dynamicStats.pullRequests.mergeRate;
          const mergeRateExcludingClosed = dynamicStats.pullRequests.mergeRateExcludingClosed;
          const reviewsGiven = dynamicStats.reviews.given;
          const reviewsReceived = dynamicStats.reviews.received;
          const linesAdded = dynamicStats.linesOfCode.added;
          const linesRemoved = dynamicStats.linesOfCode.removed;
          const commits = dynamicStats.commits.total;
          const givenComments = dynamicStats.comments.total;
          
          // Contributor summary with better formatting
          pdf.setFontSize(14);
          pdf.setFont('helvetica', 'bold');
          yPosition = addText(`Contributor ${contributorIndex + 1}: ${name}`, 20, yPosition);
          yPosition += 6;
          
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          yPosition = addText(`PRs: ${prsOpened} opened, ${prsMerged} merged (${mergeRate}%${mergeRateExcludingClosed !== mergeRate ? `, ${mergeRateExcludingClosed}% merged-only` : ''}) | Reviews: ${reviewsGiven} given, ${reviewsReceived} received`, 25, yPosition);
          yPosition += 5;
          yPosition = addText(`Lines: +${linesAdded.toLocaleString()}/-${linesRemoved.toLocaleString()} | Comments: ${givenComments} given | Commits: ${commits} | Duration: ${getAveragePRDuration(selectedPRsList.filter(pr => pr.author?.login === name))}`, 25, yPosition);
          yPosition += 10;
          
          // PR Details Table for this contributor - ONLY SELECTED PRs
          const contributorSelectedPRs = selectedPRsList.filter(pr => pr.author?.login === name);
          
          if (contributorSelectedPRs.length > 0) {
            // PR Table Headers - compact spacing to fit page width
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            pdf.text('PR#', 25, yPosition);
            pdf.text('Title', 45, yPosition);
            pdf.text('Status', 85, yPosition);
            pdf.text('Lines', 115, yPosition);
            pdf.text('Rev', 135, yPosition);
            pdf.text('Disc', 150, yPosition);
            pdf.text('Comments', 170, yPosition);
            pdf.text('Commits', 195, yPosition);
            pdf.text('Duration', 215, yPosition);
            pdf.text('Created', 240, yPosition);
            pdf.text('Closed', 270, yPosition);
            yPosition += 8;
            
            // Draw line under headers - fits table width
            pdf.line(25, yPosition - 3, 285, yPosition - 3);
            yPosition += 3;
            
            // PR Details - ONLY SELECTED PRs
            contributorSelectedPRs.forEach((pr) => {
              checkNewPage(12);
              
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(6);
              
              // PR data
              const prNumber = pr.number || 'N/A';
              const title = (pr.title || 'No title').substring(0, 20) + (pr.title?.length > 20 ? '...' : '');
              const status = getPRStateText(pr.state).toUpperCase();
              const linesChange = `+${pr.additions || 0}/-${pr.deletions || 0}`;
              const reviews = pr.reviews?.totalCount || 0;
              const discussion = getTotalComments(pr);
              const givenComments = getCommentsGivenByContributor(name, [pr]);
              const commits = pr.commits?.totalCount || 0;
              const duration = getPRDuration(pr);
              const created = pr.createdAt ? moment(pr.createdAt).format('MM/DD HH:mm') : 'N/A';
              const closedMerged = pr.mergedAt ? moment(pr.mergedAt).format('MM/DD HH:mm') : 
                                 pr.closedAt ? moment(pr.closedAt).format('MM/DD HH:mm') : 'Open';
              
              // Get PR URL for clickable link with robust fallback
              let prUrl = pr.permalink || pr.url;
              if (!prUrl && data?.repository?.fullName) {
                // Use full name (owner/repo) for proper GitHub URL
                prUrl = `https://github.com/${data.repository.fullName}/pull/${prNumber}`;
              } else if (!prUrl && data?.repository?.name) {
                // Fallback to just repo name
                prUrl = `https://github.com/${data.repository.name}/pull/${prNumber}`;
              } else if (!prUrl) {
                // Last resort fallback
                prUrl = `https://github.com/pull/${prNumber}`;
              }
              
              // Basic text elements with compact positioning
              pdf.text(prNumber.toString(), 25, yPosition);
              pdf.text(title, 45, yPosition);
              
              // Status with color
              if (status === 'MERGED') {
                pdf.setTextColor(0, 128, 0); // Green
              } else if (status === 'OPEN') {
                pdf.setTextColor(0, 100, 200); // Blue
              } else if (status === 'CLOSED') {
                pdf.setTextColor(200, 0, 0); // Red
              } else {
                pdf.setTextColor(128, 128, 128); // Gray
              }
              pdf.text(status, 85, yPosition);
              pdf.setTextColor(0, 0, 0); // Reset to black
              
              pdf.text(linesChange, 115, yPosition);
              pdf.text(reviews.toString(), 135, yPosition);
              pdf.text(discussion.toString(), 150, yPosition);
              pdf.text(givenComments.toString(), 170, yPosition);
              pdf.text(commits.toString(), 195, yPosition);
              pdf.text(duration, 215, yPosition);
              pdf.text(created, 240, yPosition);
              pdf.text(closedMerged, 270, yPosition);
              
              yPosition += 6;
            });
            
            // Add summary for this contributor
            checkNewPage(20);
            yPosition += 5;
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'italic');
            yPosition = addText(`Summary for ${name}: ${contributorSelectedPRs.length} selected PRs, ${contributorSelectedPRs.filter(pr => pr.mergedAt).length} merged, ${contributorSelectedPRs.filter(pr => pr.state === 'OPEN').length} open`, 25, yPosition);
            
          } else {
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'italic');
            yPosition = addText('No selected pull requests for this contributor.', 25, yPosition);
          }
        });
      } else {
        // No contributors with selected PRs
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'italic');
        yPosition = addText('No contributors found with selected pull requests.', 25, yPosition);
        yPosition += 10;
        yPosition = addText(`Total PRs loaded: ${allPRs.length}, Selected: ${selectedPRs.size}`, 25, yPosition, { fontSize: 10 });
      }
      
      // Footer on each page
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'italic');
        const footerText = `Generated By Osama Tbaileh / Back-End Progress Manager | Page ${i} of ${totalPages}`;
        pdf.text(footerText, 20, pageHeight - 8);
      }
      
      // Save the PDF
      const fileName = `selected-analytics-${data?.repository?.name || 'report'}-${selectedPRs.size}PRs-${moment().format('YYYY-MM-DD')}.pdf`;
      pdf.save(fileName);
      
      console.log(`✅ Complete PDF export completed successfully with ${totalPages} pages`);
      
    } catch (error) {
      console.error('❌ Error exporting comprehensive PDF:', error);
      setError('Failed to export PDF. Please try again.');
    }
  };

  const handleFetchAllPRs = async () => {
    setLoading(true);
    setError(null);
    setAllPRs([]);
    console.log('🔄 Fetching ALL PRs for repository (30 at a time)...');
    console.log('🚨🚨🚨 WATCH FOR REVIEW COUNT DEBUG INFO BELOW! 🚨🚨🚨');
    
    try {
      const token = localStorage.getItem('auth_token');
      let allPRsCollected = [];
      let currentCursor = null;
      let hasMore = true;
      let batchCount = 1;
      let totalFetched = 0;
      let accumulatedContributors = new Map(); // Track cumulative contributor stats
      
      while (hasMore) {
        let retryCount = 0;
        let batchSuccess = false;
        
        while (!batchSuccess && retryCount < 3) {
          try {
            console.log(`📥 Fetching batch ${batchCount} (30 PRs)${retryCount > 0 ? ` - Retry ${retryCount}` : ''}...`);
            
            const params = new URLSearchParams({
              fetchAll: 'true',
              maxPRs: '30'
            });
            
            // Add cursor for pagination
            if (currentCursor) {
              params.append('after', currentCursor);
            }
            
            // Add timeout and abort controller
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(`/api/repository-analytics-graphql/${repositoryId}/contributors?${params}`, {
              headers: { 'Authorization': `Bearer ${token}` },
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
              throw new Error(errorData.error || `Request failed with status ${response.status}`);
            }
            
            const analyticsData = await response.json();
            const newPRs = analyticsData.pullRequests?.nodes || [];
            const batchContributors = analyticsData.contributors || [];
            
            // Debug: Check PR count data structure (first batch only)
            if (batchCount === 1) {
              console.log(`🔍 DEBUG Repository data:`, {
                repository: analyticsData.repository,
                repoFullName: analyticsData.repository?.fullName
              });
              

              
              console.log(`🔍 ========================================`);
              console.log(`🔍 CHECKING ALL ${newPRs.length} PRs FOR REVIEW COUNT ISSUES:`);
              console.log(`🚨 LOOK FOR LINES WITH "FORMAL REVIEWS COUNT" BELOW! 🚨`);
              console.log(`🔍 ========================================`);
              newPRs.forEach(pr => {
                const prComments = pr.comments?.totalCount || 0;                           // General PR comments
                const reviewBodyComments = pr.reviews?.nodes?.reduce((sum, review) =>     // Comments within review bodies
                  sum + (review.comments?.totalCount || 0), 0) || 0;
                const totalComments = prComments + reviewBodyComments;
                
                // Show review count prominently - THIS SHOULD BE VISIBLE!
                const formalReviewCount = pr.reviews?.totalCount || 0;
                console.log(`🚨🚨🚨 PR #${pr.number} - FORMAL REVIEWS COUNT: ${formalReviewCount} 🚨🚨🚨`);
                
                console.log(`PR #${pr.number} BREAKDOWN:`, {
                  '📋_FORMAL_REVIEWS': formalReviewCount,
                  '💬_PR_COMMENTS': prComments,                      // General discussion comments
                  '🔍_REVIEW_LINE_COMMENTS': reviewBodyComments,      // Code-specific comments within reviews
                  '🎯_TOTAL_DISCUSSION': totalComments,              // Our comprehensive discussion metric
                  '⚙️_COMMITS': pr.commits?.totalCount || 0,
                  '📝_NOTE': 'Reviews = formal submissions, Discussion = all conversation activity'
                });
                
                // DETAILED REVIEW ANALYSIS - Show each individual review for any PR with reviews
                if (formalReviewCount > 0) {
                  console.log(`🔍 DETAILED REVIEW BREAKDOWN for PR #${pr.number}:`);
                  console.log(`   Total reviews reported by API: ${formalReviewCount}`);
                  
                  if (pr.reviews?.nodes && pr.reviews.nodes.length > 0) {
                    console.log(`   Found ${pr.reviews.nodes.length} review nodes in API response:`);
                    pr.reviews.nodes.forEach((review, index) => {
                      console.log(`   Review ${index + 1}:`, {
                        id: review.id?.substring(0, 20) + '...',
                        state: review.state,
                        author: review.author?.login,
                        submittedAt: review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : 'No date',
                        hasBody: review.body ? review.body.length > 0 : false,
                        bodyPreview: review.body ? review.body.substring(0, 50) + '...' : 'No body'
                      });
                    });
                  } else {
                    console.log(`   ⚠️ PROBLEM: API says ${formalReviewCount} reviews but nodes array is empty or missing!`);
                    console.log(`   This could indicate a GraphQL query issue or API inconsistency`);
                  }
                  
                  if (formalReviewCount !== (pr.reviews?.nodes?.length || 0)) {
                    console.log(`   🚨 MISMATCH: totalCount=${formalReviewCount} but nodes.length=${pr.reviews?.nodes?.length || 0}`);
                  }
                }
                
                // Show our discussion activity metric (no longer trying to match GitHub exactly)
                const discussionCount = getTotalComments(pr);
                console.log(`💬 PR #${pr.number}: ${discussionCount} discussion activities (comprehensive metric)`);
              });
            }
            
            // Collect PRs
            allPRsCollected = [...allPRsCollected, ...newPRs];
            totalFetched += newPRs.length;
            
            // Accumulate contributor statistics from this batch
            console.log(`🔧 BEFORE accumulation - Current contributors: ${accumulatedContributors.size}`);
            
            batchContributors.forEach(batchContributor => {
              const login = batchContributor.contributor.username || batchContributor.contributor.id;
              
              console.log(`🔧 Processing contributor: ${login} with ${batchContributor.stats.pullRequests.opened} PRs`);
              
              if (!accumulatedContributors.has(login)) {
                // First time seeing this contributor - initialize with their data
                console.log(`🆕 NEW contributor: ${login}`);
                accumulatedContributors.set(login, {
                  contributor: batchContributor.contributor,
                  pullRequests: [], // Initialize empty PR array
                  stats: {
                    pullRequests: { opened: 0, merged: 0, mergeRate: 0 },
                    linesOfCode: { added: 0, removed: 0 },
                    reviews: { given: 0, received: 0 },
                    commits: { total: 0 }
                  }
                });
              } else {
                console.log(`♻️ EXISTING contributor: ${login} (current: ${accumulatedContributors.get(login).stats.pullRequests.opened} PRs)`);
              }
              
              // Get accumulated stats for this contributor
              const accumulated = accumulatedContributors.get(login);
              const batchStats = batchContributor.stats;
              const batchPRs = batchContributor.pullRequests || [];
              
              // Add this batch's PRs to the accumulated PRs array
              accumulated.pullRequests = [...accumulated.pullRequests, ...batchPRs];
              
              // Add this batch's stats to the accumulated totals
              accumulated.stats.pullRequests.opened += batchStats.pullRequests?.opened || 0;
              accumulated.stats.pullRequests.merged += batchStats.pullRequests?.merged || 0;
              accumulated.stats.linesOfCode.added += batchStats.linesOfCode?.added || 0;
              accumulated.stats.linesOfCode.removed += batchStats.linesOfCode?.removed || 0;
              accumulated.stats.reviews.given += batchStats.reviews?.given || 0;
              accumulated.stats.reviews.received += batchStats.reviews?.received || 0;
              accumulated.stats.commits.total += batchStats.commits?.total || 0;
              
              // Recalculate merge rate
              if (accumulated.stats.pullRequests.opened > 0) {
                accumulated.stats.pullRequests.mergeRate = Math.round(
                  (accumulated.stats.pullRequests.merged / accumulated.stats.pullRequests.opened) * 100
                );
              }
              
              console.log(`✅ Updated ${login}: opened=${accumulated.stats.pullRequests.opened}, merged=${accumulated.stats.pullRequests.merged}, commits=${accumulated.stats.commits.total}`);
            });
            
            console.log(`🔧 AFTER accumulation - All contributors:`, Array.from(accumulatedContributors.keys()));
            
            // Update pagination info
            hasMore = analyticsData.pagination?.hasNextPage || false;
            currentCursor = analyticsData.pagination?.endCursor;
            
            // Update UI with current progress
            setAllPRs([...allPRsCollected]);
            
            // Auto-select all PRs for analytics
            const allIds = new Set(allPRsCollected.map(pr => pr.id));
            setSelectedPRs(allIds);
            
            // Create updated data with accumulated contributor stats
            const contributorsArray = Array.from(accumulatedContributors.values());
            console.log(`🎯 Final contributors array for setData():`, contributorsArray.map(c => ({
              username: c.contributor.username || c.contributor.id,
              opened: c.stats.pullRequests.opened,
              merged: c.stats.pullRequests.merged,
              commits: c.stats.commits.total
            })));
            
            const updatedData = {
              ...analyticsData,
              contributors: contributorsArray,
              summary: {
                ...analyticsData.summary,
                totalPRs: totalFetched,
                totalMerged: allPRsCollected.filter(pr => pr.mergedAt).length,
                totalCommits: allPRsCollected.reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0),
                totalLinesAdded: allPRsCollected.reduce((sum, pr) => sum + (pr.additions || 0), 0),
                totalLinesRemoved: allPRsCollected.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
                totalReviews: allPRsCollected.reduce((sum, pr) => sum + (pr.reviews?.totalCount || 0), 0)
              }
            };
            
            // Update main data with accumulated analytics
            setData(updatedData);
            
            console.log(`✅ Batch ${batchCount} complete: ${newPRs.length} PRs (Total: ${totalFetched})`);
            
            // Show discussion activity summary for this batch
            console.log(`💬 Batch ${batchCount} - Discussion Activity Summary:`);
            const highActivityPRs = newPRs.filter(pr => getTotalComments(pr) > 10);
            const avgDiscussion = newPRs.length > 0 ? 
              (newPRs.reduce((sum, pr) => sum + getTotalComments(pr), 0) / newPRs.length).toFixed(1) : 0;
            
            console.log(`  📈 Average discussion per PR: ${avgDiscussion}`);
            console.log(`  🔥 High activity PRs (>10 comments): ${highActivityPRs.length}`);
            if (highActivityPRs.length > 0) {
              console.log(`  🗣️ Most discussed: PR #${highActivityPRs.reduce((top, pr) => 
                getTotalComments(pr) > getTotalComments(top) ? pr : top
              ).number} (${getTotalComments(highActivityPRs.reduce((top, pr) => 
                getTotalComments(pr) > getTotalComments(top) ? pr : top
              ))} comments)`);
            }
            
            console.log(`📊 Batch ${batchCount} contributors received:`, batchContributors.map(c => ({
              username: c.contributor.username || c.contributor.id,
              opened: c.stats.pullRequests.opened,
              merged: c.stats.pullRequests.merged,
              prsCount: (c.pullRequests || []).length
            })));
            console.log(`📊 Accumulated contributors: ${accumulatedContributors.size} total contributors`);
            batchSuccess = true;
            
          } catch (error) {
            retryCount++;
            const isAborted = error.name === 'AbortError' || error.message.includes('aborted');
            const isTimeout = error.message.includes('timeout') || isAborted;
            
            console.warn(`⚠️ Batch ${batchCount} failed (attempt ${retryCount}/3): ${error.message}`);
            
            if (retryCount >= 3) {
              console.error(`❌ Failed to fetch batch ${batchCount} after 3 attempts. Stopping pagination.`);
              hasMore = false; // Stop the pagination loop
              break;
            }
            
            // Wait longer before retry, especially for timeouts
            const retryDelay = isTimeout ? 2000 + (retryCount * 1000) : 1000;
            console.log(`🔄 Retrying in ${retryDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
        
        if (batchSuccess) {
          batchCount++;
          
          // Small delay to be nice to GitHub API
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      console.log(`🎉 ALL PRs fetched successfully! Total: ${totalFetched} PRs`);
                  console.log(`📈 Final accumulated contributor stats:`, Array.from(accumulatedContributors.values()).map(c => ({
        username: c.contributor.username || c.contributor.id,
        opened: c.stats.pullRequests.opened,
        merged: c.stats.pullRequests.merged,
        commits: c.stats.commits.total,
        linesAdded: c.stats.linesOfCode.added,
        prsCount: (c.pullRequests || []).length
      })));
      
    } catch (err) {
      console.error('❌ Error fetching all PRs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleContributorToggle = (contributorId) => {
    setExpandedContributors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contributorId)) {
        newSet.delete(contributorId);
      } else {
        newSet.add(contributorId);
      }
      return newSet;
    });
  };

  const formatDateTime = (dateString) => {
    return moment(dateString).format('MMM DD, YYYY HH:mm');
  };

  const getPRStateColor = (state, merged) => {
    if (merged || state === 'MERGED') return 'success';     // Green for merged
    if (state === 'OPEN' || state === 'open') return 'primary';     // Blue for open  
    if (state === 'CLOSED' || state === 'closed') return 'error';   // Red for closed
    if (state === 'DRAFT' || state === 'draft') return 'warning';   // Orange for draft
    return 'default';  // Gray for unknown
  };

  const getPRStateText = (state, merged) => {
    if (merged || state === 'MERGED') return 'MERGED';
    if (state === 'OPEN' || state === 'open') return 'OPEN';
    if (state === 'CLOSED' || state === 'closed') return 'CLOSED';  
    if (state === 'DRAFT' || state === 'draft') return 'DRAFT';
    return (state || 'UNKNOWN').toUpperCase();
  };

  // Calculate total discussion activity (comprehensive comment count)
  const getTotalComments = (pr) => {
    const prComments = pr.comments?.totalCount || 0;                           // General PR comments
    const reviewLineComments = pr.reviews?.nodes?.reduce((sum, review) =>     // Line comments within reviews
      sum + (review.comments?.totalCount || 0), 0) || 0;
    const reviewBodies = pr.reviews?.nodes?.filter(review => 
      review.body && review.body.trim().length > 0).length || 0;              // Review summaries with content
    
    // Provide a comprehensive discussion metric (includes all human communication)
    const totalDiscussion = prComments + reviewLineComments + reviewBodies;
    
    // Optional: Clean logging without spam (only for specific PRs if needed)
    if (pr.number === 318 || pr.number === 316) { // Example: only log specific PRs for testing
      console.log(`💬 PR #${pr.number} Discussion Breakdown:`, {
        prComments,
        reviewLineComments, 
        reviewBodies,
        totalDiscussion,
        note: 'Our consistent discussion activity metric (may differ from GitHub conversation count due to system events)'
      });
    }
    
    return totalDiscussion;
  };

  // Calculate comments GIVEN BY a specific contributor across all PRs
  const getCommentsGivenByContributor = (contributorUsername, allSelectedPRs) => {
    let totalCommentsGiven = 0;
    
    allSelectedPRs.forEach(pr => {
      // Count general PR comments made by this contributor
      if (pr.comments?.nodes) {
        const contributorComments = pr.comments.nodes.filter(comment => 
          comment.author?.login === contributorUsername
        ).length;
        totalCommentsGiven += contributorComments;
      }
      
      // Count reviews and review comments made by this contributor
      if (pr.reviews?.nodes) {
        pr.reviews.nodes.forEach(review => {
          if (review.author?.login === contributorUsername) {
            // Count review body as 1 comment if it has content
            if (review.body && review.body.trim().length > 0) {
              totalCommentsGiven += 1;
            }
            
            // Count inline review comments made by this contributor
            if (review.comments?.nodes) {
              const reviewComments = review.comments.nodes.filter(comment => 
                comment.author?.login === contributorUsername
              ).length;
              totalCommentsGiven += reviewComments;
            } else if (review.comments?.totalCount && review.author?.login === contributorUsername) {
              // If we don't have detailed comment nodes, use totalCount for reviews by this contributor
              totalCommentsGiven += review.comments.totalCount;
            }
          }
        });
      }
    });
    
    return totalCommentsGiven;
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
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/repositories')}
          sx={{ mb: 2 }}
        >
          Back to Repositories
        </Button>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data || !data.repository) {
    return (
      <Box sx={{ p: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/repositories')}
          sx={{ mb: 2 }}
        >
          Back to Repositories
        </Button>
        <Alert severity="info">No data available</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, width: '100%' }}>
          {/* Header */}
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
            <Box>
              <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate('/repositories')}
                sx={{ mb: 2 }}
              >
                Back to Repositories
              </Button>
              <Typography variant="h4" component="h1">
                {data.repository.name}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                {data.repository.fullName}
              </Typography>
              {data.repository.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {data.repository.description}
                </Typography>
              )}
            </Box>
            {data.repository.language && (
              <Chip 
                label={data.repository.language} 
                color="primary" 
                variant="outlined"
              />
            )}
          </Box>

          {/* Date Range Selector */}
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Date Range & Search Filters
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <TextField
                  label="Start Date"
                  type="date"
                  value={startDate.format('YYYY-MM-DD')}
                  onChange={(e) => setStartDate(moment(e.target.value))}
                  variant="outlined"
                  size="small"
                  InputLabelProps={{
                    shrink: true,
                  }}
                />
                <TextField
                  label="End Date"
                  type="date"
                  value={endDate.format('YYYY-MM-DD')}
                  onChange={(e) => setEndDate(moment(e.target.value))}
                  variant="outlined"
                  size="small"
                  InputLabelProps={{
                    shrink: true,
                  }}
                />
                <TextField
                  label="Search PR Titles"
                  placeholder="e.g., barka, feat, fix..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  variant="outlined"
                  size="small"
                  sx={{ minWidth: 200 }}
                  InputLabelProps={{
                    shrink: true,
                  }}
                  InputProps={{
                    endAdornment: searchTerm && (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setSearchTerm('')}
                          size="small"
                          title="Clear search"
                        >
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleDateRangeUpdate}
                  disabled={loading}
                >
                  {loading ? `Fetching ALL PRs... (${allPRs.length} loaded)` : 'Update (Fetch All in Range)'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleFetchAllPRs}
                  disabled={loading}
                  color="secondary"
                >
                  {loading ? `Fetching PRs... (${allPRs.length} loaded)` : 'Fetch ALL PRs (Auto-Paginate)'}
                </Button>
                {data && !loading && (
                  <Button
                    variant="outlined"
                    onClick={exportToPDF}
                    startIcon={<PdfIcon />}
                    color="success"
                    disabled={!data?.contributors?.length || selectedPRs.size === 0}
                  >
                    Export Selected PRs PDF ({selectedPRs.size})
                  </Button>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                📅 Showing data from {startDate.format('MMM DD, YYYY')} to {endDate.format('MMM DD, YYYY')}
                {searchTerm && (
                  <>
                    <br />
                    🔍 Filtering by: "{searchTerm}"
                  </>
                )}
                {allPRs.length > 0 && (
                  <>
                    <br />
                    📊 {loading ? `Fetching PRs... ${allPRs.length} loaded so far` : `Loaded ${allPRs.length} PRs${searchTerm ? ' matching filters' : ' (all PRs in range loaded)'}`}
                  </>
                )}
              </Typography>
              {data?.optimizationNote && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {data.optimizationNote}
                </Typography>
              )}
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={2}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <PullRequestIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6">PRs</Typography>
                  </Box>
                  <Typography variant="h4">{allPRs.filter(pr => selectedPRs.has(pr.id)).length}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {allPRs.filter(pr => selectedPRs.has(pr.id) && pr.mergedAt).length} merged
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={2}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <CommitIcon color="warning" sx={{ mr: 1 }} />
                    <Typography variant="h6">Commits</Typography>
                  </Box>
                  <Typography variant="h4">{allPRs.filter(pr => selectedPRs.has(pr.id)).reduce((sum, pr) => sum + (pr.commits?.totalCount || 0), 0)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={2}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <AddIcon color="success" sx={{ mr: 1 }} />
                    <Typography variant="h6">Lines+</Typography>
                  </Box>
                  <Typography variant="h4">{allPRs.filter(pr => selectedPRs.has(pr.id)).reduce((sum, pr) => sum + (pr.additions || 0), 0).toLocaleString()}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={2}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <RemoveIcon color="error" sx={{ mr: 1 }} />
                    <Typography variant="h6">Lines-</Typography>
                  </Box>
                  <Typography variant="h4">{allPRs.filter(pr => selectedPRs.has(pr.id)).reduce((sum, pr) => sum + (pr.deletions || 0), 0).toLocaleString()}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={2}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <ReviewIcon color="info" sx={{ mr: 1 }} />
                    <Tooltip 
                      title="Formal review submissions (APPROVED, CHANGES_REQUESTED, or COMMENTED)"
                      arrow
                    >
                      <Typography variant="h6" sx={{ cursor: 'help', borderBottom: '1px dotted' }}>
                        Formal Reviews
                      </Typography>
                    </Tooltip>
                  </Box>
                  <Typography variant="h4">{allPRs.filter(pr => selectedPRs.has(pr.id)).reduce((sum, pr) => sum + (pr.reviews?.totalCount || 0), 0)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={2}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={1}>
                    <CodeIcon color="secondary" sx={{ mr: 1 }} />
                    <Typography variant="h6">Contributors</Typography>
                  </Box>
                  <Typography variant="h4">{new Set(allPRs.filter(pr => selectedPRs.has(pr.id)).map(pr => pr.author?.login).filter(Boolean)).size}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Insights & Analytics Section */}
          {allPRs.length > 0 && (
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                  <Box display="flex" alignItems="center">
                    <AnalyticsIcon color="primary" sx={{ mr: 1 }} />
                    <Typography variant="h6">
                      Insights & Analytics
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    onClick={() => setShowInsights(!showInsights)}
                    startIcon={showInsights ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    size="small"
                  >
                    {showInsights ? 'Hide' : 'Show'} Analytics
                  </Button>
                </Box>

                <Collapse in={showInsights}>
                  {(() => {
                    const analytics = calculateInsights();
                    if (!analytics) return null;

                    const statusChartData = Object.entries(analytics.statusDistribution).map(([status, count]) => ({
                      name: status,
                      value: count,
                      fill: status === 'MERGED' ? '#48bb78' : 
                            status === 'OPEN' ? '#667eea' : 
                            status === 'CLOSED' ? '#e53e3e' : 
                            status === 'DRAFT' ? '#ed8936' : '#a0aec0'
                    }));

                    const codeVolumeData = [
                      { name: 'Lines Added', value: analytics.codeVolume.additions, fill: '#48bb78' },
                      { name: 'Lines Removed', value: analytics.codeVolume.deletions, fill: '#e53e3e' }
                    ];

                    return (
                      <Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                          📊 Analytics based on {allPRs.filter(pr => selectedPRs.has(pr.id)).length} selected PRs
                        </Typography>
                        
                        {/* Simple Charts Grid */}
                        <Grid container spacing={3}>
                          {/* PR Status Distribution */}
                          <Grid item xs={12} md={6}>
                            <Paper elevation={1} sx={{ p: 2, height: 400 }}>
                              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                                <AssessmentIcon sx={{ mr: 1 }} />
                                PR Status Distribution
                              </Typography>
                              <ResponsiveContainer width="100%" height={320}>
                                <PieChart>
                                  <Pie
                                    data={statusChartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                    outerRadius={80}
                                    dataKey="value"
                                  >
                                    {statusChartData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                  </Pie>
                                  <RechartsTooltip />
                                </PieChart>
                              </ResponsiveContainer>
                            </Paper>
                          </Grid>

                          {/* Code Volume */}
                          <Grid item xs={12} md={6}>
                            <Paper elevation={1} sx={{ p: 2, height: 400 }}>
                              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                                <CodeIcon sx={{ mr: 1 }} />
                                Code Volume Analysis
                              </Typography>
                              <ResponsiveContainer width="100%" height={320}>
                                <BarChart data={codeVolumeData}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <RechartsTooltip />
                                  <Bar dataKey="value" fill="#8884d8" />
                                </BarChart>
                              </ResponsiveContainer>
                            </Paper>
                          </Grid>
                        </Grid>
                      </Box>
                    );
                  })()}
                </Collapse>
              </CardContent>
            </Card>
          )}

          {/* Contributors Table */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Individual Contributor Statistics
              </Typography>
              
              {/* Filter PRs for Statistics */}
              {allPRs.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" gutterBottom>
                      Filter PRs for Statistics
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button 
                        size="small" 
                        startIcon={<SelectAllIcon />} 
                        onClick={selectAllPRs}
                        disabled={selectedPRs.size === allPRs.length}
                      >
                        Select All
                      </Button>
                      <Button 
                        size="small" 
                        startIcon={<DeselectAllIcon />} 
                        onClick={deselectAllPRs}
                        disabled={selectedPRs.size === 0}
                      >
                        Deselect All
                      </Button>
                      <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center', ml: 2 }}>
                        {selectedPRs.size} of {allPRs.length} selected
                      </Typography>
                    </Box>
                  </Box>
                  
                  {/* Filtered Statistics Summary */}
                  {selectedPRs.size > 0 && (
                    <Card sx={{ mb: 2, bgcolor: 'background.default' }}>
                      <CardContent>
                        <Typography variant="subtitle1" gutterBottom>
                          📊 Filtered Statistics Summary ({selectedPRs.size} selected PRs)
                        </Typography>
                        <Grid container spacing={3}>
                          <Grid item xs={6} md={3}>
                            <Paper sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="body2" color="text.secondary">Avg Duration</Typography>
                              <Typography variant="h6" color="primary">
                                {getAveragePRDuration(allPRs.filter(pr => selectedPRs.has(pr.id)))}
                              </Typography>
                              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                {getAverageMergedPRDuration(allPRs.filter(pr => selectedPRs.has(pr.id)))} (merged only)
                              </Typography>
                            </Paper>
                          </Grid>
                          <Grid item xs={6} md={3}>
                            <Paper sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="body2" color="text.secondary">Merge Rate</Typography>
                              <Typography variant="h6" color="success.main">
                                {allPRs.filter(pr => selectedPRs.has(pr.id)).length > 0 
                                  ? Math.round((allPRs.filter(pr => selectedPRs.has(pr.id) && pr.mergedAt).length / allPRs.filter(pr => selectedPRs.has(pr.id)).length) * 100) 
                                  : 0}%
                              </Typography>
                            </Paper>
                          </Grid>
                          <Grid item xs={6} md={3}>
                            <Paper sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="body2" color="text.secondary">Avg Reviews</Typography>
                              <Typography variant="h6" color="info.main">
                                {allPRs.filter(pr => selectedPRs.has(pr.id)).length > 0 
                                  ? (allPRs.filter(pr => selectedPRs.has(pr.id)).reduce((sum, pr) => sum + (pr.reviews?.totalCount || 0), 0) / allPRs.filter(pr => selectedPRs.has(pr.id)).length).toFixed(1)
                                  : '0.0'}
                              </Typography>
                            </Paper>
                          </Grid>
                          <Grid item xs={6} md={3}>
                            <Paper sx={{ p: 1, textAlign: 'center' }}>
                              <Typography variant="body2" color="text.secondary">Contributors</Typography>
                              <Typography variant="h6" color="secondary.main">
                                {new Set(allPRs.filter(pr => selectedPRs.has(pr.id)).map(pr => pr.author?.login).filter(Boolean)).size}
                              </Typography>
                            </Paper>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  )}
                </Box>
              )}

              {/* Contributors Table */}
              {data?.contributors && data.contributors.length > 0 && (
                <TableContainer component={Paper} sx={{ mt: 2 }}>
                  <Table sx={{ tableLayout: 'fixed' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: '180px' }}>Contributor</TableCell>
                        <TableCell align="center" sx={{ width: '90px' }}>PRs Opened</TableCell>
                        <TableCell align="center" sx={{ width: '90px' }}>PRs Merged</TableCell>
                        <TableCell align="center" sx={{ width: '90px' }}>Merge Rate</TableCell>
                        <TableCell align="center" sx={{ width: '90px' }}>Lines Added</TableCell>
                        <TableCell align="center" sx={{ width: '90px' }}>Lines Removed</TableCell>
                        <TableCell align="center" sx={{ width: '90px' }}>Reviews Given</TableCell>
                        <TableCell align="center" sx={{ width: '90px' }}>Reviews Received</TableCell>
                        <TableCell align="center" sx={{ width: '90px' }}>
                          <Tooltip title="Total comments made by this contributor across ALL PRs in the selected period (not just their own PRs)">
                            <Typography variant="body2" sx={{ cursor: 'help' }}>
                              Total Given Comments
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center" sx={{ width: '70px' }}>Commits</TableCell>
                        <TableCell align="center" sx={{ width: '70px' }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.contributors.map((contributorData, index) => {
                        const dynamicStats = getDynamicContributorStats(contributorData);
                        return (
                          <React.Fragment key={`${contributorData.contributor.username}-${index}`}>
                            <TableRow sx={{ backgroundColor: index % 2 === 0 ? 'background.default' : 'background.paper' }}>
                              <TableCell sx={{ width: '180px' }}>
                                <Box display="flex" alignItems="center">
                                  {contributorData.contributor.avatarUrl && (
                                    <Avatar 
                                      src={contributorData.contributor.avatarUrl} 
                                      sx={{ width: 32, height: 32, mr: 2 }} 
                                    />
                                  )}
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography 
                                      variant="subtitle2" 
                                      fontWeight="bold"
                                      sx={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {contributorData.contributor.name || contributorData.contributor.username}
                                    </Typography>
                                    <Typography 
                                      variant="body2" 
                                      color="text.secondary"
                                      sx={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      @{contributorData.contributor.username}
                                    </Typography>
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell align="center" sx={{ width: '90px' }}>{dynamicStats.pullRequests.opened}</TableCell>
                              <TableCell align="center" sx={{ width: '90px' }}>{dynamicStats.pullRequests.merged}</TableCell>
                              <TableCell align="center" sx={{ width: '90px' }}>
                                <Typography variant="body2" fontWeight="medium">
                                  {dynamicStats.pullRequests.mergeRate}%
                                </Typography>
                                {dynamicStats.pullRequests.mergeRateExcludingClosed !== dynamicStats.pullRequests.mergeRate && (
                                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                    {dynamicStats.pullRequests.mergeRateExcludingClosed}% (merged only)
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell align="center" sx={{ width: '90px' }}>
                                <Typography color="success.main">
                                  +{dynamicStats.linesOfCode.added.toLocaleString()}
                                </Typography>
                              </TableCell>
                              <TableCell align="center" sx={{ width: '90px' }}>
                                <Typography color="error.main">
                                  -{dynamicStats.linesOfCode.removed.toLocaleString()}
                                </Typography>
                              </TableCell>
                              <TableCell align="center" sx={{ width: '90px' }}>{dynamicStats.reviews.given}</TableCell>
                              <TableCell align="center" sx={{ width: '90px' }}>{dynamicStats.reviews.received}</TableCell>
                              <TableCell align="center" sx={{ width: '90px' }}>
                                <Typography variant="body2" color="primary.main">
                                  {dynamicStats.comments.total.toLocaleString()}
                                </Typography>
                              </TableCell>
                              <TableCell align="center" sx={{ width: '70px' }}>{dynamicStats.commits.total}</TableCell>
                              <TableCell align="center" sx={{ width: '70px' }}>
                                <IconButton
                                  size="small"
                                  onClick={() => handleContributorToggle(contributorData.contributor.username)}
                                  aria-label={expandedContributors.has(contributorData.contributor.username) ? "Hide PRs" : "Show PRs"}
                                >
                                  {expandedContributors.has(contributorData.contributor.username) ? 
                                    <ExpandLessIcon /> : <ExpandMoreIcon />}
                                </IconButton>
                              </TableCell>
                            </TableRow>
                            
                            {/* Expanded PR Details for each contributor */}
                            {expandedContributors.has(contributorData.contributor.username) && (
                              <TableRow>
                                <TableCell colSpan={11}>
                                  <Collapse in={expandedContributors.has(contributorData.contributor.username)} timeout="auto" unmountOnExit>
                                    <Box sx={{ margin: 1 }}>
                                      <Typography variant="h6" gutterBottom component="div">
                                        Pull Requests by {contributorData.contributor.name || contributorData.contributor.username}
                                      </Typography>
                                      <Table size="small" aria-label="pr-details" sx={{ tableLayout: 'fixed' }}>
                                        <TableHead>
                                          <TableRow>
                                            <TableCell padding="checkbox" sx={{ width: '50px' }}>
                                              <Checkbox
                                                indeterminate={
                                                  (contributorData.pullRequests || []).some(pr => selectedPRs.has(pr.id)) &&
                                                  !(contributorData.pullRequests || []).every(pr => selectedPRs.has(pr.id))
                                                }
                                                checked={
                                                  (contributorData.pullRequests || []).length > 0 &&
                                                  (contributorData.pullRequests || []).every(pr => selectedPRs.has(pr.id))
                                                }
                                                onChange={(event) => {
                                                  const contributorPRIds = (contributorData.pullRequests || []).map(pr => pr.id);
                                                  const newSelected = new Set(selectedPRs);
                                                  if (event.target.checked) {
                                                    contributorPRIds.forEach(id => newSelected.add(id));
                                                  } else {
                                                    contributorPRIds.forEach(id => newSelected.delete(id));
                                                  }
                                                  setSelectedPRs(newSelected);
                                                }}
                                              />
                                            </TableCell>
                                            <TableCell sx={{ width: '280px' }}>PR Title</TableCell>
                                            <TableCell align="center" sx={{ width: '80px' }}>Status</TableCell>
                                            <TableCell align="center" sx={{ width: '80px' }}>Duration</TableCell>
                                            <TableCell align="center" sx={{ width: '80px' }}>Additions</TableCell>
                                            <TableCell align="center" sx={{ width: '80px' }}>Deletions</TableCell>
                                            <TableCell align="center" sx={{ width: '70px' }}>Reviews</TableCell>
                                            <TableCell align="center" sx={{ width: '80px' }}>Discussion</TableCell>
                                            <TableCell align="center" sx={{ width: '140px' }}>Created</TableCell>
                                            <TableCell align="center" sx={{ width: '140px' }}>Closed/Merged</TableCell>
                                            <TableCell align="center" sx={{ width: '50px' }}>Link</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {(contributorData.pullRequests || []).map((pr) => (
                                            <TableRow key={pr.id}>
                                              <TableCell padding="checkbox" sx={{ width: '50px' }}>
                                                <Checkbox
                                                  checked={selectedPRs.has(pr.id)}
                                                  onChange={() => togglePRSelection(pr.id)}
                                                />
                                              </TableCell>
                                              <TableCell component="th" scope="row" sx={{ width: '280px' }}>
                                                <Typography 
                                                  variant="body2" 
                                                  sx={{ 
                                                    fontWeight: 'medium',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                  }}
                                                  title={`#${pr.number} ${pr.title}`}
                                                >
                                                  #{pr.number} {pr.title}
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="center" sx={{ width: '80px' }}>
                                                <Chip
                                                  label={pr.state}
                                                  size="small"
                                                  color={
                                                    pr.state === 'MERGED' ? 'success' :
                                                    pr.state === 'OPEN' ? 'primary' :
                                                    pr.state === 'CLOSED' ? 'error' :
                                                    'default'
                                                  }
                                                />
                                              </TableCell>
                                              <TableCell align="center" sx={{ width: '80px' }}>
                                                <Typography variant="body2">
                                                  {getPRDuration(pr)}
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="center" sx={{ width: '80px' }}>
                                                <Typography variant="body2" color="success.main">
                                                  +{(pr.additions || 0).toLocaleString()}
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="center" sx={{ width: '80px' }}>
                                                <Typography variant="body2" color="error.main">
                                                  -{(pr.deletions || 0).toLocaleString()}
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="center" sx={{ width: '70px' }}>
                                                <Typography variant="body2">
                                                  {pr.reviews?.totalCount || 0}
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="center" sx={{ width: '80px' }}>
                                                <Typography variant="body2">
                                                  {getTotalComments(pr)}
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="center" sx={{ width: '140px' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                  {moment(pr.createdAt).format('MMM DD, HH:mm')}
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="center" sx={{ width: '140px' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                  {pr.mergedAt ? moment(pr.mergedAt).format('MMM DD, HH:mm') : 
                                                   pr.closedAt ? moment(pr.closedAt).format('MMM DD, HH:mm') : 
                                                   'Open'}
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="center" sx={{ width: '50px' }}>
                                                <IconButton
                                                  href={pr.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  size="small"
                                                >
                                                  <LinkIcon />
                                                </IconButton>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </Box>
                                  </Collapse>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
    </Box>
  );
};

export default RepositoryAnalyticsPage;