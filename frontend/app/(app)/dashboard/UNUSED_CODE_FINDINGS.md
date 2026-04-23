# Duplicate Utility Logic Analysis

**Task**: 1.4 Identify duplicate utility logic  
**Date**: 2024  
**Requirements**: 3.1, 3.2

## Executive Summary

This document identifies duplicate formatting logic, data transformation logic, and utility functions across dashboard files that should be consolidated into `lib/format.ts` or new utility modules.

## 1. Duplicate Formatting Functions

### 1.1 Number Formatting with Units (`fmt` function)

**Location**: `recovery-overview-card.tsx` (lines 10-14)

```typescript
function fmt(value: number | null, unit: string) {
  if (value === null) return "—";
  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${rounded}${unit ? ` ${unit}` : ""}`;
}
```

**Usage**: Used 15+ times in `recovery-overview-card.tsx` for formatting metrics with units (bpm, h, %, ms, etc.)

**Consolidation Opportunity**: ✅ **HIGH PRIORITY**
- This is a generic number formatter that could be used across the entire app
- Should be moved to `lib/format.ts` as `formatNumber(value: number | null, unit?: string): string`
- Similar to existing `formatHRV`, `formatCalories`, etc., but more generic

**Recommendation**: Create `formatNumber()` in `lib/format.ts`:
```typescript
export function formatNumber(value: number | null, unit?: string): string {
  if (value === null) return "—";
  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return unit ? `${rounded} ${unit}` : rounded;
}
```

---

### 1.2 Relative Time Formatting (`formatLastSync` function)

**Location**: `dashboard-content.tsx` (lines 157-167)

```typescript
function formatLastSync(isoStr: string | null | undefined): string {
  if (!isoStr) return "Never synced";
  if (nowMs === null) {
    return `Last synced ${new Date(isoStr).toLocaleString()}`;
  }
  const diff = nowMs - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just synced";
  if (minutes < 60) return `Last synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last synced ${hours}h ago`;
  return `Last synced ${Math.floor(hours / 24)}d ago`;
}
```

**Usage**: Used once in `dashboard-content.tsx` for displaying last sync time

**Consolidation Opportunity**: ⚠️ **MEDIUM PRIORITY**
- This is similar to `formatRelativeDate()` in `lib/format.ts` but with more granular time units (minutes, hours)
- Could be generalized to `formatRelativeTime()` for use in other parts of the app (e.g., activity timestamps, comment timestamps)
- The "Last synced" prefix is context-specific and should be parameterized

**Recommendation**: Create `formatRelativeTime()` in `lib/format.ts`:
```typescript
export function formatRelativeTime(iso: string | null | undefined, prefix?: string): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

Then use in `dashboard-content.tsx`:
```typescript
const syncText = data.last_sync_at 
  ? `Last synced ${formatRelativeTime(data.last_sync_at)}`
  : "Never synced";
```

---

### 1.3 Date Axis Label Formatting (`formatAxisLabel` function)

**Location**: `recovery-overview-card.tsx` (lines 38-40)

```typescript
function formatAxisLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
```

**Usage**: Used in Recharts `XAxis` and `Tooltip` components for sparkline charts

**Consolidation Opportunity**: ⚠️ **MEDIUM PRIORITY**
- This is a specialized date formatter for chart axes
- Similar to `formatDate()` in `lib/format.ts` but with different format (no year, shorter month)
- Could be useful in other chart components (fitness chart, activity charts)

**Recommendation**: Add to `lib/format.ts`:
```typescript
export function formatChartDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { 
    day: "numeric", 
    month: "short" 
  });
}
```

---

## 2. Duplicate Data Transformation Logic

### 2.1 Trend Direction Styling (`trendTone` function)

**Location**: `recovery-overview-card.tsx` (lines 16-21)

```typescript
function trendTone(direction: string) {
  if (direction === "up") return "text-emerald-600";
  if (direction === "down") return "text-rose-500";
  return "text-zinc-400";
}
```

**Usage**: Used to style trend indicators in recovery metrics

**Consolidation Opportunity**: ✅ **HIGH PRIORITY**
- This is a generic trend color mapper that could be used across the app
- Similar logic exists in `activity-overview-card.tsx` for delta badges
- Should be consolidated into a shared utility

**Recommendation**: Create `lib/trend-utils.ts`:
```typescript
export type TrendDirection = "up" | "down" | "stable" | "unknown";

export function getTrendColor(direction: TrendDirection): string {
  if (direction === "up") return "text-emerald-600";
  if (direction === "down") return "text-rose-500";
  return "text-zinc-400";
}

export function getTrendLabel(direction: TrendDirection): string {
  if (direction === "up") return "Improving";
  if (direction === "down") return "Softening";
  if (direction === "stable") return "Stable";
  return "—";
}
```

---

### 2.2 Trend Label Mapping (`trendLabel` function)

**Location**: `recovery-overview-card.tsx` (lines 23-28)

```typescript
function trendLabel(direction: string) {
  if (direction === "up") return "Improving";
  if (direction === "down") return "Softening";
  if (direction === "stable") return "Stable";
  return "—";
}
```

**Usage**: Used to display human-readable trend labels

**Consolidation Opportunity**: ✅ **HIGH PRIORITY**
- Should be consolidated with `trendTone` into a shared trend utility module
- See recommendation in 2.1 above

---

### 2.3 Status Color Mapping (Multiple Implementations)

**Locations**:
1. `recovery-overview-card.tsx` (lines 30-34):
```typescript
function statusColor(status: string) {
  if (status === "strong") return "bg-emerald-50 text-emerald-700";
  if (status === "strained") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}
```

2. `activity-overview-card.tsx` (lines 8-13):
```typescript
function statusColor(status: string) {
  if (status === "building") return "bg-emerald-50 text-emerald-700";
  if (status === "overreaching") return "bg-rose-50 text-rose-700";
  if (status === "idle") return "bg-zinc-100 text-zinc-500";
  return "bg-amber-50 text-amber-700";
}
```

**Usage**: Used to style status badges in recovery and activity cards

**Consolidation Opportunity**: ✅ **HIGH PRIORITY**
- Two different implementations for different status types
- Should be consolidated into a single utility with type-specific mappings
- This is a perfect candidate for a shared utility module

**Recommendation**: Create `lib/status-utils.ts`:
```typescript
export type RecoveryStatus = "strong" | "strained" | "steady";
export type ActivityStatus = "idle" | "overreaching" | "building" | "lighter" | "steady";

const RECOVERY_STATUS_COLORS: Record<RecoveryStatus, string> = {
  strong: "bg-emerald-50 text-emerald-700",
  strained: "bg-rose-50 text-rose-700",
  steady: "bg-amber-50 text-amber-700",
};

const ACTIVITY_STATUS_COLORS: Record<ActivityStatus, string> = {
  building: "bg-emerald-50 text-emerald-700",
  overreaching: "bg-rose-50 text-rose-700",
  idle: "bg-zinc-100 text-zinc-500",
  lighter: "bg-amber-50 text-amber-700",
  steady: "bg-amber-50 text-amber-700",
};

export function getRecoveryStatusColor(status: RecoveryStatus): string {
  return RECOVERY_STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-500";
}

export function getActivityStatusColor(status: ActivityStatus): string {
  return ACTIVITY_STATUS_COLORS[status] ?? "bg-zinc-100 text-zinc-500";
}
```

---

### 2.4 Delta Badge Calculation (`deltaBadge` function)

**Location**: `activity-overview-card.tsx` (lines 15-24)

```typescript
function deltaBadge(current: number, previous: number, unit: string): { text: string; color: string } | null {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return null;
  const sign = diff > 0 ? "+" : "";
  const formatted = Number.isInteger(diff) ? diff.toFixed(0) : diff.toFixed(1);
  return {
    text: `${sign}${formatted}${unit}`,
    color: diff > 0 ? "text-emerald-600" : "text-rose-500",
  };
}
```

**Usage**: Used to calculate and format week-over-week deltas in activity discipline rows

**Consolidation Opportunity**: ✅ **HIGH PRIORITY**
- This is a generic delta calculator that could be used across the app
- Could be useful for comparing any two numeric values (fitness metrics, performance metrics, etc.)
- Should be moved to a shared utility module

**Recommendation**: Create `lib/comparison-utils.ts`:
```typescript
export interface DeltaBadge {
  text: string;
  color: string;
}

export function calculateDelta(
  current: number,
  previous: number,
  unit?: string,
  threshold: number = 0.05
): DeltaBadge | null {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (Math.abs(diff) < threshold) return null;
  
  const sign = diff > 0 ? "+" : "";
  const formatted = Number.isInteger(diff) ? diff.toFixed(0) : diff.toFixed(1);
  const text = unit ? `${sign}${formatted}${unit}` : `${sign}${formatted}`;
  
  return {
    text,
    color: diff > 0 ? "text-emerald-600" : "text-rose-500",
  };
}
```

---

### 2.5 Error Message Extraction (`getErrorMessage` function)

**Location**: `dashboard-content.tsx` (lines 68-73)

```typescript
function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail ?? "Sync failed.";
}
```

**Usage**: Used to extract error messages from API errors

**Consolidation Opportunity**: ✅ **CRITICAL PRIORITY**
- This is duplicate error handling logic that should be consolidated
- Similar logic exists inline in the `initializeDashboard` function (lines 103-111)
- This is exactly what task 7.1 addresses (Create unified error handling utility)
- Should be moved to `lib/error-handling.ts` as part of Phase 4

**Recommendation**: This will be addressed in task 7.1 - no action needed here, just documenting the duplication

---

### 2.6 Timezone Detection (`getTimezone` function)

**Location**: `dashboard-content.tsx` (lines 42-47)

```typescript
const getTimezone = useCallback(() => {
  if (typeof window === "undefined") {
    return "UTC";
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}, []);
```

**Usage**: Used to get user's timezone for API requests

**Consolidation Opportunity**: ✅ **HIGH PRIORITY**
- This is a generic utility that should be shared across the app
- Likely needed in other components that make timezone-aware API calls
- Should be moved to a shared utility module
- This is exactly what task 8.3 addresses (Extract timezone utility)

**Recommendation**: This will be addressed in task 8.3 - no action needed here, just documenting the opportunity

---

## 3. Duplicate CSS Class Constants

### 3.1 Section Label Class

**Locations**:
1. `recovery-overview-card.tsx`: `SECTION_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400"`
2. `activity-overview-card.tsx`: `SECTION_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400"`
3. `coach-briefing-card.tsx`: `PANEL_LABEL_CLASS = "pl-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500"`

**Usage**: Used for section headers and labels throughout dashboard cards

**Consolidation Opportunity**: ⚠️ **LOW PRIORITY**
- These are nearly identical (slight variations in tracking and color)
- Could be consolidated into a shared constant or Tailwind CSS class
- However, the variations suggest intentional design differences
- Not worth consolidating unless design system is standardized

**Recommendation**: Document in design system, but don't consolidate yet

---

### 3.2 Analysis Text Class

**Locations**:
1. `recovery-overview-card.tsx`: `ANALYSIS_TEXT_CLASS = "text-sm leading-7 text-zinc-600"`
2. `activity-overview-card.tsx`: `ANALYSIS_TEXT_CLASS = "text-sm leading-7 text-zinc-600"`
3. `coach-briefing-card.tsx`: `BODY_TEXT_CLASS = "text-[15px] leading-8 text-zinc-700"`

**Usage**: Used for body text in dashboard cards

**Consolidation Opportunity**: ⚠️ **LOW PRIORITY**
- Similar to section label class, these have intentional variations
- Not worth consolidating unless design system is standardized

**Recommendation**: Document in design system, but don't consolidate yet

---

## 4. Summary of Consolidation Opportunities

### High Priority (Should be consolidated in task 9.1)

1. **`fmt()` → `formatNumber()`** in `lib/format.ts`
   - Generic number formatter with optional unit
   - Used 15+ times in recovery card
   - High reusability potential

2. **`trendTone()` + `trendLabel()` → `lib/trend-utils.ts`**
   - Trend direction styling and labeling
   - Used in recovery card, could be used elsewhere
   - Clear separation of concerns

3. **`statusColor()` → `lib/status-utils.ts`**
   - Two implementations for recovery and activity status
   - Should be consolidated with type-specific mappings
   - High reusability potential

4. **`deltaBadge()` → `lib/comparison-utils.ts`**
   - Generic delta calculator
   - Used in activity card, could be used elsewhere
   - High reusability potential

### Medium Priority (Consider for future refactoring)

5. **`formatLastSync()` → `formatRelativeTime()`** in `lib/format.ts`
   - More granular than existing `formatRelativeDate()`
   - Could be useful for real-time updates
   - Moderate reusability potential

6. **`formatAxisLabel()` → `formatChartDate()`** in `lib/format.ts`
   - Specialized date formatter for charts
   - Could be useful in other chart components
   - Moderate reusability potential

### Already Addressed in Other Tasks

7. **`getErrorMessage()` → `lib/error-handling.ts`**
   - Will be addressed in task 7.1 (Create unified error handling utility)

8. **`getTimezone()` → `lib/timezone.ts`**
   - Will be addressed in task 8.3 (Extract timezone utility)

### Low Priority (Document but don't consolidate)

9. **CSS class constants** (`SECTION_LABEL_CLASS`, `ANALYSIS_TEXT_CLASS`, etc.)
   - Intentional design variations
   - Should be documented in design system
   - Not worth consolidating unless design is standardized

---

## 5. Implementation Plan for Task 9.1

Based on this analysis, task 9.1 should consolidate the following:

### Step 1: Create `lib/format.ts` additions
- Add `formatNumber(value: number | null, unit?: string): string`
- Add `formatRelativeTime(iso: string | null | undefined): string`
- Add `formatChartDate(date: string): string`

### Step 2: Create `lib/trend-utils.ts`
- Add `TrendDirection` type
- Add `getTrendColor(direction: TrendDirection): string`
- Add `getTrendLabel(direction: TrendDirection): string`

### Step 3: Create `lib/status-utils.ts`
- Add `RecoveryStatus` and `ActivityStatus` types
- Add `getRecoveryStatusColor(status: RecoveryStatus): string`
- Add `getActivityStatusColor(status: ActivityStatus): string`

### Step 4: Create `lib/comparison-utils.ts`
- Add `DeltaBadge` interface
- Add `calculateDelta(current, previous, unit?, threshold?): DeltaBadge | null`

### Step 5: Update dashboard components
- Update `recovery-overview-card.tsx` to use new utilities
- Update `activity-overview-card.tsx` to use new utilities
- Remove local function definitions
- Verify output values remain unchanged

---

## 6. Verification Checklist

After consolidation, verify:

- [ ] All dashboard cards render identically
- [ ] All metric values display correctly
- [ ] All trend indicators show correct colors and labels
- [ ] All status badges show correct colors
- [ ] All delta badges calculate correctly
- [ ] TypeScript compilation succeeds
- [ ] No console errors or warnings
- [ ] Bundle size does not increase (should decrease slightly)

---

## 7. Notes

- This analysis focuses on **logic duplication**, not **visual duplication**
- CSS class constants are intentionally not consolidated due to design variations
- Error handling and timezone utilities are addressed in separate tasks (7.1 and 8.3)
- All consolidation should maintain identical output values (requirement 3.5)
- New utility modules should have comprehensive JSDoc comments
- New utility modules should be co-located with existing utilities in `lib/`

---

**End of Analysis**
