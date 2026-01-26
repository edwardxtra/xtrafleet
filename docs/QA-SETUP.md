# QA Environment Setup Guide

This guide walks you through setting up a separate QA environment for testing changes before deploying to production.

## Overview

- **Production**: `xtrafleet.com` (Firebase project: `studio-5112915880-e9ca2`)
- **QA**: `your-qa-project.web.app` (New Firebase project you'll create)

## Step 1: Create QA Firebase Project (You do this)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project**
3. Name it something like `xtrafleet-qa` or `xtrafleet-staging`
4. Enable Google Analytics (optional for QA)
5. Click **Create project**

### Enable Required Services

In your new QA project, enable:

1. **Authentication**
   - Go to Build > Authentication > Get started
   - Enable Email/Password sign-in method
   - Enable Google sign-in method (if used)

2. **Firestore**
   - Go to Build > Firestore Database > Create database
   - Start in **test mode** for now (we'll copy rules later)
   - Choose `us-central1` region (same as production)

3. **Storage** (if needed)
   - Go to Build > Storage > Get started

4. **App Hosting**
   - Go to Build > App Hosting > Get started
   - Connect your GitHub repository
   - Select the branch you want for QA (e.g., `develop` or `qa`)
   - **Important**: Choose `apphosting.qa.yaml` as the config file

## Step 2: Get QA Project Credentials (You do this)

### Firebase Web App Config

1. Go to Project Settings (gear icon) > General
2. Scroll to "Your apps" and click **Add app** (web icon)
3. Register app name: `xtrafleet-qa-web`
4. Copy the config values:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

### Service Account Key

1. Go to Project Settings > Service accounts
2. Click **Generate new private key**
3. Save the JSON file securely

## Step 3: Update Configuration Files (I can help)

### Update `.firebaserc`

Replace `YOUR_QA_PROJECT_ID` with your actual QA project ID:

```json
{
  "projects": {
    "default": "studio-5112915880-e9ca2",
    "production": "studio-5112915880-e9ca2",
    "qa": "your-actual-qa-project-id"
  }
}
```

### Update `apphosting.qa.yaml`

Replace all placeholder values with your QA project's actual values.

## Step 4: Set Up Secrets in QA Project (You do this)

In Firebase Console for your QA project:

1. Go to Build > App Hosting > your backend > Settings
2. Add these secrets:
   - `FB_PRIVATE_KEY` - From your QA service account JSON
   - `FIREBASE_SERVICE_ACCOUNT` - Full service account JSON
   - `STRIPE_SECRET_KEY` - Your Stripe TEST key (same as local dev)
   - `STRIPE_WEBHOOK_SECRET` - Create new webhook for QA URL
   - `RESEND_API_KEY` - Same key or create separate for QA
   - `UPSTASH_REDIS_REST_URL` - Can share with prod or create new
   - `UPSTASH_REDIS_REST_TOKEN` - Can share with prod or create new

## Step 5: Deploy Firestore Rules (You do this)

Deploy the same Firestore rules to QA:

```bash
# Switch to QA project
firebase use qa

# Deploy rules
firebase deploy --only firestore:rules

# Switch back to production
firebase use production
```

## Step 6: Create Test Data (Optional)

Create a test admin account in your QA environment:

1. Sign up in the QA app
2. Use Firebase Console to set `isAdmin: true` and `adminRole: 'super_admin'` on your user document in `owner_operators` collection

## Workflow

### Testing a New Feature

1. **Develop** on a feature branch
2. **Push** to the QA branch (triggers auto-deploy to QA)
3. **Test** at your QA URL
4. **Merge** to main when satisfied (triggers auto-deploy to production)

### Quick Commands

```bash
# Switch to QA project for Firestore rules deployment
firebase use qa
firebase deploy --only firestore:rules

# Switch back to production
firebase use production
firebase deploy --only firestore:rules

# View current project
firebase use
```

## Cost Estimate

QA environment with minimal usage:
- Firebase: Free tier covers QA usage
- Stripe: Test mode is free
- Upstash: Free tier or shared with prod
- **Total: ~$0-10/month**

## Troubleshooting

### "Permission denied" errors
- Check Firestore rules are deployed to QA project
- Verify the user has correct roles in QA database

### App not updating after push
- Check App Hosting build status in Firebase Console
- Verify the correct branch is connected

### Secrets not working
- Redeploy the backend after adding secrets
- Check secret names match exactly in `apphosting.qa.yaml`
