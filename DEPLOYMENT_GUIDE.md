# GitHub Team Insights - Deployment Guide

## 🚨 Environment Configuration Issues

Your current `.env` file has several placeholder values that need to be updated for the application to work properly:

### Issues Found:
1. **GITHUB_CLIENT_ID**: Still set to `your_github_client_id` (needs real GitHub OAuth App Client ID)
2. **GITHUB_CLIENT_SECRET**: Still set to `your_github_client_secret` (needs real GitHub OAuth App Client Secret)
3. **GITHUB_ORGANIZATION**: Still set to `your_organization_name` (needs your actual GitHub organization name)
4. **JWT_SECRET**: Still set to `your_jwt_secret_key` (needs a secure random string)

✅ **GITHUB_PERSONAL_ACCESS_TOKEN**: Appears to be correctly configured

## 📋 Complete Shutdown & Startup Instructions

### 🛑 How to Stop Everything

#### Step 1: Stop the Application Servers
1. **Stop Backend Server (Terminal 2)**:
   - Go to the terminal running the backend server
   - Press `Ctrl + C` to stop the Node.js server
   - Wait for the message "Graceful shutdown completed"

2. **Stop Frontend Server (Terminal 3)**:
   - Go to the terminal running the React development server
   - Press `Ctrl + C` to stop the React server
   - Wait for the process to terminate

#### Step 2: Stop Docker Containers
```bash
# Navigate to project root
cd c:/Users/IzTech-OTbaileh/Desktop/kilo

# Stop and remove containers
docker-compose down

# Optional: Remove volumes (this will delete database data)
docker-compose down -v
```

#### Step 3: Verify Everything is Stopped
```bash
# Check if any containers are still running
docker ps

# Check if ports are free
netstat -an | findstr :5000
netstat -an | findstr :3000
netstat -an | findstr :5432
netstat -an | findstr :6378
```

### 🚀 How to Start Everything

#### Step 1: Start Docker Services
```bash
# Navigate to project root
cd c:/Users/IzTech-OTbaileh/Desktop/kilo

# Start PostgreSQL and Redis containers
docker-compose up -d

# Verify containers are running
docker ps
```

#### Step 2: Verify Database is Ready
```bash
# Test database connection
docker exec github-insights-db pg_isready -U postgres -d github_insights

# Should return: "/var/run/postgresql:5432 - accepting connections"
```

#### Step 3: Start Backend Server
```bash
# Open new terminal and navigate to server directory
cd c:/Users/IzTech-OTbaileh/Desktop/kilo/server

# Start the backend server
npm start

# Look for these success messages:
# - "Database connection established successfully"
# - "Server running on port 5000 in development mode"
# - "Scheduled sync service started"
```

#### Step 4: Start Frontend Server
```bash
# Open another new terminal and navigate to client directory
cd c:/Users/IzTech-OTbaileh/Desktop/kilo/client

# Start the React development server
npm start

# Browser should automatically open to http://localhost:3000
```

## 🔧 Required Configuration Updates

Before the application will work properly, you need to:

### 1. Create GitHub OAuth App
1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: `GitHub Team Insights`
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:5000/api/auth/github/callback`
4. Click "Register application"
5. Copy the **Client ID** and **Client Secret**

### 2. Update .env File
Replace these values in `server/.env`:
```env
GITHUB_CLIENT_ID=your_actual_client_id_from_github_oauth_app
GITHUB_CLIENT_SECRET=your_actual_client_secret_from_github_oauth_app
GITHUB_ORGANIZATION=your_actual_github_organization_name
JWT_SECRET=a_long_random_secure_string_for_jwt_signing
```

### 3. Generate JWT Secret
```bash
# You can generate a secure JWT secret using:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 📊 Verification Steps

After starting everything:

1. **Check Backend Health**:
   ```bash
   curl http://localhost:5000/health
   ```

2. **Check Frontend**:
   - Open http://localhost:3000
   - Should see GitHub Team Insights login page

3. **Check Database**:
   ```bash
   docker exec github-insights-db psql -U postgres -d github_insights -c "\dt"
   ```

4. **Check Logs**:
   - Backend logs: `server/logs/combined.log`
   - Terminal output for real-time logs

## ⚠️ Important Notes

- **Database Data**: Persists between restarts unless you use `docker-compose down -v`
- **Environment Variables**: Backend server must be restarted after .env changes
- **Port Conflicts**: Make sure ports 3000, 5000, 5432, and 6378 are available
- **GitHub Rate Limits**: The Personal Access Token should have appropriate permissions for your organization

## 🔄 Quick Restart Commands

```bash
# Quick restart everything (from project root)
docker-compose restart
cd server && npm start &
cd ../client && npm start
```

## 🔍 Troubleshooting

### Common Issues:

1. **Port Already in Use**:
   ```bash
   # Find process using port
   netstat -ano | findstr :5000
   # Kill process by PID
   taskkill /PID <PID> /F
   ```

2. **Database Connection Failed**:
   ```bash
   # Restart Docker containers
   docker-compose restart
   # Check container logs
   docker logs github-insights-db
   ```

3. **GitHub OAuth Not Working**:
   - Verify Client ID and Secret are correct
   - Check callback URL matches exactly
   - Ensure organization name is correct

4. **Sync Service Errors**:
   - Check GitHub Personal Access Token permissions
   - Verify organization name in .env
   - Check rate limiting in GitHub API

## 📱 Application URLs

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **Health Check**: http://localhost:5000/health
- **API Status**: http://localhost:5000/api/status

## 🎯 Next Steps After Configuration

Once properly configured, the application will:
1. Authenticate users via GitHub OAuth
2. Sync organization data automatically
3. Display team analytics and insights
4. Provide real-time updates via WebSocket
5. Generate comprehensive reports and metrics