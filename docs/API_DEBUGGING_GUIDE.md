# API Error Debugging Guide

## 🔍 How to Debug API 500 Errors

When you see "Unexpected end of JSON input" or 500 errors, follow these steps:

---

## **Step 1: Check Firebase App Hosting Logs**

### Access Logs:
1. Go to Firebase Console
2. Navigate to **App Hosting** → Your backend
3. Click **Logs** tab
4. Filter by severity: **Error** and **Warning**

### What to Look For:

#### **A) Missing Environment Variables** 🔴
```
╔══════════════════════════════════════════════════════════════╗
║ CRITICAL ERROR: Firebase Admin SDK Cannot Initialize        ║
╠══════════════════════════════════════════════════════════════╣
║ Missing Required Environment Variables:                      ║
║ FB_PROJECT_ID:    ✗ MISSING                                  ║
║ FB_CLIENT_EMAIL:  ✗ MISSING                                  ║
║ FB_PRIVATE_KEY:   ✗ MISSING                                  ║
╚══════════════════════════════════════════════════════════════╝
```

**FIX:**
1. Go to Firebase Console → App Hosting → Secrets
2. Add secret: `FB_PRIVATE_KEY`
3. Copy private key from service account JSON
4. Redeploy application

---

#### **B) Authentication Failures** ⚠️
```
[AUTH] No ID token found in Authorization header or cookie
```

**FIX:**
- User needs to log out and log back in
- Check if session cookie is being set properly
- Verify `/api/auth/session` route is working

---

#### **C) API Route Errors** 🔴
```
[API /loads POST] Failed to parse request body
[API /loads POST] Validation failed: Origin is required
[API /add-new-driver POST] Invitation already exists
```

**FIX:**
- Check frontend is sending correct data format
- Verify all required fields are present
- Check for typos in field names

---

## **Step 2: Check Browser Console**

### What You'll See:

#### **Before Fix:**
```
POST https://xtrafleet.com/api/loads 500 (Internal Server Error)
Failed to execute 'json' on 'Response': Unexpected end of JSON input
```

#### **After Fix:**
```
POST https://xtrafleet.com/api/loads 500 (Internal Server Error)
{
  "error": "Server configuration error. Please contact support.",
  "timestamp": "2026-01-14T03:30:00.000Z"
}
```

Now you get a **proper error message** instead of empty response!

---

## **Step 3: Common Issues & Fixes**

### **Issue: APIs Work Locally But Fail After Deploy**

**Root Cause:** Environment variables not set in Firebase App Hosting

**Fix:**
1. Check `apphosting.yaml` - are all variables defined?
2. Check Firebase Console → Secrets - are secrets added?
3. Redeploy after adding secrets

---

### **Issue: Random 500 Errors After Some Deployments**

**Root Cause:** Secrets get reset during certain deployments

**Fix:**
1. Always verify secrets after deployment
2. Check logs immediately after deploy
3. Re-add secrets if missing
4. Consider using Firebase CLI to set secrets programmatically

---

### **Issue: "Failed to initialize Firebase Admin SDK"**

**Root Cause:** Invalid private key format or missing newlines

**Fix:**
```yaml
# In apphosting.yaml, ensure:
- variable: FB_PRIVATE_KEY
  secret: FB_PRIVATE_KEY  # This should reference the secret
```

Then in Firebase Console Secrets:
- Add `FB_PRIVATE_KEY`
- Paste entire private key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
- Ensure newlines are preserved

---

## **Step 4: Preventive Measures**

### **Before Every Deployment:**

1. ✅ Check `apphosting.yaml` has all required env vars
2. ✅ Verify secrets are set in Firebase Console
3. ✅ Test API routes in staging first
4. ✅ Check logs immediately after deploy

### **After Every Deployment:**

1. ✅ Check logs for initialization errors
2. ✅ Test one API route (e.g., create a load)
3. ✅ Verify success logs appear
4. ✅ If errors, check env vars first

---

## **Step 5: Log Filtering Guide**

### **Filter by Component:**

```bash
# Firebase Admin initialization
[AUTH]

# API route: Loads
[API /loads]

# API route: Driver invitations
[API /add-new-driver]

# Error handler
[API ERROR]
```

### **Filter by Severity:**

- **Error** - Critical failures, missing env vars
- **Warning** - Authentication failures, validation errors
- **Info** - Success logs, normal operations

---

## **Step 6: Success Indicators**

### **What You Should See in Logs:**

```
✓ Firebase Admin SDK initialized successfully
[AUTH] ✓ Token verified successfully for user: abc123
[API /loads POST] Request received
[API /loads POST] User authenticated: abc123
[API /loads POST] Request body parsed successfully
[API /loads POST] Creating load for user abc123
[API /loads POST] ✓ Load created successfully: xyz789
```

---

## **Quick Debugging Checklist**

When API fails:

- [ ] Check Firebase App Hosting logs for error box
- [ ] Verify all secrets are set in Firebase Console
- [ ] Check if `FB_PRIVATE_KEY` secret exists
- [ ] Look for `[AUTH]` errors in logs
- [ ] Check browser console for actual error message
- [ ] Try logging out and back in
- [ ] Redeploy if secrets were missing

---

## **Environment Variables Reference**

### **Required for API Routes:**

```yaml
# In apphosting.yaml:
env:
  - variable: FB_PROJECT_ID
    value: your-project-id
  - variable: FB_CLIENT_EMAIL
    value: firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
  - variable: FB_PRIVATE_KEY
    secret: FB_PRIVATE_KEY  # Reference to secret
  - variable: RESEND_API_KEY
    secret: RESEND_API_KEY  # Reference to secret
```

### **How to Get Values:**

1. **FB_PROJECT_ID:** Firebase Console → Project Settings
2. **FB_CLIENT_EMAIL:** Service Account → Generate Key → client_email
3. **FB_PRIVATE_KEY:** Service Account → Generate Key → private_key
4. **RESEND_API_KEY:** Resend.com → API Keys

---

## **Still Having Issues?**

### **Enable Verbose Logging:**

All API routes now include detailed logging. Check logs for:
1. Request received
2. Firebase Admin status
3. User authentication
4. Request parsing
5. Operation success/failure

### **Contact Support:**

When reporting issues, include:
- Screenshot of Firebase logs
- Screenshot of browser console
- Steps to reproduce
- Time of error (helps find in logs)

---

**Remember:** After this fix, you will ALWAYS get a proper JSON error response. No more "Unexpected end of JSON input"!
