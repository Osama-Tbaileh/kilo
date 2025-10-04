import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  FormControlLabel,
  TextField,
  InputAdornment
} from '@mui/material';
// Using HTML date inputs instead of MUI date pickers (no additional dependencies needed)
import {
  ArrowBack as BackIcon,
  GetApp as ExportIcon,
  Person as PersonIcon,
  TrendingUp as TrendingUpIcon,
  Commit as CommitIcon,
  MergeType as PullRequestIcon,
  RateReview as ReviewIcon,
  Code as CodeIcon,
  Schedule as TimeIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Pending as PendingIcon,
  Link as LinkIcon,
  FilterList as FilterIcon,
  SelectAll as SelectAllIcon,
  ClearAll as DeselectAllIcon,
  Comment as CommentIcon
} from '@mui/icons-material';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer 
} from 'recharts';
import moment from 'moment';
import jsPDF from 'jspdf';
import api from '../../services/api';

const ContributorPage = () => {
  const { username } = useParams();
  const navigate = useNavigate();
  
  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [contributor, setContributor] = useState(null);
  const [contributorStats, setContributorStats] = useState(null);
  const [pullRequests, setPullRequests] = useState([]);
  const [selectedPRs, setSelectedPRs] = useState(new Set());
  const [startDate, setStartDate] = useState(moment().subtract(7, 'days'));
  const [endDate, setEndDate] = useState(moment());
  
  // Colors for charts
  const COLORS = ['#667eea', '#48bb78', '#ed8936', '#e53e3e', '#9f7aea', '#38b2ac'];

  // Add search term state (like RepositoryAnalyticsPage)
  const [searchTerm, setSearchTerm] = useState('');
  const [allPRs, setAllPRs] = useState([]);

  // Fetch contributor data using GraphQL (like RepositoryAnalyticsPage)
  const fetchContributorData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setAllPRs([]);
      
      console.log(`🔄 GraphQL: Fetching contributor data: ${username}`);
      console.log(`📅 Date range: ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}`);
      console.log(`🔍 Search term: ${searchTerm || 'none'}`);
      
      const token = localStorage.getItem('auth_token');
      
      // Check for valid token
      if (!token || token === 'null' || token === 'undefined') {
        console.error('❌ No valid authentication token found');
        setError('Authentication required. Please log in again.');
        setLoading(false);
        return;
      }
      
      console.log(`🔐 Using auth token: ${token.substring(0, 20)}...`);
      
      let allPRsCollected = [];
      let hasMorePages = true;
      let afterCursor = null;
      let totalFetched = 0;

      // Keep fetching until we get all PRs in the date range (like RepositoryAnalyticsPage)
      while (hasMorePages) {
        const params = new URLSearchParams({
          startDate: startDate.format('YYYY-MM-DD'),
          endDate: endDate.format('YYYY-MM-DD'),
          maxPRs: '100'
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
      
        const response = await fetch(`/api/contributor-analytics-graphql/${username}?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          
          // Handle authentication errors specifically
          if (response.status === 401) {
            console.error('❌ Authentication failed - invalid or expired token');
            localStorage.removeItem('auth_token'); // Clear invalid token
            setError('Authentication expired. Please log in again.');
            setLoading(false);
            return;
          }
          
          throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch contributor analytics`);
        }
        
        const analyticsData = await response.json();
        const newPRs = analyticsData.pullRequests || [];
        const contributorInfo = analyticsData.contributor;
        const batchStats = analyticsData.stats;
        const pagination = analyticsData.pagination;
        
        console.log(`📊 Batch received: ${newPRs.length} PRs`);
        console.log(`📈 Stats: ${batchStats?.totalPRs || 0} total, ${batchStats?.mergedPRs || 0} merged`);
        
        // Add new PRs to collection
        allPRsCollected = allPRsCollected.concat(newPRs);
        totalFetched = allPRsCollected.length;
        
        // Update state with current progress
        setAllPRs([...allPRsCollected]);
        
        // Set contributor info (only once)
        if (contributorInfo && !contributor) {
          setContributor({
            username: contributorInfo.username || username,
            name: contributorInfo.name || username,
            email: contributorInfo.email || '',
            avatarUrl: contributorInfo.avatarUrl || `https://github.com/${username}.png`,
            bio: contributorInfo.bio || '',
            company: contributorInfo.company || '',
            location: contributorInfo.location || '',
            blog: contributorInfo.blog || '',
            twitterUsername: contributorInfo.twitterUsername || '',
            publicRepos: contributorInfo.publicRepos || 0,
            followers: contributorInfo.followers || 0,
            following: contributorInfo.following || 0,
            url: contributorInfo.url || `https://github.com/${username}`
          });
        }
        
        // Set stats (cumulative)
        setContributorStats(batchStats || {
          totalPRs: 0,
          mergedPRs: 0,
          openPRs: 0,
          closedPRs: 0,
          totalReviews: 0,
          linesAdded: 0,
          linesDeleted: 0,
          totalCommits: 0,
          repositories: 0,
          changedFiles: 0
        });
        
        // Check pagination
        hasMorePages = pagination?.hasNextPage || false;
        afterCursor = pagination?.endCursor || null;
        
        console.log(`📄 Pagination: hasNext=${hasMorePages}, cursor=${afterCursor?.substring(0, 10)}...`);
        
        if (!hasMorePages) {
          break;
        }
      }

      // Final processing
      setPullRequests(allPRsCollected);
      
      // Auto-select all PRs
      const prIds = new Set(allPRsCollected.map(pr => pr.id));
      setSelectedPRs(prIds);
      
      console.log(`✅ GraphQL fetch complete: ${allPRsCollected.length} total PRs loaded`);
      console.log(`📊 Final stats:`, {
        totalPRs: allPRsCollected.length,
        repositories: new Set(allPRsCollected.map(pr => pr.repository?.name)).size
      });
      
    } catch (err) {
      console.error('❌ Error fetching contributor data:', err);
      
      // Provide fallback data structure
      setContributor({
        username: username,
        name: username,
        avatarUrl: `https://github.com/${username}.png`,
        bio: '',
        company: '',
        location: ''
      });
      
      setContributorStats({
        totalPRs: 0,
        mergedPRs: 0,
        openPRs: 0,
        closedPRs: 0,
        totalReviews: 0,
        linesAdded: 0,
        linesDeleted: 0,
        totalCommits: 0,
        repositories: 0
      });
      
      setPullRequests([]);
      setAllPRs([]);
      setError('Failed to load contributor data. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [username, startDate, endDate, searchTerm]);

  // Auto-load data when component mounts or username changes (like RepositoryAnalyticsPage)
  useEffect(() => {
    if (username) {
      fetchContributorData(); // Direct function call
    }
  }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle date changes (enhanced like RepositoryAnalyticsPage)
  const handleDateRangeUpdate = async () => {
    console.log(`🔄 Update button clicked - Fetching contributor data for date range: ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}`);
    
    // Clear previous state and show loading
    setLoading(true);
    setError(null);
    setPullRequests([]);
    setSelectedPRs(new Set());
    setContributorStats(null);
    
    // Call the fetch function
    await fetchContributorData();
  };

  // Helper functions for PR display (matching RepositoryAnalyticsPage)
  const formatDateTime = (dateString) => {
    return moment(dateString).format('MMM DD, YYYY HH:mm');
  };

  const getPRStateColor = (state, merged) => {
    if (merged || state === 'MERGED' || state === 'merged') return 'success';     // Green for merged
    if (state === 'OPEN' || state === 'open') return 'primary';     // Blue for open  
    if (state === 'CLOSED' || state === 'closed') return 'error';   // Red for closed
    if (state === 'DRAFT' || state === 'draft') return 'warning';   // Orange for draft
    return 'default';  // Gray for unknown
  };

  const getPRStateText = (state, merged) => {
    if (merged || state === 'MERGED' || state === 'merged') return 'MERGED';
    if (state === 'OPEN' || state === 'open') return 'OPEN';
    if (state === 'CLOSED' || state === 'closed') return 'CLOSED';  
    if (state === 'DRAFT' || state === 'draft') return 'DRAFT';
    return (state || 'UNKNOWN').toUpperCase();
  };

  // Calculate total discussion activity (comprehensive comment count - same as RepositoryAnalyticsPage)
  const getTotalComments = (pr) => {
    const prComments = pr.comments?.totalCount || 0;                           // General PR comments
    const reviewLineComments = pr.reviews?.nodes?.reduce((sum, review) =>     // Line comments within reviews
      sum + (review.comments?.totalCount || 0), 0) || 0;
    const reviewBodies = pr.reviews?.nodes?.filter(review => 
      review.body && review.body.trim().length > 0).length || 0;              // Review summaries with content
    
    // Provide a comprehensive discussion metric (includes all human communication)
    const totalDiscussion = prComments + reviewLineComments + reviewBodies;
    return totalDiscussion;
  };

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

  // Calculate average PR duration
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
    const allIds = new Set(pullRequests.map(pr => pr.id));
    setSelectedPRs(allIds);
  };

  const deselectAllPRs = () => {
    setSelectedPRs(new Set());
  };

  // Get filtered stats based on selected PRs
  const getFilteredStats = () => {
    if (!contributorStats) return {};
    
    const selectedPRList = pullRequests.filter(pr => selectedPRs.has(pr.id));
    
    // Calculate reviews received from selected PRs only
    const reviewsReceived = selectedPRList.reduce((sum, pr) => {
      return sum + (pr.reviews?.totalCount || 0);
    }, 0);
    
    // Calculate total commits from selected PRs only
    const totalCommits = selectedPRList.reduce((sum, pr) => {
      return sum + (pr.commits?.totalCount || 0);
    }, 0);
    
    return {
      totalPRs: selectedPRList.length,
      mergedPRs: selectedPRList.filter(pr => pr.state === 'MERGED').length,
      openPRs: selectedPRList.filter(pr => pr.state === 'OPEN').length,
      closedPRs: selectedPRList.filter(pr => pr.state === 'CLOSED').length,
      linesAdded: selectedPRList.reduce((sum, pr) => sum + (pr.additions || 0), 0),
      linesDeleted: selectedPRList.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
      reviewsReceived: reviewsReceived,
      totalReviews: reviewsReceived, // For backwards compatibility
      reviewsGiven: contributorStats.reviewsGiven || 0, // This comes from server, not PR-specific
      commits: totalCommits,
      repositories: new Set(selectedPRList.map(pr => pr.repository?.name)).size
    };
  };

  // Test avatar loading function
  const testAvatarLoading = async () => {
    console.log('🧪 Testing avatar loading...');
    console.log('Current contributor:', contributor);
    
    const testUrls = [
      contributor?.avatarUrl,
      `https://github.com/${contributor?.username || username}.png?size=200`,
      `https://avatars.githubusercontent.com/${contributor?.username || username}?size=200`,
      `https://github.com/${username}.png?size=200`
    ].filter(url => url && !url.includes('null'));
    
    console.log('Test URLs:', testUrls);
    
    for (const url of testUrls) {
      try {
        console.log(`🔍 Testing: ${url}`);
        const response = await fetch(url, { method: 'HEAD' });
        console.log(`📊 Status: ${response.status}, Type: ${response.headers.get('content-type')}`);
        
        if (response.ok) {
          console.log(`✅ URL is accessible: ${url}`);
          
          // Test actual loading
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          const loadTest = await new Promise((resolve) => {
            img.onload = () => {
              console.log(`✅ Image loaded successfully: ${img.width}x${img.height}`);
              resolve(true);
            };
            img.onerror = (err) => {
              console.log(`❌ Image loading failed:`, err);
              resolve(false);
            };
            setTimeout(() => {
              console.log(`⏰ Image loading timeout`);
              resolve(false);
            }, 5000);
            
            img.src = url;
          });
          
          if (loadTest) {
            console.log(`🎯 SUCCESS: ${url} is working!`);
            break;
          }
        }
      } catch (error) {
        console.log(`❌ Error testing ${url}:`, error);
      }
    }
  };

  // Export to PDF
  const exportToPDF = async () => {
    try {
      console.log('🔄 Starting Contributor PDF export...');
      
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape mode for more table width
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPosition = 20;
      
      const filteredStats = getFilteredStats();
      const selectedPRList = pullRequests.filter(pr => selectedPRs.has(pr.id));
      
      // Helper function to add text with automatic line wrapping
      const addText = (text, x, y, options = {}) => {
        const fontSize = options.fontSize || 10;
        const fontStyle = options.fontStyle || 'normal';
        const maxWidth = options.maxWidth || pageWidth - 40;
        
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', fontStyle);
        
        const lines = doc.splitTextToSize(text, maxWidth);
        doc.text(lines, x, y);
        return y + (lines.length * fontSize * 0.5);
      };
      
      // Helper function to check if we need a new page
      const checkNewPage = (requiredHeight) => {
        if (yPosition + requiredHeight > pageHeight - 15) {
          doc.addPage();
          yPosition = 20;
        }
      };
      
      // Header with professional background
      doc.setFillColor(79, 70, 229); // Professional indigo - elegant and modern
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      // Add circular profile image to header
      const headerImageSize = 25;
      const headerImageX = pageWidth - headerImageSize - 20; // Right side
      const headerImageY = 7.5; // Centered in 40mm header
      
      // Add profile image with robust loading
      let imageLoaded = false;
      
      // Debug: Log contributor data
      console.log('🔍 Contributor data:', {
        username: contributor?.username,
        avatarUrl: contributor?.avatarUrl,
        name: contributor?.name
      });
      
      try {
        // Try multiple avatar URL formats
        const avatarUrls = [
          contributor?.avatarUrl,
          `https://github.com/${contributor?.username || username}.png?size=200`,
          `https://avatars.githubusercontent.com/${contributor?.username || username}?size=200`,
          `https://github.com/${username}.png?size=200`
        ].filter(url => url && !url.includes('null'));
        
        console.log('🔄 Trying avatar URLs:', avatarUrls);
        
        for (const avatarUrl of avatarUrls) {
          try {
            console.log(`🔄 Attempting to load: ${avatarUrl}`);
            
            // Try fetch approach first (better for CORS)
            let loadResult = await tryFetchMethod(avatarUrl);
            
            // If fetch fails, try img element approach
            if (!loadResult) {
              loadResult = await tryImageMethod(avatarUrl);
            }
            
            if (loadResult) {
              imageLoaded = true;
              console.log('🎯 Successfully loaded and processed avatar!');
              break; // Success, exit the loop
            }
          } catch (urlError) {
            console.log(`❌ Error with URL ${avatarUrl}:`, urlError);
            continue; // Try next URL
          }
        }
        
        // Helper function: Try fetch method
        async function tryFetchMethod(url) {
          try {
            console.log(`🌐 Trying fetch method for: ${url}`);
            
            const response = await fetch(url, {
              method: 'GET',
              mode: 'cors'
            });
            
            if (!response.ok) {
              console.log(`❌ Fetch failed with status: ${response.status}`);
              return false;
            }
            
            const blob = await response.blob();
            console.log(`📦 Got blob:`, blob.type, blob.size, 'bytes');
            
            return new Promise((resolve) => {
              const img = new Image();
              const url = URL.createObjectURL(blob);
              
              img.onload = () => {
                URL.revokeObjectURL(url); // Clean up
                console.log(`✅ Fetch method - Image loaded: ${img.width}x${img.height}`);
                
                const success = processImageToCanvas(img);
                resolve(success);
              };
              
              img.onerror = () => {
                URL.revokeObjectURL(url);
                console.log('❌ Fetch method - Image processing failed');
                resolve(false);
              };
              
              img.src = url;
            });
          } catch (fetchError) {
            console.log('❌ Fetch method failed:', fetchError);
            return false;
          }
        }
        
        // Helper function: Try traditional img element method
        async function tryImageMethod(url) {
          return new Promise((resolve) => {
            console.log(`🖼️ Trying image method for: ${url}`);
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            const loadTimeout = setTimeout(() => {
              console.log(`⏰ Image method timeout for: ${url}`);
              resolve(false);
            }, 3000);
            
            img.onload = () => {
              clearTimeout(loadTimeout);
              console.log(`✅ Image method - loaded: ${img.width}x${img.height}`);
              
              const success = processImageToCanvas(img);
              resolve(success);
            };
            
            img.onerror = (imgError) => {
              clearTimeout(loadTimeout);
              console.log(`❌ Image method failed:`, imgError);
              resolve(false);
            };
            
            img.src = url;
          });
        }
        
        // Helper function: Process loaded image to canvas and add to PDF
        function processImageToCanvas(img) {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 200;
            canvas.height = 200;
            
            console.log('🎨 Processing image to canvas...');
            
            // Start with transparent background (no white fill)
            // Create circular clipping path first
            ctx.save();
            ctx.beginPath();
            ctx.arc(100, 100, 95, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            
            // Draw image within circle
            ctx.drawImage(img, 0, 0, 200, 200);
            ctx.restore();
            
            // Add subtle border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(100, 100, 95, 0, Math.PI * 2);
            ctx.stroke();
            
            console.log('🎨 Canvas processing complete');
            
            // Convert to PNG to preserve transparency
            const imageData = canvas.toDataURL('image/png', 0.9);
            console.log('📄 PNG image data ready, length:', imageData.length);
            
            // Add PNG image directly (transparency preserved)
            doc.addImage(imageData, 'PNG', headerImageX, headerImageY, headerImageSize, headerImageSize);
            console.log('✅ Circular PNG avatar added to PDF!');
            
            return true;
          } catch (canvasError) {
            console.log('❌ Canvas processing failed:', canvasError);
            return false;
          }
        }
      } catch (error) {
        console.log('❌ Overall avatar loading error:', error);
      }
      
      // Draw placeholder if no image loaded
      if (!imageLoaded) {
        console.log('📝 Drawing placeholder - no avatar loaded');
        drawHeaderPlaceholder();
      }
      
      // Helper function for header placeholder
      function drawHeaderPlaceholder() {
        // Draw a nice circular placeholder with border
        doc.setFillColor(255, 255, 255);
        doc.circle(headerImageX + headerImageSize/2, headerImageY + headerImageSize/2, headerImageSize/2, 'F');
        
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(1);
        doc.circle(headerImageX + headerImageSize/2, headerImageY + headerImageSize/2, headerImageSize/2, 'S');
        
        // Show initials instead of "USER" for more professional look
        const name = contributor?.name || contributor?.username || username || 'U';
        const initials = name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(120, 120, 120);
        const centerX = headerImageX + headerImageSize/2;
        const centerY = headerImageY + headerImageSize/2;
        const textWidth = doc.getTextWidth(initials);
        doc.text(initials, centerX - textWidth/2, centerY + 2);
        
        console.log(`📝 Drew placeholder with initials: ${initials}`);
      }
      
      // Title in white  
      doc.setTextColor(255, 255, 255);
      yPosition = addText(`${contributor?.name || username}`, 20, 22, { 
        fontSize: 20, 
        fontStyle: 'bold' 
      });
      yPosition = addText('Contributor Performance Report', 20, yPosition + 2, { 
        fontSize: 14
      });
      
      // Reset text color
      doc.setTextColor(0, 0, 0);
      yPosition = 50;
      
      // Report metadata in a gray box
      doc.setFillColor(248, 250, 252);
      doc.rect(15, yPosition - 5, pageWidth - 30, 20, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, yPosition - 5, pageWidth - 30, 20, 'S');
      
      yPosition = addText(`Report Period: ${startDate.format('MMM DD, YYYY')} to ${endDate.format('MMM DD, YYYY')}`, 20, yPosition, { fontSize: 11, fontStyle: 'bold' });
      yPosition = addText(`Generated: ${moment().format('MMM DD, YYYY')} | Total PRs: ${selectedPRList.length}`, 20, yPosition + 4, { fontSize: 9 });
      yPosition += 20;
      
      
      // Performance Metrics Section (on first page with profile)
      doc.setFillColor(79, 70, 229);
      doc.rect(15, yPosition - 2, 3, 8, 'F');
      yPosition = addText('PERFORMANCE METRICS', 25, yPosition, { fontSize: 11, fontStyle: 'bold' });
      yPosition += 8;
      
      // All metrics in a single clean row
      const allMetrics = [
        { label: 'Pull Requests', value: filteredStats.totalPRs, color: [59, 130, 246] },
        { label: 'Merged', value: filteredStats.mergedPRs, color: [34, 197, 94] },
        { label: 'Open PRs', value: filteredStats.openPRs, color: [59, 130, 246] },
        { label: 'Closed PRs', value: filteredStats.closedPRs, color: [239, 68, 68] },
        { label: 'Lines Added', value: filteredStats.linesAdded.toLocaleString(), color: [168, 85, 247] },
        { label: 'Lines Deleted', value: filteredStats.linesDeleted.toLocaleString(), color: [245, 101, 101] },
        { label: 'Reviews Given', value: filteredStats.reviewsGiven || 0, color: [249, 115, 22] },
        { label: 'Reviews Received', value: filteredStats.reviewsReceived || filteredStats.totalReviews || 0, color: [6, 182, 212] },
        { label: 'Total Commits', value: filteredStats.commits || 0, color: [99, 102, 241] },
        { label: 'Repositories', value: filteredStats.repositories, color: [107, 114, 128] },
        { label: 'Avg PR Duration', value: getAveragePRDuration(selectedPRList), subValue: getAverageMergedPRDuration(selectedPRList), color: [139, 92, 246] }
      ];
      
      // Uniform cards centered in landscape (297mm page width)
      const cardWidth = 22;
      const cardHeight = 18;
      const totalCardsWidth = allMetrics.length * cardWidth + (allMetrics.length - 1) * 1;
      const startX = (297 - totalCardsWidth) / 2; // Center horizontally in landscape
      const spaceBetween = 1;
      
      allMetrics.forEach((metric, index) => {
        const cardX = startX + (index * (cardWidth + spaceBetween));
        
        // Card background
        doc.setFillColor(249, 250, 251);
        doc.rect(cardX, yPosition, cardWidth, cardHeight, 'F');
        
        // Card border
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.rect(cardX, yPosition, cardWidth, cardHeight, 'S');
        
        // Colored accent line
        doc.setFillColor(metric.color[0], metric.color[1], metric.color[2]);
        doc.rect(cardX, yPosition, cardWidth, 2, 'F');
        
        // Value (larger for better readability)
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        const valueWidth = doc.getTextWidth(metric.value.toString());
        const mainValueY = metric.subValue ? yPosition + 7 : yPosition + 9; // Move up if subvalue exists
        doc.text(metric.value.toString(), cardX + (cardWidth - valueWidth) / 2, mainValueY);
        
        // Sub-value (smaller text for merged-only duration)
        if (metric.subValue) {
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(107, 114, 128);
          const subValueText = `${metric.subValue} (merged)`;
          const subValueWidth = doc.getTextWidth(subValueText);
          doc.text(subValueText, cardX + (cardWidth - subValueWidth) / 2, yPosition + 11.5);
        }
        
        // Label (bigger for better readability)
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        const labelWidth = doc.getTextWidth(metric.label);
        doc.text(metric.label, cardX + (cardWidth - labelWidth) / 2, yPosition + 15);
      });
      
      yPosition += 22;
      
      // Pull Requests Details Table (always start on new page)
      if (selectedPRList.length > 0) {
        doc.addPage();
        yPosition = 20;
        
        doc.setFillColor(79, 70, 229);
        doc.rect(15, yPosition - 2, 3, 8, 'F');
        yPosition = addText(`PULL REQUESTS ANALYSIS (${selectedPRList.length} PRs)`, 25, yPosition, { fontSize: 12, fontStyle: 'bold' });
        yPosition += 12;
        
        // Table setup
        const tableStartY = yPosition;
        // Calculate exact table width as sum of all column widths
        const rowHeight = 14;
        const headerHeight = 16;
        
        // Landscape A4 (297mm wide) with centered table positioning
        const columns = [
          { header: 'PR #', width: 18, align: 'center' },
          { header: 'Title', width: 75, align: 'left' },
          { header: 'Repository', width: 32, align: 'left' },
          { header: 'Status', width: 18, align: 'center' },
          { header: 'Lines +/-', width: 22, align: 'center' },
          { header: 'Reviews', width: 15, align: 'center' },
          { header: 'Comments', width: 18, align: 'center' },
          { header: 'Commits', width: 15, align: 'center' },
          { header: 'Created', width: 20, align: 'center' },
          { header: 'Duration', width: 16, align: 'center' }
        ]; // Dynamically centered on page
        
        // Calculate actual table width from column widths
        const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
        
        // Center table horizontally on the page
        const tableStartX = (297 - tableWidth) / 2; // Center in landscape A4 (297mm)
        
        let currentX = tableStartX;
        
        // Draw table header
        doc.setFillColor(79, 70, 229);
        doc.rect(tableStartX, yPosition, tableWidth, headerHeight, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        
        columns.forEach(col => {
          const textX = col.align === 'center' ? currentX + (col.width / 2) : currentX + 2;
          doc.text(col.header, textX, yPosition + 10, { align: col.align === 'center' ? 'center' : 'left' });
          currentX += col.width;
        });
        
        yPosition += headerHeight;
        
        // Draw table rows
        selectedPRList.forEach((pr, index) => {
          checkNewPage(rowHeight + 6);
          
          // Alternate row background
          if (index % 2 === 0) {
            doc.setFillColor(249, 250, 251);
            doc.rect(tableStartX, yPosition, tableWidth, rowHeight, 'F');
          }
          
          // Row border
          doc.setDrawColor(229, 231, 235);
          doc.setLineWidth(0.2);
          doc.rect(tableStartX, yPosition, tableWidth, rowHeight, 'S');
          
          currentX = tableStartX;
          doc.setTextColor(31, 41, 55);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          
          // PR Number
          const prNum = `#${pr.number}`;
          doc.text(prNum, currentX + (columns[0].width / 2), yPosition + 8, { align: 'center' });
          currentX += columns[0].width;
          
          // Title (with proper character limit for smaller 8pt font)
          const maxTitleChars = Math.floor(columns[1].width / 2.0); // More characters fit with 8pt font
          const title = (pr.title || 'Untitled').substring(0, maxTitleChars) + ((pr.title || '').length > maxTitleChars ? '...' : '');
          doc.text(title, currentX + 2, yPosition + 8);
          currentX += columns[1].width;
          
          // Repository (with proper character limit for smaller font)
          const maxRepoChars = Math.floor(columns[2].width / 2.0);
          const repo = (pr.repository?.name || 'Unknown').substring(0, maxRepoChars);
          doc.text(repo, currentX + 2, yPosition + 8);
          currentX += columns[2].width;
          
          // Status with color
          const statusText = getPRStateText(pr.state, pr.merged);
          const statusColor = pr.state === 'merged' || pr.merged ? [34, 197, 94] : 
                             pr.state === 'open' ? [59, 130, 246] : [239, 68, 68];
          doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
          doc.setFont('helvetica', 'bold');
          doc.text(statusText, currentX + (columns[3].width / 2), yPosition + 8, { align: 'center' });
          currentX += columns[3].width;
          
          // Lines +/-
          doc.setTextColor(31, 41, 55);
          doc.setFont('helvetica', 'normal');
          const changes = `+${pr.additions || 0}/-${pr.deletions || 0}`;
          doc.text(changes, currentX + (columns[4].width / 2), yPosition + 8, { align: 'center' });
          currentX += columns[4].width;
          
          // Reviews
          const reviews = (pr.reviews?.totalCount || 0).toString();
          doc.text(reviews, currentX + (columns[5].width / 2), yPosition + 8, { align: 'center' });
          currentX += columns[5].width;
          
          // Comments (use comprehensive calculation)
          const comments = getTotalComments(pr).toString();
          doc.text(comments, currentX + (columns[6].width / 2), yPosition + 8, { align: 'center' });
          currentX += columns[6].width;
          
          // Commits
          const commits = (pr.commits?.totalCount || pr.commitsCount || 0).toString();
          doc.text(commits, currentX + (columns[7].width / 2), yPosition + 8, { align: 'center' });
          currentX += columns[7].width;
          
          // Created date (with year for better context)
          const created = moment(pr.createdAt).format('DD/MM/YY');
          doc.text(created, currentX + (columns[8].width / 2), yPosition + 8, { align: 'center' });
          currentX += columns[8].width;
          
          // Duration
          const duration = getPRDuration(pr);
          doc.text(duration, currentX + (columns[9].width / 2), yPosition + 8, { align: 'center' });
          
          yPosition += rowHeight;
        });
        
        // Draw vertical grid lines
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.2);
        currentX = tableStartX;
        columns.forEach((col, index) => {
          if (index < columns.length - 1) {
            currentX += col.width;
            doc.line(currentX, tableStartY, currentX, yPosition);
          }
        });
        
        // Table bottom border
        doc.setLineWidth(0.5);
        doc.line(tableStartX, yPosition, tableStartX + tableWidth, yPosition);
        
        yPosition += 10;
        
        // Add table footer with clickable links
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.text('TIP: Click on any PR number to view detailed information on GitHub', tableStartX + 2, yPosition);
        yPosition += 5;
        
        // Create invisible clickable areas over PR numbers for GitHub links
        selectedPRList.forEach((pr, index) => {
          if (pr.url) {
            const linkY = tableStartY + headerHeight + (index * rowHeight);
            doc.link(tableStartX, linkY, columns[0].width, rowHeight, { url: pr.url });
          }
        });
        
        yPosition += 10;
      }
      
      // Performance Summary & Insights Section (always on new page)
      doc.addPage();
      yPosition = 20;
      
      // Section header
      doc.setFillColor(79, 70, 229);
      doc.rect(15, yPosition - 2, 3, 8, 'F');
      yPosition = addText('PERFORMANCE INSIGHTS & RECOMMENDATIONS', 25, yPosition, { fontSize: 12, fontStyle: 'bold' });
      yPosition += 15;
      
      // Calculate insights
      const mergeRate = filteredStats.totalPRs > 0 ? ((filteredStats.mergedPRs / filteredStats.totalPRs) * 100).toFixed(1) : 0;
      const avgLinesPerPR = filteredStats.totalPRs > 0 ? Math.round(filteredStats.linesAdded / filteredStats.totalPRs) : 0;
      const reviewsPerPR = filteredStats.totalPRs > 0 ? (filteredStats.totalReviews / filteredStats.totalPRs).toFixed(1) : 0;
      
      // Key Performance Indicators (professional styling)
      doc.setFillColor(248, 250, 252); // Light gray background
      doc.rect(15, yPosition - 5, pageWidth - 30, 40, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      doc.rect(15, yPosition - 5, pageWidth - 30, 40, 'S');
      
      // Green accent bar on left
      doc.setFillColor(34, 197, 94);
      doc.rect(15, yPosition - 5, 4, 40, 'F');
      
      doc.setTextColor(15, 23, 42); // Dark text
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('KEY PERFORMANCE INDICATORS', 25, yPosition);
      yPosition += 8;
      
      const kpis = [
        `Merge Success Rate: ${mergeRate}% (${filteredStats.mergedPRs}/${filteredStats.totalPRs} PRs merged)`,
        `Average Impact: ${avgLinesPerPR} lines of code per PR`,
        `Code Review Engagement: ${reviewsPerPR} reviews received per PR`,
        `Repository Diversity: Contributing to ${filteredStats.repositories} different repositories`
      ];
      
      doc.setTextColor(51, 65, 85); // Darker gray text
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      kpis.forEach((kpi, index) => {
        // Bullet point
        doc.setFillColor(34, 197, 94);
        doc.circle(27, yPosition - 1, 1, 'F');
        doc.text(kpi, 32, yPosition);
        yPosition += 4.5;
      });
      
      yPosition += 15;
        
      // Recommendations (professional styling)
      doc.setFillColor(248, 250, 252); // Light gray background
      doc.rect(15, yPosition - 5, pageWidth - 30, 55, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      doc.rect(15, yPosition - 5, pageWidth - 30, 55, 'S');
      
      // Purple accent bar on left
      doc.setFillColor(168, 85, 247);
      doc.rect(15, yPosition - 5, 4, 55, 'F');
      
      doc.setTextColor(15, 23, 42); // Dark text
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('PERFORMANCE RECOMMENDATIONS', 25, yPosition);
      yPosition += 8;
        
      const recommendations = [];
      
      if (mergeRate < 70) {
        recommendations.push('Consider breaking down larger PRs into smaller, more focused changes to improve merge rate');
      }
      if (avgLinesPerPR > 500) {
        recommendations.push('Large PRs detected - smaller PRs are typically easier to review and merge');
      }
      if (reviewsPerPR < 1) {
        recommendations.push('Increase participation in code reviews to enhance team collaboration');
      }
      if (filteredStats.openPRs > filteredStats.mergedPRs) {
        recommendations.push('Focus on completing existing PRs before starting new ones');
      }
        
      if (recommendations.length === 0) {
        recommendations.push('Excellent performance! Continue maintaining high code quality and collaboration standards');
      }
      
      doc.setTextColor(51, 65, 85); // Darker gray text
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      recommendations.forEach((rec, index) => {
        // Purple bullet point
        doc.setFillColor(168, 85, 247);
        doc.circle(27, yPosition - 1, 1, 'F');
        
        // Split long text into multiple lines
        const lines = doc.splitTextToSize(rec, pageWidth - 60);
        lines.forEach((line, lineIndex) => {
          doc.text(line, 32, yPosition + (lineIndex * 4));
        });
        yPosition += (lines.length * 4) + 2;
      });
        
      yPosition += 15;
      
      // Period Summary (professional styling)
      doc.setFillColor(248, 250, 252); // Light gray background
      doc.rect(15, yPosition - 5, pageWidth - 30, 30, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.5);
      doc.rect(15, yPosition - 5, pageWidth - 30, 30, 'S');
      
      // Indigo accent bar on left
      doc.setFillColor(79, 70, 229);
      doc.rect(15, yPosition - 5, 4, 30, 'F');
      
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('PERIOD SUMMARY', 25, yPosition);
      yPosition += 8;
      
      const periodDays = endDate.diff(startDate, 'days') + 1;
      const avgPRsPerDay = (filteredStats.totalPRs / periodDays).toFixed(2);
      
      doc.setTextColor(51, 65, 85);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      const summaryText = `During this ${periodDays}-day period, ${contributor?.name || username} demonstrated consistent contribution patterns with an average of ${avgPRsPerDay} pull requests per day and maintained quality standards across ${filteredStats.repositories} repositories.`;
      const summaryLines = doc.splitTextToSize(summaryText, pageWidth - 50);
      summaryLines.forEach((line, index) => {
        doc.text(line, 25, yPosition + (index * 4));
      });
      
      // Professional Footer on all pages
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        // Footer background
        doc.setFillColor(248, 250, 252);
        doc.rect(0, pageHeight - 15, pageWidth, 15, 'F');
        
        // Footer content
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        
        // Single-line footer with proper spacing and alignment
        const footerY = pageHeight - 8;
        
        // Left: CONFIDENTIAL
        doc.text('CONFIDENTIAL', 20, footerY);
        
        // Center: Generated by + Date
        const currentDate = moment().format('MMM DD, YYYY');
        const centerText = `Generated by: Osama Tbaileh | ${currentDate}`;
        const centerTextWidth = doc.getTextWidth(centerText);
        const centerX = (pageWidth - centerTextWidth) / 2;
        doc.text(centerText, centerX, footerY);
        
        // Right: Page numbers
        const pageText = `Page ${i} of ${totalPages}`;
        const pageTextWidth = doc.getTextWidth(pageText);
        doc.text(pageText, pageWidth - pageTextWidth - 20, footerY);
      }
      
      // Save PDF
      const fileName = `${contributor?.username || username}_report_${startDate.format('YYYY-MM-DD')}_to_${endDate.format('YYYY-MM-DD')}.pdf`;
      doc.save(fileName);
      
      console.log('✅ PDF export completed successfully!');
      
    } catch (error) {
      console.error('❌ PDF export failed:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  // Loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={40} />
          <Typography variant="body2" color="text.secondary">
            Loading contributor data...
          </Typography>
        </Stack>
      </Box>
    );
  }

  // Error state with authentication handling
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert 
          severity="error" 
          action={
            error.includes('Authentication') && (
              <Button 
                color="inherit" 
                size="small"
                onClick={() => {
                  // Clear any invalid tokens and redirect to login
                  localStorage.removeItem('auth_token');
                  window.location.href = '/login';
                }}
              >
                Login Again
              </Button>
            )
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  const filteredStats = getFilteredStats();

  return (
    <Box sx={{ width: '100%', minHeight: '100vh', backgroundColor: 'background.default' }}>
        {/* Header Section */}
        <Paper 
          elevation={0} 
          sx={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            py: 4,
            px: 4,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={8}>
              <Stack direction="row" alignItems="center" spacing={3}>
                <IconButton 
                  onClick={() => navigate('/team')}
                  sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)' }}
                >
                  <BackIcon />
                </IconButton>
                
                <Avatar 
                  src={contributor?.avatarUrl} 
                  sx={{ width: 80, height: 80, border: '3px solid rgba(255,255,255,0.3)' }}
                >
                  <PersonIcon sx={{ fontSize: 40 }} />
                </Avatar>
                
                <Box>
                  <Typography variant="h3" fontWeight="bold" gutterBottom>
                    {contributor?.name || username}
                  </Typography>
                  <Typography variant="h6" sx={{ opacity: 0.9 }} gutterBottom>
                    @{contributor?.username || username}
                  </Typography>
                  {contributor?.bio && (
                    <Typography variant="body1" sx={{ opacity: 0.8, maxWidth: 500 }}>
                      {contributor.bio}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                    {contributor?.company && (
                      <Chip 
                        icon={<PersonIcon />} 
                        label={contributor.company} 
                        size="small" 
                        sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                      />
                    )}
                    {contributor?.location && (
                      <Chip 
                        label={contributor.location} 
                        size="small" 
                        sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                      />
                    )}
                  </Stack>
                </Box>
              </Stack>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Stack spacing={2}>
                <Button
                  variant="contained"
                  startIcon={<ExportIcon />}
                  onClick={() => {
                    exportToPDF().catch(error => {
                      console.error('PDF export error:', error);
                      alert('Failed to export PDF. Please try again.');
                    });
                  }}
                  disabled={selectedPRs.size === 0}
                  sx={{ 
                    bgcolor: 'rgba(255,255,255,0.2)', 
                    color: 'white',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
                  }}
                >
                  Export PDF Report
                </Button>
                
                
                <Typography variant="body2" sx={{ opacity: 0.8, textAlign: 'center' }}>
                  {selectedPRs.size} of {pullRequests.length} PRs selected
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </Paper>

        {/* Error Alert */}
        {error && (
          <Box sx={{ p: 3 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              {error}
            </Alert>
          </Box>
        )}

        {/* Main Content */}
        <Box sx={{ p: 4 }}>
          {/* Date Range Controls */}
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <FilterIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Date Range Filter
              </Typography>
              
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm={2.5}>
                  <TextField
                    label="From Date"
                    type="date"
                    value={startDate.format('YYYY-MM-DD')}
                    onChange={(e) => setStartDate(moment(e.target.value))}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                
                <Grid item xs={12} sm={2.5}>
                  <TextField
                    label="To Date"
                    type="date"
                    value={endDate.format('YYYY-MM-DD')}
                    onChange={(e) => setEndDate(moment(e.target.value))}
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                
                <Grid item xs={12} sm={3}>
                  <TextField
                    label="Search PRs"
                    placeholder="Filter by title or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    fullWidth
                    size="small"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <FilterIcon />
                        </InputAdornment>
                      )
                    }}
                  />
                </Grid>
                
                <Grid item xs={12} sm={2}>
                  <Button 
                    variant="contained" 
                    onClick={handleDateRangeUpdate}
                    disabled={loading}
                    fullWidth
                  >
                    {loading ? `Fetching... (${allPRs.length})` : 'Update (GraphQL)'}
                  </Button>
                </Grid>
                
                <Grid item xs={12} sm={4}>
                  <Stack direction="row" spacing={1}>
                    <Button 
                      size="small" 
                      onClick={() => {
                        setStartDate(moment().subtract(7, 'days'));
                        setEndDate(moment());
                      }}
                    >
                      Last Week
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => {
                        setStartDate(moment().subtract(30, 'days'));
                        setEndDate(moment());
                      }}
                    >
                      Last Month
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => {
                        setStartDate(moment().subtract(90, 'days'));
                        setEndDate(moment());
                      }}
                    >
                      Last Quarter
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
              
              {/* Status Information - Like RepositoryAnalyticsPage */}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2, px: 2 }}>
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
                {!loading && pullRequests.length > 0 && (
                  <>
                    <br />
                    ✅ Selected for calculations: {selectedPRs.size} of {pullRequests.length} PRs
                  </>
                )}
                {!loading && pullRequests.length === 0 && !error && (
                  <>
                    <br />
                    📭 No pull requests found in this date range
                  </>
                )}
              </Typography>
            </CardContent>
          </Card>

          {/* Statistics Cards */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 4, justifyContent: 'space-between' }}>
            {[
              { title: 'Total PRs', value: filteredStats.totalPRs, icon: PullRequestIcon, color: '#667eea' },
              { title: 'Merged', value: filteredStats.mergedPRs, icon: CheckIcon, color: '#48bb78' },
              { title: 'Open', value: filteredStats.openPRs, icon: PendingIcon, color: '#ed8936' },
              { title: 'Closed', value: filteredStats.closedPRs, icon: CancelIcon, color: '#e53e3e' },
              { title: 'Lines Added', value: filteredStats.linesAdded, icon: TrendingUpIcon, color: '#48bb78' },
              { title: 'Lines Deleted', value: filteredStats.linesDeleted, icon: CodeIcon, color: '#e53e3e' },
              { title: 'Repositories', value: filteredStats.repositories, icon: CodeIcon, color: '#9f7aea' },
              { title: 'Reviews Given', value: filteredStats.reviewsGiven || 0, icon: ReviewIcon, color: '#38b2ac' },
              { title: 'Reviews Received', value: filteredStats.reviewsReceived || filteredStats.totalReviews || 0, icon: ReviewIcon, color: '#06b6d4' },
              { 
                title: 'Avg PR Duration', 
                value: getAveragePRDuration(pullRequests.filter(pr => selectedPRs.has(pr.id))), 
                subValue: getAverageMergedPRDuration(pullRequests.filter(pr => selectedPRs.has(pr.id))),
                icon: TimeIcon, 
                color: '#8b5cf6' 
              }
            ].map((stat, index) => (
              <Box key={index} sx={{ flex: { xs: '1 1 45%', sm: '1 1 30%', md: '1 1 9.5%' }, minWidth: { xs: '120px', md: '95px' } }}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ textAlign: 'center', p: 1.5 }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        bgcolor: stat.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 1.5
                      }}
                    >
                      <stat.icon sx={{ color: 'white', fontSize: 20 }} />
                    </Box>
                    <Typography variant="h6" fontWeight="bold" sx={{ color: stat.color }}>
                      {stat.value?.toLocaleString() || 0}
                    </Typography>
                    {stat.subValue && (
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.5 }}>
                        {stat.subValue} (merged only)
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {stat.title}
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Box>

          {/* Pull Requests Section */}
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Typography variant="h6">
                  Pull Requests ({pullRequests.length})
                </Typography>
                
                <Stack direction="row" spacing={1}>
                  <Chip 
                    label={`${selectedPRs.size} selected`}
                    color={selectedPRs.size > 0 ? "primary" : "default"}
                    size="small"
                  />
                  <Button
                    size="small"
                    startIcon={<SelectAllIcon />}
                    onClick={selectAllPRs}
                  >
                    Select All
                  </Button>
                  <Button
                    size="small"
                    startIcon={<DeselectAllIcon />}
                    onClick={deselectAllPRs}
                  >
                    Deselect All
                  </Button>
                </Stack>
              </Stack>

              {pullRequests.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            indeterminate={selectedPRs.size > 0 && selectedPRs.size < pullRequests.length}
                            checked={pullRequests.length > 0 && selectedPRs.size === pullRequests.length}
                            onChange={() => {
                              if (selectedPRs.size === pullRequests.length) {
                                deselectAllPRs();
                              } else {
                                selectAllPRs();
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>PR #</TableCell>
                        <TableCell>Title</TableCell>
                        <TableCell align="center">Status</TableCell>
                        <TableCell align="center">Lines +/-</TableCell>
                        <TableCell align="center">
                          <Tooltip
                            title="Formal Review Submissions: Each review represents a formal assessment"
                            arrow
                            placement="top"
                          >
                            <Box display="flex" alignItems="center" justifyContent="center" gap={0.5} sx={{ cursor: 'help' }}>
                              <ReviewIcon fontSize="small" />
                              Reviews
                            </Box>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip
                            title="Discussion Activity: PR comments + Review discussions"
                            arrow
                            placement="top"
                          >
                            <Box display="flex" alignItems="center" justifyContent="center" gap={0.5} sx={{ cursor: 'help' }}>
                              <CommentIcon fontSize="small" />
                              Discussion
                            </Box>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center">
                          <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                            <CommitIcon fontSize="small" />
                            Commits
                          </Box>
                        </TableCell>
                        <TableCell>Repository</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell>Closed/Merged</TableCell>
                        <TableCell align="center">Duration</TableCell>
                        <TableCell align="center">Link</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pullRequests.map((pr) => (
                        <TableRow key={pr.id} hover>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedPRs.has(pr.id)}
                              onChange={() => togglePRSelection(pr.id)}
                            />
                          </TableCell>
                          <TableCell>#{pr.number}</TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                              {pr.title || 'Untitled'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip 
                              label={getPRStateText(pr.state, pr.merged)}
                              color={getPRStateColor(pr.state, pr.merged)}
                              size="small"
                              variant="filled"
                            />
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Typography variant="body2" color="success.main">
                                +{pr.additions || 0}
                              </Typography>
                              <Typography variant="body2" color="error.main">
                                -{pr.deletions || 0}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={pr.reviews?.totalCount || 0}
                              size="small"
                              color={(pr.reviews?.totalCount || 0) > 0 ? "primary" : "default"}
                              variant={(pr.reviews?.totalCount || 0) > 0 ? "filled" : "outlined"}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={getTotalComments(pr)}
                              size="small"
                              color={getTotalComments(pr) > 0 ? "secondary" : "default"}
                              variant={getTotalComments(pr) > 0 ? "filled" : "outlined"}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={pr.commits?.totalCount || pr.commitsCount || 0}
                              size="small"
                              color={(pr.commits?.totalCount || pr.commitsCount || 0) > 0 ? "warning" : "default"}
                              variant={(pr.commits?.totalCount || pr.commitsCount || 0) > 0 ? "filled" : "outlined"}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={pr.repository?.name || 'Unknown'} 
                              size="small" 
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>{formatDateTime(pr.createdAt)}</TableCell>
                          <TableCell>
                            {pr.mergedAt ? formatDateTime(pr.mergedAt) :
                             pr.closedAt ? formatDateTime(pr.closedAt) : '-'}
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={getPRDuration(pr)}
                              size="small"
                              color={getPRDuration(pr) === 'Open' ? 'primary' : 'default'}
                              variant={getPRDuration(pr) === 'Open' ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <IconButton
                              size="small"
                              href={pr.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <LinkIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No pull requests found for the selected date range.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
  );
};

export default ContributorPage;
