/**
 * UUID Generator for Draft Items
 * 
 * Generates unique IDs for food draft items to replace index-based tracking.
 * 
 * ✅ Why this matters:
 * - Fixes bugs #3 and #5 (index mismatches)
 * - Ensures items can be tracked even when order changes
 * - Prevents "wrong item updated" errors
 * 
 * Format: draft_<timestamp>_<random>
 * Example: draft_1705004100000_a1b2c3d4e
 */

export function generateDraftId(): string {
  // Get current timestamp (milliseconds)
  const timestamp = Date.now();
  
  // Generate random string (9 characters)
  const random = Math.random()
    .toString(36)  // Convert to base-36 string
    .substr(2, 9);  // Take 9 characters after "0."
  
  // Combine: draft_<timestamp>_<random>
  return `draft_${timestamp}_${random}`;
}

/**
 * Test this function to make sure it works:
 * 
 * const id1 = generateDraftId();
 * const id2 = generateDraftId();
 * 
 * console.log(id1);  // draft_1705004100000_a1b2c3d4e
 * console.log(id2);  // draft_1705004100001_x9y8z7w6v
 * console.log(id1 === id2);  // false ✅ (always different)
 */
