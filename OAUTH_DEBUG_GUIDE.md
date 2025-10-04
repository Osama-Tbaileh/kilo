# OAuth Authentication Debug Guide

## 🔍 Current Issue Analysis

Based on your feedback:
1. ✅ "Sign in with GitHub" button works
2. ✅ GitHub authorization page appears
3. ✅ You can authorize the app
4. ❌ After authorization, you get redirected back to login page (stuck in loop)

## 🚨 Root Cause

The issue is likely that your GitHub OAuth App still has placeholder values in the .env file, causing the authentication to fail silently.

## 🔧 Step-by-Step Fix

### Step 1: Check Your GitHub OAuth App Settings

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Find your "GitHub Team Insights" app
3. **Set the Authorization callback URL to**: `http://localhost:5000/api/auth/callback`

### Step 2: Update Your .env File

Your current .env file has these placeholder values that MUST be replaced:

```env
# ❌ THESE ARE PLACEHOLDERS - REPLACE WITH REAL VALUES
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_ORGANIZATION=your_organization_name
JWT_SECRET=your_jwt_secret_key
```

**Replace with real values:**

```env
# ✅ REPLACE WITH YOUR ACTUAL VALUES
GITHUB_CLIENT_ID=your_actual_client_id_from_github_oauth_app
GITHUB_CLIENT_SECRET=your_actual_client_secret_from_github_oauth_app
GITHUB_ORGANIZATION=your_actual_github_organization_name
JWT_SECRET=a_long_random_secure_string
```

### Step 3: Generate JWT Secret

Run this command to generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output and use it as your JWT_SECRET.

### Step 4: Restart Backend Server

After updating .env:
1. Go to Terminal 2 (backend server)
2. Press `Ctrl + C` to stop
3. Run `npm start` to restart

## 🔍 Debug Steps

### Check Backend Logs

When you try to authenticate, watch the backend terminal for these messages:

```
Received OAuth callback with code: abc123...
Redirecting to: http://localhost:3000?code=...&state=...
```

### Check Browser Network Tab

1. Open browser DevTools (F12)
2. Go to Network tab
3. Try authentication
4. Look for these requests:
   - `GET /api/auth/github` (should return 200)
   - `GET /api/auth/callback?code=...` (should redirect)
   - `POST /api/auth/callback` (should return user data)

### Check Browser Console

Look for JavaScript errors in the browser console during authentication.

## 🎯 Expected Authentication Flow

1. **Click "Sign in with GitHub"**
   - Frontend calls: `GET /api/auth/github`
   - Backend returns: `{ authUrl: "https://github.com/login/oauth/authorize?..." }`

2. **Redirect to GitHub**
   - User authorizes the application

3. **GitHub redirects back**
   - GitHub calls: `GET /api/auth/callback?code=abc123&state=xyz`
   - Backend redirects to: `http://localhost:3000?code=abc123&state=xyz`

4. **Frontend processes callback**
   - Frontend calls: `POST /api/auth/callback` with code and state
   - Backend returns: `{ token: "...", user: {...} }`

5. **Success**
   - Frontend stores token and redirects to dashboard

## 🚨 Common Issues & Solutions

### Issue 1: "Invalid client_id"
- **Cause**: GITHUB_CLIENT_ID is wrong or still placeholder
- **Fix**: Update with real Client ID from GitHub OAuth App

### Issue 2: "Invalid client_secret"
- **Cause**: GITHUB_CLIENT_SECRET is wrong or still placeholder
- **Fix**: Update with real Client Secret from GitHub OAuth App

### Issue 3: "Organization membership required"
- **Cause**: GITHUB_ORGANIZATION is wrong or user not in org
- **Fix**: Update with correct org name or add user to org

### Issue 4: "JWT malformed"
- **Cause**: JWT_SECRET is still placeholder
- **Fix**: Generate and set a real JWT secret

## 🔄 Quick Test Commands

```bash
# Test backend health
curl http://localhost:5000/health

# Test auth endpoint
curl http://localhost:5000/api/auth/github

# Check if environment variables are loaded
# (Run this in server directory)
node -e "require('dotenv').config(); console.log('CLIENT_ID:', process.env.GITHUB_CLIENT_ID?.substring(0,10) + '...');"
```

## 📋 Checklist

- [ ] GitHub OAuth App callback URL: `http://localhost:5000/api/auth/callback`
- [ ] GITHUB_CLIENT_ID: Real value from GitHub OAuth App
- [ ] GITHUB_CLIENT_SECRET: Real value from GitHub OAuth App  
- [ ] GITHUB_ORGANIZATION: Your actual GitHub organization name
- [ ] JWT_SECRET: Generated secure random string
- [ ] Backend server restarted after .env changes
- [ ] No JavaScript errors in browser console
- [ ] Backend logs show successful OAuth flow

## 🎯 Next Steps

1. **Update your .env file** with real values
2. **Restart the backend server**
3. **Test the authentication flow**
4. **Check the debug logs** if it still doesn't work

The authentication loop issue is almost certainly caused by the placeholder values in your .env file!