# Health App - Bug Analysis & Alignment Report

**Branch:** `refactor/home-client-cleanup`  
**Date:** February 5, 2026  
**Reviewer:** Senior Software Engineer & ML Engineer

---

## Executive Summary

✅ **Project Alignment:** The codebase generally aligns well with the Technical Blueprint and Database Schema.  
🐛 **Critical Bug Found:** Application freeze when clicking "Add Food" - caused by missing `updateScannerView` function in the scanner hook.  
⚠️ **Additional Issues:** Several minor issues and inconsistencies detected that could cause future problems.

---

## Part 1: Project Alignment Verification

### ✅ Database Schema Alignment

**Status:** COMPLIANT

The database schema in production matches the planned schema in `Plan/Database_Schema.txt`:

| Table | Columns Verified | Status |
|-------|------------------|--------|
| `food_logs` | id, user_id, food_name, weight_g, calories, protein, carbs, fat, consumed_at, created_at, image_path, fiber, sugar, sodium | ✅ Complete |
| `usda_library` | id, description, embedding (vector), kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, sodium_100g, search_text | ✅ Complete |
| `ai_corrections` | All 16 columns including id, user_id, original_weight, corrected_weight, food_name, correction_type, logged_at, etc. | ✅ Complete |
| `user_profiles` | All profile fields including calorie_target, macro targets, is_public | ✅ Complete |
| `meal_templates` | id, user_id, name, items (jsonb), created_at | ✅ Complete |
| `water_logs` | id, user_id, amount_ml, logged_at | ✅ Complete |
| `weight_logs` | id, user_id, weight_kg, logged_at | ✅ Complete |

**Key Features Implemented:**
- ✅ Vector embeddings for semantic search (pgvector extension)
- ✅ AI correction tracking for RLHF
- ✅ Portion memory system
- ✅ Template system for common meals
- ✅ Multi-tracking (food, water, weight)

### ✅ Technical Blueprint Alignment

**Status:** MOSTLY COMPLIANT

| Component | Blueprint Requirement | Implementation Status |
|-----------|----------------------|----------------------|
| **Framework** | Next.js 15+ (App Router) | ✅ Implemented |
| **AI Vision** | Gemini 2.5 Flash | ✅ API route `/api/analyze` uses Gemini |
| **Database** | Supabase with pgvector | ✅ Configured correctly |
| **Embeddings** | Transformers.js (client-side) | ⚠️ Implemented but needs alignment verification |
| **Storage** | Supabase Storage for images | ✅ Implemented with bucket upload |
| **Visual RAG Workflow** | 4-step process (Capture → AI → Vector → Verification) | ✅ All steps present |
| **RLS Policies** | Row Level Security for multi-tenant | ⚠️ Not visible in codebase audit, needs Supabase verification |

**Architecture Observations:**
- ✅ Clean separation: Actions (server) ↔ Hooks (client) ↔ Components (UI)
- ✅ Optimistic UI updates for better UX
- ✅ Offline queue system for photo uploads
- ✅ Draft review workflow matches blueprint's "verification step"

---

## Part 2: Critical Bug Analysis

### 🐛 **BUG #1: Application Freeze on "Add Food" Click** 

**Severity:** CRITICAL 🔴  
**Impact:** Application completely freezes, users cannot log food

#### Root Cause

In `src/hooks/scanner/useScannerOrchestration.ts`, the hook returns `...scanner` which should include all functions from `useScanner`. However, in `src/app/hooks/useScanner.ts`, there is **NO `updateScannerView` function exported**.

**Code Location:**
- **File:** `src/app/hooks/useScanner.ts`
- **Issue:** Missing `updateScannerView` function
- **Called from:** `src/app/home-client.tsx` line ~235 and multiple other locations

#### The Freeze Mechanism

When user clicks "Add Food" (+) button:
1. `FABGroup.tsx` calls `onScanClick` prop
2. `home-client.tsx` passes `() => scanner.updateScannerView("scan")` 
3. JavaScript tries to call `undefined()` 
4. **Result:** Uncaught TypeError, event loop blocks, UI freezes

#### Cascading Effects

The missing function is called in multiple critical paths:
```typescript
// home-client.tsx line ~197 - Draft item selection
scanner.updateScannerView("scan");

// home-client.tsx line ~428 - Try again button  
scanner.resetAnalysis(); // This also needs updateScannerView

// home-client.tsx line ~429 - Manual search after no food detected
manualSearch.setManualOpenIndex(-1);

// useScannerOrchestration.ts line ~95 - After successful log
updateScannerView(null);
```

#### The Fix

**Option A: Add the Missing Function (Recommended)**

Add to `src/app/hooks/useScanner.ts` at the end of the return statement:

```typescript
export function useScanner(options: UseScannerOptions = {}) {
  // ... existing state and logic ...
  
  const updateScannerView = useCallback((view: "scan" | null) => {
    if (view === "scan") {
      setShowScanner(true);
      setDraft([]);
      setError(null);
      setImagePublicUrl(null);
      setAnalysisMessage(null);
      setNoFoodDetected(false);
      setQueueNotice(null);
    } else if (view === null) {
      setShowScanner(false);
      setDraft([]);
      setError(null);
      setImagePublicUrl(null);
      setAnalysisMessage(null);
      setNoFoodDetected(false);
      setQueueNotice(null);
    }
  }, []);

  return {
    // ... existing returns ...
    updateScannerView,  // ADD THIS LINE
  };
}
```

**Option B: Use Existing Functions (Alternative)**

Replace all calls to `scanner.updateScannerView("scan")` with:
```typescript
scanner.setShowScanner(true);
scanner.resetAnalysis();
```

Replace `scanner.updateScannerView(null)` with:
```typescript
scanner.stopScanning();
```

**Recommendation:** Use Option A as it's cleaner and matches the intended abstraction.

---

### 🐛 **BUG #2: Storage Bucket Name Inconsistency**

**Severity:** MEDIUM 🟡  
**Impact:** Image uploads may fail if bucket name doesn't match

#### Issue Details

**File:** `src/app/hooks/useScanner.ts` (line ~229)

```typescript
const bucketName = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "food-photos";
```

**Problem:** The code defaults to `"food-photos"` but doesn't verify this bucket exists.

#### The Fix

1. **Verify Supabase Storage bucket name:**
   - Log into Supabase Dashboard → Storage
   - Confirm bucket name (likely `food-photos` or `food_photos`)

2. **Add to `.env.local`:**
   ```env
   NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=food-photos
   ```

3. **Add bucket creation check to setup script:**
   ```sql
   -- Run in Supabase SQL Editor
   INSERT INTO storage.buckets (id, name, public)
   VALUES ('food-photos', 'food-photos', true)
   ON CONFLICT (id) DO NOTHING;
   ```

---

### ⚠️ **ISSUE #3: Missing updateScannerView in Draft Selection**

**Severity:** MEDIUM 🟡  
**Impact:** Users cannot continue after selecting draft items

**File:** `src/app/home-client.tsx` (line ~197)

```typescript
onSelect: (draftItem, replaceIndex) => {
  if (replaceIndex !== undefined) {
     // ... update logic ...
  } else {
     scanner.setDraft((prev) => [...prev, draftItem]);
     scanner.updateScannerView("scan"); // 🐛 ALSO FAILS HERE
  }
},
```

**Fix:** Once Bug #1 is fixed, this will also be resolved.

---

### ⚠️ **ISSUE #4: Inconsistent Import Paths**

**Severity:** LOW 🟢  
**Impact:** Potential build/runtime errors

#### Examples Found:

1. **useScannerOrchestration.ts:**
   ```typescript
   // Line 3: Uses @/app/hooks/useScanner
   import { useScanner } from "@/app/hooks/useScanner";
   ```

2. **home-client.tsx:**
   ```typescript
   // Line 17: Uses @/hooks/scanner (no "app" prefix)
   import { useScannerOrchestration } from "@/hooks/scanner/useScannerOrchestration";
   ```

**Issue:** Two different import paths for the same "hooks" directory:
- `@/app/hooks/` (inside `src/app/hooks/`)
- `@/hooks/` (inside `src/hooks/`)

**This suggests a refactoring was done but not completed consistently.**

#### The Fix

**Recommended:** Consolidate to single hooks directory

Option A: Move all hooks to `src/hooks/` (preferred):
```bash
# Merge directories
mv src/app/hooks/* src/hooks/core/
rm -rf src/app/hooks/
```

Option B: Update imports to be consistent:
```typescript
// Update useScannerOrchestration.ts imports:
import { useScanner } from "@/hooks/core/useScanner"; 
// OR
import { useScanner } from "../../app/hooks/useScanner";
```

---

## Part 3: Code Quality Observations

### ✅ Strengths

1. **Excellent Type Safety**
   - Comprehensive TypeScript types in `src/types/food.ts`
   - Proper error handling with typed catch blocks
   - Zod-like validation patterns

2. **Modern React Patterns**
   - Custom hooks for separation of concerns
   - `useCallback` and `useMemo` for performance
   - Optimistic UI updates

3. **Robust Error Handling**
   - Try-catch blocks in all async operations
   - Error boundaries for component failures
   - User-friendly toast notifications

4. **Offline Support**
   - Queue system for offline photo uploads
   - LocalStorage-based queue management
   - Automatic retry on reconnection

### ⚠️ Potential Improvements

1. **Error Messages Could Be More Specific**
   ```typescript
   // Current (useScanner.ts line ~210)
   const msg = err instanceof Error ? err.message : "Failed to process image";
   
   // Better
   const msg = err instanceof Error 
     ? `Image processing failed: ${err.message}`
     : "Failed to process image. Please try again.";
   ```

2. **Console Logs Should Be Removed in Production**
   ```typescript
   // Found in useScanner.ts
   console.log("🧠 [DEBUG] Sending to AI analysis...");
   console.log("✅ [DEBUG] Analysis Results:", data);
   ```
   
   **Recommendation:** Use a logging library that respects `NODE_ENV`:
   ```typescript
   import { logger } from '@/lib/logger';
   logger.debug("Sending to AI analysis...");
   ```

3. **Magic Numbers Should Be Constants**
   ```typescript
   // home-client.tsx line ~90
   if (Math.abs(original.weight - original.ai_suggested_weight) <= 10) return;
   
   // Better
   const WEIGHT_CORRECTION_THRESHOLD_GRAMS = 10;
   if (Math.abs(original.weight - original.ai_suggested_weight) <= WEIGHT_CORRECTION_THRESHOLD_GRAMS) return;
   ```

---

## Part 4: Recommendations & Action Items

### Immediate (P0) - Must Fix Before Deployment

- [ ] **Fix Bug #1:** Add `updateScannerView` function to `useScanner.ts`
- [ ] **Verify Bug #2:** Confirm Supabase Storage bucket name and add to `.env`
- [ ] **Test End-to-End:** Manual test of full "Add Food" flow

### Short Term (P1) - Fix Within 1 Week

- [ ] **Resolve Import Paths:** Consolidate hooks directory structure
- [ ] **Remove Debug Logs:** Clean up `console.log` statements for production
- [ ] **Add Unit Tests:** Cover critical paths (especially scanner hooks)
- [ ] **Verify RLS Policies:** Test multi-tenant security in Supabase

### Long Term (P2) - Technical Debt

- [ ] **Extract Magic Numbers:** Move to constants file
- [ ] **Improve Error Messages:** Add context-specific error handling
- [ ] **Add Logging Service:** Structured logging for production debugging
- [ ] **Performance Monitoring:** Add analytics for image upload/analysis times

---

## Appendix A: Testing Checklist

### Manual Testing After Fixes

1. **Add Food Flow:**
   - [ ] Click "Add Food" (+) button - should not freeze
   - [ ] Upload photo - verify upload to correct bucket
   - [ ] View analysis results - draft items should appear
   - [ ] Confirm food entry - should save to database
   - [ ] Verify entry appears in daily log

2. **Manual Search Flow:**
   - [ ] Click "Manual Add" button
   - [ ] Search for food item
   - [ ] Select from results
   - [ ] Verify added to draft or daily log

3. **Edge Cases:**
   - [ ] Try with no internet connection (offline queue)
   - [ ] Upload invalid image type
   - [ ] Upload very large image (>10MB)
   - [ ] Try scanning image with no food

### Automated Testing Recommendations

```typescript
// tests/hooks/useScanner.test.ts
describe('useScanner', () => {
  it('should have updateScannerView function', () => {
    const { result } = renderHook(() => useScanner());
    expect(result.current.updateScannerView).toBeDefined();
    expect(typeof result.current.updateScannerView).toBe('function');
  });
  
  it('should update scanner view to scan mode', () => {
    const { result } = renderHook(() => useScanner());
    act(() => {
      result.current.updateScannerView('scan');
    });
    expect(result.current.showScanner).toBe(true);
    expect(result.current.draft).toEqual([]);
  });
});
```

---

## Appendix B: Environment Variables Checklist

Verify these are set in `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Storage
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=food-photos

# AI
GOOGLE_AI_API_KEY=your-gemini-api-key
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2

# Optional
NODE_ENV=development
```

---

## Conclusion

The Health App project demonstrates **strong architecture and adherence to the Technical Blueprint**. The database schema is complete and properly structured. However, the **critical bug preventing the "Add Food" functionality must be fixed immediately**.

### Priority Summary:

1. 🔴 **CRITICAL:** Fix `updateScannerView` bug (estimated 15 minutes)
2. 🟡 **HIGH:** Verify storage bucket configuration (estimated 5 minutes)
3. 🟡 **MEDIUM:** Resolve import path inconsistencies (estimated 30 minutes)
4. 🟢 **LOW:** Code quality improvements (ongoing)

### Estimated Time to Production-Ready: 1-2 hours

Once Bug #1 and Bug #2 are fixed and tested, the application should be fully functional and ready for user testing.

---

**Report Generated:** February 5, 2026  
**Reviewed by:** Senior Software Engineer & ML Engineer  
**Next Review:** After critical fixes are implemented
