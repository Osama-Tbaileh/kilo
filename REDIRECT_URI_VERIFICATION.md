# 🔍 Redirect URI Verification Guide

## 🚨 Your Observation is Correct!

You're right to question the redirect showing `http://localhost:5000` instead of the full callback URL. 

## 📋 What You Need to Verify

### 1. Check Your GitHub OAuth App Settings
1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Find your "Git Insights OAuth" app
3. **Verify the Authorization callback URL is EXACTLY**:
   ```
   http://localhost:5000/api/auth/callback
   ```
   (Not just `http://localhost:5000`)

### 2. GitHub Display vs Actual Configuration
- **What GitHub shows**: `http://localhost:5000` (truncated display)
- **What should be configured**: `http://localhost:5000/api/auth/callback` (full path)
- **GitHub often truncates the display** but uses the full configured URL

## 🔧 I've Added Explicit Configuration

I've added `GITHUB_REDIRECT_URI=http://localhost:5000/api/auth/callback` to your .env file to ensure the application uses the correct full URL.

## 🚀 Next Steps

### 1. Restart Backend Server (Required)
```bash
# In Terminal 2 (backend server)
Ctrl + C
npm start
```

### 2. Double-Check GitHub OAuth App
Make sure your GitHub OAuth App callback URL is:
```
http://localhost:5000/api/auth/callback
```

### 3. Test Authentication
1. Try the OAuth flow again
2. The redirect should now work properly
3. You should be redirected to the dashboard after authorization

## 🎯 Expected Behavior

After clicking "Authorize":
1. GitHub redirects to: `http://localhost:5000/api/auth/callback?code=...&state=...`
2. Backend processes the callback
3. Backend redirects to: `http://localhost:3000?code=...&state=...`
4. Frontend processes the auth code
5. You're redirected to the dashboard

## 🔍 If It Still Shows Wrong Redirect

If GitHub still shows `http://localhost:5000` instead of the full callback URL:

1. **Update your GitHub OAuth App** callback URL to the full path
2. **Wait a few minutes** for GitHub to update
3. **Try the auth flow again**

The key is making sure your GitHub OAuth App has the **full callback URL**, not just the domain!