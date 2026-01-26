# XtraFleet Development Guide

## Project Overview

XtraFleet is a fleet management platform built with Next.js, Firebase, and Stripe. It connects owner-operators for load matching and temporary lease agreements (TLAs).

## Environments

| Environment | Firebase Project | URL | Branch |
|-------------|------------------|-----|--------|
| Production | `studio-5112915880-e9ca2` | https://xtrafleet.com | `main` |
| QA | `xtrafleet-qa` | https://xtrafleet-qa--xtrafleet-qa.us-central1.hosted.app | `qa` |

## Development Workflow

**IMPORTANT: Never push directly to `main`. All changes must be tested in QA first.**

### For Bug Fixes & Features

```
1. Create feature branch from main
   git checkout main
   git pull
   git checkout -b feature/my-feature

2. Develop & test locally
   npm run dev

3. Push to feature branch
   git push -u origin feature/my-feature

4. Create PR to `qa` branch with description → Merge
   (Auto-deploys to QA environment)

5. Test on QA site
   https://xtrafleet-qa--xtrafleet-qa.us-central1.hosted.app

6. If tests pass → Create PR from `qa` to `main` with description → Merge
   (Auto-deploys to Production)
```

### PR Description Template

Every PR must include a description with:

```markdown
## Summary
- Brief description of what changed (2-3 bullet points)

## Changes
- List of specific changes made
- Files/components affected

## Setup Required (if any)
- Environment variables to add
- Secrets to configure
- Database migrations

## Test Plan
- [ ] Steps to verify the change works
- [ ] Edge cases to test
```

### Visual Flow

```
feature/xyz → qa (test here) → main (production)
```

## Firestore Rules Deployment

When updating `firestore.rules`:

```bash
# 1. Deploy to QA first and test
firebase use xtrafleet-qa
firebase deploy --only firestore:rules

# 2. Test in QA environment

# 3. After testing, deploy to Production
firebase use production
firebase deploy --only firestore:rules
```

## Key Files

- `apphosting.yaml` - Production environment config
- `apphosting.qa.yaml` - QA environment config
- `.firebaserc` - Firebase project aliases
- `firestore.rules` - Database security rules

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Hosting**: Firebase App Hosting
- **Payments**: Stripe
- **Email**: Resend
- **Rate Limiting**: Upstash Redis

## Testing Checklist

Before merging to `main`, verify in QA:
- [ ] Feature works as expected
- [ ] No console errors
- [ ] Admin functions work (if applicable)
- [ ] Firestore rules allow/deny appropriately
- [ ] Mobile responsive (if UI changes)

## Common Commands

```bash
# Local development
npm run dev

# Switch Firebase projects
firebase use qa           # Switch to QA
firebase use production   # Switch to Production
firebase use              # Show current project

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Build for production
npm run build
```

## Admin Roles

- `super_admin` - Full access including delete and billing
- `admin` - Standard admin access
- `support` - Limited support access

## Do NOT

- Push directly to `main` branch
- Deploy Firestore rules to production without testing in QA
- Commit sensitive data (API keys, secrets)
- Skip QA testing for "small" changes
