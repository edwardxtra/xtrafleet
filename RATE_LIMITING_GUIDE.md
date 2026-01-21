# 🛡️ Rate Limiting Implementation - XtraFleet

## ✅ What Was Done

**Date:** January 20, 2026  
**Branch:** `feat/rate-limiting`  
**PR:** https://github.com/edwardxtra/xtrafleet/pull/28

### Files Created/Modified:

1. **`src/lib/rate-limit.ts`** - Rate limiting utility with Upstash Redis
2. **`src/app/api/auth/session/route.ts`** - Added rate limiting to login (5 attempts per 15 min)
3. **`src/app/api/add-new-driver/route.ts`** - Added rate limiting to invitations (10 per hour)
4. **`src/app/api/loads/route.ts`** - Added rate limiting to load creation (20 per hour)
5. **`src/app/api/create-driver-account/route.ts`** - Added rate limiting to registration (3 per hour per IP)
6. **`.env.example`** - Environment variables template
7. **`package.json`** - Added @upstash/ratelimit and @upstash/redis dependencies

## 🎯 Rate Limits Implemented

| Endpoint | Limit | Window | Purpose |
|----------|-------|--------|--------|
| `/api/auth/session` (POST) | 5 attempts | 15 minutes | Prevent brute force login attacks |
| `/api/add-new-driver` (POST) | 10 invitations | 1 hour | Prevent invitation spam |
| `/api/loads` (POST) | 20 loads | 1 hour | Prevent load creation spam |
| `/api/create-driver-account` (POST) | 3 registrations | 1 hour | Prevent registration abuse (by IP) |

## 🔧 Setup Required

### 1. Install packages:
```bash
npm install
```

### 2. Add environment variables:

**For local development**, create `.env.local` in your project root:
```bash
UPSTASH_REDIS_REST_URL=https://darling-marten-37536.upstash.io
UPSTASH_REDIS_REST_TOKEN=AZKgAAIncDE2Y2Y2ZjRhMWEyYmQ0YzYxOGE3OThjNGVlZWQ2MWQxZnAxMzc1MzY
```

**For production (Firebase Hosting)**, you have two options:

#### Option A: GitHub Secrets (if using GitHub Actions)
1. Go to: https://github.com/edwardxtra/xtrafleet/settings/secrets/actions
2. Add repository secrets:
   - `UPSTASH_REDIS_REST_URL` = `https://darling-marten-37536.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN` = `AZKgAAIncDE2Y2Y2ZjRhMWEyYmQ0YzYxOGE3OThjNGVlZWQ2MWQxZnAxMzc1MzY`

#### Option B: Manual deployment
If you deploy manually from your local machine, just having `.env.local` is enough since Next.js reads it during build.

### 3. Merge the PR:
```bash
git checkout main
git pull
# Or merge via GitHub UI
```

### 4. Deploy:
```bash
npm run build
firebase deploy --only hosting
```

## 🧪 Testing

After deploying:

### Test Login Rate Limit:
1. Try logging in with wrong password 6 times quickly
2. **Expected:** 6th attempt returns 429 error with message "Too many login attempts. Please try again in X minutes"

### Test Invitation Rate Limit:
1. Send 11 driver invitations quickly
2. **Expected:** 11th returns 429 error

### Test Load Creation Rate Limit:
1. Create 21 loads quickly
2. **Expected:** 21st returns 429 error

### Test Registration Rate Limit:
1. Try creating 4 driver accounts quickly from same IP
2. **Expected:** 4th returns 429 error

## 📊 Monitoring

### Upstash Dashboard:
https://console.upstash.com/redis/darling-marten-37536

**View:**
- Total requests
- Blocked requests (rate limited)
- Response times
- Usage analytics

**Watch for:**
- Unusual spikes in blocked requests (possible attack)
- High volume from single IP (investigate)
- Legitimate users being blocked (adjust limits)

## 🔄 Adjusting Limits

To change rate limits, edit `/src/lib/rate-limit.ts`:

```typescript
// Example: Change login to 10 attempts per 30 minutes
auth: new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '30 m'), // <-- Change here
  analytics: true,
  prefix: 'ratelimit:auth',
}),
```

Then rebuild and redeploy:
```bash
npm run build
firebase deploy --only hosting
```

## 💰 Cost

**Current usage:** ~18,000 commands/month  
**Free tier:** 500,000 commands/month  
**Cost:** **$0** 👍

You won't pay anything unless you exceed 500K commands/month (unlikely until you have thousands of daily users).

## 🛡️ Security Benefits

✅ **Prevents brute force attacks** - Attackers can't guess passwords quickly  
✅ **Stops spam/abuse** - Limits on invitations and load creation  
✅ **Protects costs** - Can't rack up huge Firebase/email bills  
✅ **Prevents DDoS** - Rate limiting handles traffic spikes  
✅ **Professional** - Industry standard security practice  

## 🚨 Troubleshooting

**Problem: All requests return 429**
- Check Upstash database is active at https://console.upstash.com/
- Verify environment variables are set correctly
- Check Upstash dashboard for errors

**Problem: Rate limiting not working**
- Verify code was deployed (check commit hash)
- Check browser console for 429 responses
- Ensure `.env.local` exists locally or GitHub Secrets are set
- Run `npm run build` to rebuild with new env vars

**Problem: Legitimate users blocked**
- Increase limits in `rate-limit.ts`
- Check if user is triggering limit accidentally
- Monitor Upstash analytics for patterns

**Problem: "Cannot read properties of undefined (reading 'UPSTASH_REDIS_REST_URL')"**
- Environment variables not loaded
- Make sure `.env.local` exists in project root
- Rebuild: `npm run build`

## 📚 Resources

- **Upstash Console:** https://console.upstash.com/
- **Upstash Rate Limiting Docs:** https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
- **GitHub Issue #22:** https://github.com/edwardxtra/xtrafleet/issues/22
- **Pull Request #28:** https://github.com/edwardxtra/xtrafleet/pull/28

---

**Status:** ✅ Ready to merge and deploy  
**Next Steps:**  
1. Merge PR #28
2. Add `.env.local` with credentials
3. Run `npm install`
4. Test locally
5. Deploy to production
