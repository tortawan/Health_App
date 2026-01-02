# MAIN PROJECT PLAN: Health & Nutrition Tracking App
## Strategy: AI-Native (Visual RAG) First

### 🎯 PRIMARY MVP GOAL
The absolute core of this project is a "Visual RAG" loop:
- **Input:** Take a photo (camera or upload).
- **Perception:** AI identifies the food items and estimates visual portion size.
- **Retrieval:** System fetches accurate nutrition facts from a trusted, self-hosted database (USDA).
- **Result:** Daily intake is logged automatically with high accuracy.

**Constraint:** This feature comes BEFORE community, challenges, or messaging.

---

### 🧱 PHASE 0 – AI FOOD RECOGNITION MVP (THE FOUNDATION)
**Status:** Mandatory. Blocks all other features.

#### User Flow (Revised for Visual RAG):
1.  **Capture:** User opens app and clicks "Take Photo".
2.  **Optimistic UI:** App shows the image immediately ("Scanning...").
3.  **AI Analysis:** Gemini 1.5 Flash analyzes the image to find:
    * Food Name (e.g., "Grilled Chicken Breast")
    * Visual Quantity Estimate (e.g., "Medium size, approx 150g")
4.  **Vector Search:** App converts the food name into an embedding and finds the exact match in our self-hosted USDA database.
5.  **Verification:** User sees a "Draft" entry:
    * *"We found Grilled Chicken. Estimated 150g. Is this correct?"*
6.  **Log:** User confirms or adjusts (Small/Medium/Large), and data is saved.

#### Why this first?
* It solves the "Hallucination Problem" (AI guessing wrong calories).
* It solves the "Input Friction" problem (Manual entry is too slow).
* Everything else relies on this data being accurate.

---

### 🛠 TECH STACK & DATA SOURCES (FINALIZED)

#### 1. Food Identification (AI Vision)
* **Selected:** **Gemini 1.5 Flash** (Google)
* **Role:** Strictly for visual recognition and portion estimation. Does NOT generate nutritional numbers directly.
* **Cost:** Free Tier (1,500 reqs/day).

#### 2. Nutrition Database (The "Truth")
* **Selected:** **USDA FoodData Central (Foundation Foods)**
* **Implementation:** Self-hosted in **Supabase** (PostgreSQL).
* **Search Engine:** **pgvector** (Vector Similarity Search) using `transformers.js` embeddings.
* **Reasoning:** Avoids API rate limits and costs associated with Nutritionix or others.

#### 3. Platform
* **Frontend/Backend:** Next.js (App Router) on Vercel.
* **Database/Auth/Storage:** Supabase (Free Tier).

---

### 📅 PHASING

#### PHASE 1 – BASIC TRACKING Loop
* User Accounts (Supabase Auth).
* **Core Feature:** The "Visual RAG" logging flow described above.
* Daily Totals: Real-time calculation of Calories, Protein, Carbs, Fat.
* Manual Edit: Fallback for when AI misses (Search database manually).

#### PHASE 2 – DASHBOARD & TRENDS
* Daily Summary Cards.
* Weekly Trends (Charts/Graphs).
* Body Weight Tracking (Manual input).

#### PHASE 3 – COMMUNITY (LATER)
* *Note: Do not build until Phase 1 & 2 are solid.*
* Social Sharing (Share your "Healthy Lunch" photo).
* Challenges.
* Leaderboards.

---

### ✅ SUCCESS CRITERIA (MVP)
1.  **Latency:** From "Snap" to "Verify Screen" in < 3 seconds (perceived).
2.  **Accuracy:** Food ID is correct 90% of the time; Nutrition Data is 100% USDA accurate.
3.  **Cost:** $0.00/month infrastructure cost at launch.