# Database Contracts & RPC Signatures

## 1. Primary Function: match_foods
This RPC is the gateway for all food discovery operations.

### SQL Signature
```sql
CREATE OR REPLACE FUNCTION match_foods(
  query_embedding vector(384),
  query_text text,
  match_threshold float,
  match_count int,
  user_id uuid
)
```

### Interface Contract
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| query_embedding | vector(384) | No | The semantic vector of the search term. |
| query_text | text | Yes | The raw string for full-text ranking. |
| match_threshold | float | Yes | Results with similarity below this are discarded. |
| match_count | int | Yes | Maximum number of rows to return (Limit). |
| user_id | uuid | Yes | The authenticated user's ID for logging. |

**Important:** The key name `user_id` is required by the production database schema. Using `p_user_id` will cause a PostgREST error `PGRST202`.

## 2. Table Schemas

### food_logs
- `id`: uuid (PK)
- `user_id`: uuid (FK)
- `food_name`: text
- `weight_g`: numeric
- `calories`: numeric
- `protein`: numeric
- `carbs`: numeric
- `fat`: numeric
- `fiber`: numeric
- `sugar`: numeric
- `sodium`: numeric
- `consumed_at`: timestamptz

### ai_corrections
- `user_id`: uuid
- `original_search`: text
- `final_match_desc`: text
- `correction_type`: text ('weight' or 'manual_match')
- `original_weight`: numeric
- `corrected_weight`: numeric

## 3. RLS Policies
- `usda_library`: SELECT allowed for all users (`true`).
- `food_logs`: ALL restricted to `auth.uid() = user_id`.
