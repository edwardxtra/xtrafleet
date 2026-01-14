# 🎯 Guided Tour Troubleshooting

## Problem
The guided tour isn't showing up on the dashboard even though it's implemented.

## Most Likely Cause
The tour was already completed or skipped, and localStorage has cached this preference.

## Quick Fix #1: Clear localStorage (Recommended)

### Option A: Browser DevTools
1. Open your dashboard at https://xtrafleet.com/dashboard
2. Press `F12` to open DevTools
3. Go to the **Application** tab (Chrome) or **Storage** tab (Firefox)
4. Click **Local Storage** → `https://xtrafleet.com`
5. Find and delete the key: `tour_dashboard-initial`
6. Refresh the page (`F5`)
7. The tour should start automatically! ✨

### Option B: Console Command (Fastest)
1. Open your dashboard
2. Press `F12` and go to **Console** tab
3. Paste this command:
```javascript
localStorage.removeItem('tour_dashboard-initial'); location.reload();
```
4. Hit Enter
5. Tour starts automatically! ✨

## Quick Fix #2: Incognito/Private Mode

1. Open a new **Incognito Window** (Ctrl+Shift+N / Cmd+Shift+N)
2. Go to https://xtrafleet.com/dashboard
3. Log in
4. Tour will start fresh since there's no localStorage! ✨

## Quick Fix #3: Force Restart Tour

Add this to your browser console:
```javascript
// Clear ALL tour data
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('tour_')) {
    localStorage.removeItem(key);
  }
});
location.reload();
```

## Verify It's Working

After clearing localStorage:
1. You should see a dark overlay on the dashboard
2. A white card should appear near the onboarding checklist
3. The card should say "Welcome to XtraFleet! 👋"
4. You can click "Next" to progress or "Skip Tour" to dismiss

## Technical Details

**How the tour works:**
- Uses `localStorage.getItem('tour_dashboard-initial')` to check if tour was seen
- If not seen AND `autoStart={true}`, tour starts after 1 second
- Once you click "Finish" or "Skip Tour", it saves to localStorage
- On subsequent visits, tour won't show again

**Tour steps:**
1. Onboarding Checklist
2. Quick Actions
3. Sidebar - Drivers
4. Sidebar - Loads
5. Sidebar - Matches
6. Stats Cards

## Still Not Working?

### Check #1: Is the tour component rendering?
Open DevTools Console and type:
```javascript
document.querySelector('[data-tour="onboarding-checklist"]')
```
If it returns `null`, the tour target elements aren't on the page.

### Check #2: Console errors?
Look for any JavaScript errors in the Console tab that might prevent the tour from starting.

### Check #3: Are you on the dashboard?
The tour only works on `/dashboard`, not on `/dashboard/drivers` or other subpages.

## For Developers

### Manually trigger tour from code:
```javascript
// In the dashboard page component
const [forceTour, setForceTour] = useState(false);

// Then pass to GuidedTour
<GuidedTour 
  steps={dashboardTourSteps}
  tourKey="dashboard-initial"
  autoStart={true || forceTour}  // Force start
/>
```

### Add a "Restart Tour" button:
```tsx
<Button onClick={() => {
  localStorage.removeItem('tour_dashboard-initial');
  window.location.reload();
}}>
  Restart Tour
</Button>
```

### Debug mode:
```javascript
// Check tour status
console.log('Tour status:', localStorage.getItem('tour_dashboard-initial'));

// Clear and restart
localStorage.removeItem('tour_dashboard-initial');
console.log('Tour cleared, refreshing...');
location.reload();
```

---

## Summary

**99% of the time**, the issue is just localStorage caching. Use one of these:

1. **Fastest**: Console command → `localStorage.removeItem('tour_dashboard-initial'); location.reload();`
2. **Easiest**: Incognito mode
3. **Most thorough**: DevTools → Application → Local Storage → Delete key

The tour is working correctly - it just needs localStorage to be cleared! ✨
