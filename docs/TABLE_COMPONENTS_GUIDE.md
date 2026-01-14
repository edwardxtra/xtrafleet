# 🎨 Table Components - Quick Implementation Guide

## Overview
We created reusable table components to make tables look professional and consistent across the platform.

## Components Available

### 1. TableAvatar
Shows user avatars with names and optional subtitles.

```tsx
<TableAvatar 
  name="John Smith"
  subtitle="Miami, FL → New York, NY"  // Optional
/>
```

**Renders:**
- Circular avatar with initials
- Name in bold
- Subtitle in smaller gray text

---

### 2. TableStatusBadge
Colored badges for status indicators.

```tsx
<TableStatusBadge status="pending" />
<TableStatusBadge status="accepted" />
<TableStatusBadge status="completed" />
<TableStatusBadge status="rejected" />
```

**Status Colors:**
- `pending` → Yellow
- `accepted` → Blue
- `in_progress` → Purple
- `completed` → Green
- `rejected` → Red
- `tla_pending` → Orange
- `tla_signed` → Green

---

### 3. TableCurrency
Formatted currency display.

```tsx
<TableCurrency amount={1234.56} />
// Renders: $1,234.56
```

**Features:**
- Automatic thousand separators
- 2 decimal places
- $ prefix

---

### 4. TableDate
Relative date display with tooltip.

```tsx
<TableDate date="2025-01-10T15:30:00Z" />
// Renders: "4 days ago"
// Tooltip shows: "Jan 10, 2025 3:30 PM"
```

**Features:**
- Relative time (2 hours ago, 3 days ago)
- Hover tooltip with full date/time
- Handles both string and Date objects

---

## Where We've Already Used Them

### ✅ Dashboard (src/app/dashboard/page.tsx)
```tsx
<TableAvatar 
  name={match.driverSnapshot.name}
  subtitle={`${match.loadSnapshot.origin} → ${match.loadSnapshot.destination}`}
/>
<TableStatusBadge status={match.status} />
<TableCurrency amount={match.originalTerms.rate} />
```

### ✅ Drivers Page (src/app/dashboard/drivers/page.tsx)
Already has nice avatar + badge styling (doesn't need updating)

---

## Where to Apply Next

### ⏳ Loads Page (src/app/dashboard/loads/page.tsx)

**Current Table Columns:**
1. Route (origin → destination)
2. Status
3. Posted Date
4. Rate
5. Actions

**Suggested Updates:**
```tsx
// Route column - could use TableAvatar
<TableAvatar 
  name={`${load.origin} → ${load.destination}`}
  subtitle={`${load.cargoType || 'N/A'} • ${load.distance || 'N/A'} mi`}
/>

// Status column
<TableStatusBadge status={load.status} />

// Date column
<TableDate date={load.createdAt} />

// Rate column
<TableCurrency amount={load.rate} />
```

---

### ⏳ Matches Page (src/app/dashboard/matches/page.tsx)

**Current Table Columns:**
1. Driver
2. Load Route
3. Score
4. Status
5. Actions

**Suggested Updates:**
```tsx
// Driver column
<TableAvatar 
  name={match.driverSnapshot.name}
  subtitle={match.driverSnapshot.vehicleType || 'Driver'}
/>

// Load Route column - plain text is fine OR use TableAvatar
<TableAvatar 
  name={`${match.loadSnapshot.origin} → ${match.loadSnapshot.destination}`}
  subtitle={`${match.loadSnapshot.distance || 'N/A'} mi`}
/>

// Status column
<TableStatusBadge status={match.status} />

// Match score - could add color coding
<Badge variant={match.matchScore >= 90 ? 'default' : match.matchScore >= 70 ? 'secondary' : 'outline'}>
  {match.matchScore}%
</Badge>

// Rate (if shown)
<TableCurrency amount={match.originalTerms.rate} />
```

---

## Import Statement

Add this to the top of files where you want to use these components:

```tsx
import { 
  TableAvatar, 
  TableStatusBadge, 
  TableCurrency, 
  TableDate 
} from '@/components/ui/table-components';
```

---

## Full Example: Before & After

### Before (Plain Table)
```tsx
<TableRow>
  <TableCell className="font-medium">
    <div className="flex items-center gap-2">
      <span>John Smith</span>
    </div>
  </TableCell>
  <TableCell>Miami, FL → New York, NY</TableCell>
  <TableCell>
    <Badge variant="outline">Pending</Badge>
  </TableCell>
  <TableCell>$1234.56</TableCell>
  <TableCell>2 days ago</TableCell>
</TableRow>
```

### After (With Components)
```tsx
<TableRow>
  <TableCell>
    <TableAvatar 
      name="John Smith" 
      subtitle="Miami, FL → New York, NY"
    />
  </TableCell>
  <TableCell>
    <TableStatusBadge status="pending" />
  </TableCell>
  <TableCell className="text-right">
    <TableCurrency amount={1234.56} />
  </TableCell>
  <TableCell>
    <TableDate date={createdAt} />
  </TableCell>
</TableRow>
```

---

## Benefits

1. **Consistency** - All tables look the same
2. **Less Code** - Reusable components mean less repetition
3. **Easier Updates** - Change style in one place, updates everywhere
4. **Professional** - Polished look with avatars, colors, formatting
5. **Accessible** - Built-in tooltips and semantic HTML

---

## Testing Checklist

After applying to Loads/Matches pages:

- [ ] Avatars show correct initials
- [ ] Subtitles appear in gray
- [ ] Status badges have correct colors
- [ ] Currency shows $ and commas
- [ ] Dates show relative time
- [ ] Date tooltips work on hover
- [ ] Mobile responsive (check narrow screens)
- [ ] Dark mode looks good

---

## Tips

1. **Keep it simple** - Don't use TableAvatar for everything, sometimes plain text is better
2. **Right-align currency** - Always add `className="text-right"` to currency table cells
3. **Status consistency** - Make sure status strings match what TableStatusBadge expects
4. **Mobile first** - Test on narrow screens to ensure nothing breaks

---

## Need Help?

Check the actual implementation:
- **Component code:** `src/components/ui/table-components.tsx`
- **Dashboard example:** `src/app/dashboard/page.tsx` (Recent Matches table)
- **Drivers example:** `src/app/dashboard/drivers/page.tsx`

All components have TypeScript types and inline documentation!
