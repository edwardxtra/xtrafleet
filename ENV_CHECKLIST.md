# Environment Checklist

## Before Deploying to Production

### 1. Environment Variables
Ensure these are set in both `.env` (local) and Firebase:

| Variable | Local (.env) | Production (apphosting.yaml) |
|----------|--------------|------------------------------|
| `FB_PROJECT_ID` | ✓ | ✓ (secret) |
| `FB_CLIENT_EMAIL` | ✓ | ✓ (secret) |
| `FB_PRIVATE_KEY` | ✓ | ✓ (secret) |
| `RESEND_API_KEY` | ✓ | ✓ (secret) |
| `NEXT_PUBLIC_APP_URL` | ✓ | ✓ (value: https://xtrafleet.com) |

### 2. Firestore Indexes
If you add new queries with `where()` + `orderBy()`, you need indexes.

Check: https://console.firebase.google.com/project/studio-5112915880-e9ca2/firestore/indexes

### 3. Authentication
- API routes must use `Authorization: Bearer ${token}` header
- NOT cookies (they don't work with Firebase Hosting + Cloud Run)
- Client components must call `user.getIdToken()` before API calls

### 4. Common Issues

| Issue | Symptom | Fix |
|-------|---------|-----|
| Missing `await` | "Firebase app does not exist" | Add `await initializeFirebaseAdmin()` |
| Template literal syntax | 500 errors | Use `collection('path/' + var)` not `` collection`path/${var}` `` |
| Missing index | "FAILED_PRECONDITION" | Create index in Firebase Console |
| Cookie auth | "Unauthorized" in prod only | Use Bearer token auth |

### 5. Pre-Deploy Commands
```bash
# Full check + deploy
npm run deploy

# Quick deploy (skip checks)
npm run deploy:hosting
```
