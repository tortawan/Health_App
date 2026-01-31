# MAIN PROJECT PLAN: Health & Nutrition Tracking App
## Strategy: AI-Native (Visual RAG) First

### 🎯 PRIMARY MVP GOAL
The absolute core of this project is a "Visual RAG" (Retrieval-Augmented Generation) loop. We aim to eliminate the friction of manual calorie counting by combining AI computer vision with a verified nutritional source of truth.

- **Input:** High-resolution food photography (Camera/Upload).
- **Perception:** Gemini 2.5 Flash identifies items and estimates portion size in grams.
- **Retrieval:** Semantic search against a local USDA Foundation Foods database.
- **Result:** Accurate logging of macros (Protein, Carbs, Fat) based on weight-adjusted facts.

### 🧱 PHASE 0 – AI FOOD RECOGNITION MVP
**Status:** Mandatory. This is the technical "North Star" that blocks all other features.

#### Expanded User Flow
1. **Capture:** User triggers camera via a PWA-friendly interface.
2. **Optimistic UI:** The app displays the image instantly with a "Scanning..." overlay to hide API latency.
3. **Multimodal Analysis:** Gemini analyzes the image.
4. **Constraint:** AI identifies food names but is forbidden from hallucinating calorie counts.
5. **Vector Search:** The system generates a 384-dim embedding of the identified food name.
6. **Fact Retrieval:** Supabase performs a hybrid search (Vector + Text) to find the exact USDA entry.
7. **Human-in-the-Loop Verification:** User sees a "Draft Entry" and confirms the weight (Small/Medium/Large presets).
8. **Final Log:** Data is persisted to the food_logs table.

### 📅 DETAILED PHASING & ROADMAP

#### PHASE 1: THE TRACKING FOUNDATION (Current)
- Authentication: Supabase Auth (Magic Link/Email).
- Core RAG Loop: Integrated Gemini perception + Supabase retrieval.
- Daily Dashboard: Real-time calorie/macro progress bars.
- Manual Fallback: Search-as-you-type interface for the USDA library.

#### PHASE 2: ANALYTICS & REINFORCEMENT
- Weight Tracking: Manual entry with trend visualization (Recharts).
- RLHF (Reinforcement Learning): Log corrections to the ai_corrections table to improve future portion estimates.
- Water Tracking: Quick-log buttons for common volumes (250ml, 500ml).

#### PHASE 3: iOS NATIVE TRANSITION (Q2 2024)
- Framework: React Native + Expo.
- Architecture: Use the existing Next.js API routes as a "Backend-as-a-Service."
- Native Features: Push notifications for logging reminders and deep integration with the iOS Camera API for faster capture.

### ✅ SUCCESS CRITERIA
- **Latency:** Total processing time (Capture -> Retrieval) < 3.5 seconds.
- **Accuracy:** Top-3 search results contain the correct food item 90% of the time.
- **Persistence:** 100% data integrity for logged entries.
