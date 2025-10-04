# GitHub Configuration Setup Guide

## 🎯 Quick Answer: What You Need

**MINIMUM REQUIRED** to get the app working:
1. **GitHub OAuth App** (CLIENT_ID + CLIENT_SECRET)
2. **Personal Access Token** 
3. **Redirect URI** (already set correctly)

**OPTIONAL**:
- GITHUB_ORGANIZATION (only if you want to limit to specific org)

## 📋 Detailed Explanation

### 1. **GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET** 
**Purpose**: OAuth App credentials for user authentication
**Required**: ✅ **YES - BOTH REQUIRED**

#### What is it?
- These are credentials for a GitHub OAuth App that allows users to log into your application
- When users click "Login with GitHub", they're redirected to GitHub, then back to your app

#### How to get them:
1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: "GitHub Team Insights" 
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:5000/api/auth/github/callback`
4. Click "Register application"
5. Copy the **Client ID** and **Client Secret**

#### Organization Access:
- **For Personal Repos**: OAuth app can access your personal repositories
- **For Organization Repos**: The OAuth app needs to be approved by the organization
- **Recommendation**: Start with personal account, then request org access if needed

---

### 2. **GITHUB_PERSONAL_ACCESS_TOKEN**
**Purpose**: Server-side API access for data collection
**Required**: ✅ **YES**

#### What is it?
- A token that allows the server to make API calls to GitHub on behalf of a user
- Used for syncing repository data, commits, PRs, etc.

#### How to get it:
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Set expiration (recommend "No expiration" for development)
4. Select these scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `read:org` (Read org and team membership)
   - ✅ `read:user` (Read user profile data)
   - ✅ `user:email` (Access user email addresses)

#### Organization Access:
- **For Personal Repos**: Token automatically has access to your repos
- **For Organization Repos**: You may need to authorize the token for the organization
- **SSO Organizations**: May require additional SSO authorization

---

### 3. **GITHUB_REDIRECT_URI**
**Purpose**: OAuth callback URL
**Required**: ✅ **YES** 
**Current Value**: `http://localhost:5000/api/auth/github/callback` ✅ **CORRECT**

#### What is it?
- The URL GitHub redirects users to after they authorize your app
- Must match exactly what you set in your OAuth App settings

---

### 4. **GITHUB_ORGANIZATION** 
**Purpose**: Limit data collection to specific organization
**Required**: ❌ **OPTIONAL**
**Current Value**: `Honololo2000`

#### What is it?
- If set, the app will only sync repositories from this organization
- If empty/not set, it will sync all repositories the user has access to

#### When to use:
- ✅ **Use it** if you want to analyze a specific organization's repositories
- ❌ **Leave empty** if you want to analyze all repositories (personal + all orgs)

---

## 🚀 Setup Steps for Your App

### Option 1: Personal Account Only (Easiest)
```env
GITHUB_CLIENT_ID=your_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_oauth_app_client_secret  
GITHUB_PERSONAL_ACCESS_TOKEN=your_personal_token
GITHUB_ORGANIZATION=                    # Leave empty
GITHUB_REDIRECT_URI=http://localhost:5000/api/auth/github/callback
```

### Option 2: Specific Organization
```env
GITHUB_CLIENT_ID=your_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_oauth_app_client_secret
GITHUB_PERSONAL_ACCESS_TOKEN=your_personal_token
GITHUB_ORGANIZATION=Honololo2000        # Your org name
GITHUB_REDIRECT_URI=http://localhost:5000/api/auth/github/callback
```

## 🔐 Security & Permissions

### OAuth App Permissions
The OAuth app will request these permissions from users:
- Read access to user profile
- Read access to repositories
- Read access to organization membership (if applicable)

### Personal Access Token Permissions
Your token needs these scopes:
- `repo` - Access repositories
- `read:org` - Read organization data  
- `read:user` - Read user profiles
- `user:email` - Access email addresses

## 🎯 Current Status Check

Looking at your current `.env` file:

✅ **GITHUB_CLIENT_ID**: Set (Ov23liHGBmsXSAhcFUU)
✅ **GITHUB_CLIENT_SECRET**: Set (79b56270f6fcec88be311acdaac8a9c79050256)  
✅ **GITHUB_PERSONAL_ACCESS_TOKEN**: Set (github_pat_11BWOMVLA0...)
✅ **GITHUB_ORGANIZATION**: Set (Honololo2000)
✅ **GITHUB_REDIRECT_URI**: Set correctly

**Your configuration looks complete!** The app should work with your current settings.

## 🔧 Troubleshooting

### If OAuth login fails:
1. Verify the OAuth App callback URL matches `GITHUB_REDIRECT_URI`
2. Check if the OAuth App is approved for your organization
3. Ensure CLIENT_ID and CLIENT_SECRET are correct

### If data sync fails:
1. Verify Personal Access Token has correct scopes
2. Check if token is authorized for the organization (if using GITHUB_ORGANIZATION)
3. Ensure the organization name is spelled correctly

### If you get "Not Found" errors:
1. Make sure your Personal Access Token has access to the repositories
2. Check if the organization exists and you're a member
3. Verify repository permissions

## 📝 Summary

**Both OAuth App AND Personal Access Token are required:**
- **OAuth App** (CLIENT_ID + CLIENT_SECRET): For user login
- **Personal Access Token**: For server-side data collection
- **They serve different purposes and both are needed**

Your current configuration should work! Try running the app and see if you can log in and sync data.