-- 020 Conversation direct-pair uniqueness
-- Makes one-to-one message threads idempotent and cleans old duplicate direct chats.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS direct_pair_key TEXT;

-- Move messages from duplicate direct conversations into the oldest canonical
-- conversation for the same two participants, then delete duplicate shells.
WITH direct_conversations AS (
  SELECT
    cp.conversation_id,
    string_agg(cp.user_id::text, ':' ORDER BY cp.user_id::text) AS pair_key,
    count(*) AS participant_count
  FROM conversation_participants cp
  GROUP BY cp.conversation_id
  HAVING count(*) = 2
),
ranked AS (
  SELECT
    dc.conversation_id,
    dc.pair_key,
    row_number() OVER (PARTITION BY dc.pair_key ORDER BY c.created_at ASC, dc.conversation_id ASC) AS rn,
    first_value(dc.conversation_id) OVER (PARTITION BY dc.pair_key ORDER BY c.created_at ASC, dc.conversation_id ASC) AS canonical_id
  FROM direct_conversations dc
  JOIN conversations c ON c.id = dc.conversation_id
)
UPDATE messages m
SET conversation_id = r.canonical_id
FROM ranked r
WHERE r.rn > 1
  AND m.conversation_id = r.conversation_id;

WITH direct_conversations AS (
  SELECT
    cp.conversation_id,
    string_agg(cp.user_id::text, ':' ORDER BY cp.user_id::text) AS pair_key,
    count(*) AS participant_count
  FROM conversation_participants cp
  GROUP BY cp.conversation_id
  HAVING count(*) = 2
),
ranked AS (
  SELECT
    dc.conversation_id,
    dc.pair_key,
    row_number() OVER (PARTITION BY dc.pair_key ORDER BY c.created_at ASC, dc.conversation_id ASC) AS rn
  FROM direct_conversations dc
  JOIN conversations c ON c.id = dc.conversation_id
)
DELETE FROM conversations c
USING ranked r
WHERE r.rn > 1
  AND c.id = r.conversation_id;

WITH direct_conversations AS (
  SELECT
    cp.conversation_id,
    string_agg(cp.user_id::text, ':' ORDER BY cp.user_id::text) AS pair_key,
    count(*) AS participant_count
  FROM conversation_participants cp
  GROUP BY cp.conversation_id
  HAVING count(*) = 2
)
UPDATE conversations c
SET direct_pair_key = dc.pair_key
FROM direct_conversations dc
WHERE c.id = dc.conversation_id
  AND c.direct_pair_key IS DISTINCT FROM dc.pair_key;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_pair_key_unique
  ON conversations (direct_pair_key)
  WHERE direct_pair_key IS NOT NULL;
