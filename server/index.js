require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const logger = require('./utils/logger');
const { sequelize } = require('./models');
const ScheduledSyncService = require('./services/sync/ScheduledSyncService');

// Import routes
const authRoutes = require('./routes/auth-simple');
const teamRoutes = require('./routes/team');
const teamGraphQLRoutes = require('./routes/teamGraphQL');
const repositoryRoutes = require('./routes/repositories');
const repositoriesGraphQLRoutes = require('./routes/repositoriesGraphQL');
const repositoryAnalyticsRoutes = require('./routes/repositoryAnalytics');
const repositoryAnalyticsGraphQLRoutes = require('./routes/repositoryAnalyticsGraphQL_NoDB');
const contributorGraphQLRoutes = require('./routes/contributorGraphQL');
const pullRequestRoutes = require('./routes/pullRequests');
const metricsRoutes = require('./routes/metrics');
const syncRoutes = require('./routes/sync');
const userRoutes = require('./routes/users');
const debugRoutes = require('./routes/debug');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize scheduled sync service
const scheduledSyncService = new ScheduledSyncService();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      process.env.CLIENT_URL
    ].filter(Boolean);
    
    // In development, allow requests without origin (like from Postman) or from localhost
    if (NODE_ENV === 'development' && (!origin || origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      callback(null, true);
    } else if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS rejected origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Request logging middleware
app.use(logger.requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected', // We'll update this based on actual status
      github: 'connected',
      sync: scheduledSyncService.getStatus()
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/team-graphql', teamGraphQLRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/repositories-graphql', repositoriesGraphQLRoutes);
app.use('/api/repository-analytics', repositoryAnalyticsRoutes);
app.use('/api/repository-analytics-graphql', repositoryAnalyticsGraphQLRoutes);
app.use('/api/contributor-analytics-graphql', contributorGraphQLRoutes);
app.use('/api/pull-requests', pullRequestRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/users', userRoutes);
app.use('/api/debug', debugRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  // Join user to their personal room for targeted updates
  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
    logger.info(`User ${userId} joined their room`);
  });
  
  // Join team room for team-wide updates
  socket.on('join-team-room', (teamId) => {
    socket.join(`team-${teamId}`);
    logger.info(`Client joined team room: ${teamId}`);
  });
  
  // Handle sync status requests
  socket.on('get-sync-status', () => {
    const status = scheduledSyncService.getStatus();
    socket.emit('sync-status', status);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io available to routes
app.set('io', io);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  // Don't leak error details in production
  const isDevelopment = NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(isDevelopment && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Stop scheduled sync service
  scheduledSyncService.stop();
  
  // Close database connections
  try {
    await sequelize.close();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database connections:', error);
  }
  
  // Close Socket.IO
  io.close(() => {
    logger.info('Socket.IO server closed');
  });
  
  logger.info('Graceful shutdown completed');
  process.exit(0);
}

// Start server
async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Skip sync since we use migrations
    // Database tables are managed through migrations
    logger.info('Database models ready (using migrations)');
    
    // Start scheduled sync service
    if (process.env.ENABLE_SCHEDULED_SYNC !== 'false') {
      scheduledSyncService.start();
      logger.info('Scheduled sync service started');
    }
    
    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${NODE_ENV} mode`);
      logger.info(`Health check available at http://localhost:${PORT}/health`);
      logger.info(`API documentation available at http://localhost:${PORT}/api/status`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

module.exports = { app, server, io };