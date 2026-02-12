-- Fix voice messages direction field
-- Problem: Voice messages had direction=null → frontend couldn't display them
-- Solution: Set direction based on role (user=inbound, assistant=outbound)
-- Date: 2026-02-12

-- 1. Fix user messages (inbound calls from user to system)
UPDATE exo_unified_messages
SET direction = 'inbound'
WHERE channel = 'voice'
  AND role = 'user'
  AND direction IS NULL;

-- 2. Fix assistant messages (outbound responses from system to user)
UPDATE exo_unified_messages
SET direction = 'outbound'
WHERE channel = 'voice'
  AND role = 'assistant'
  AND direction IS NULL;

-- 3. Verify fix
SELECT
  channel,
  direction,
  COUNT(*) as count
FROM exo_unified_messages
WHERE channel = 'voice'
GROUP BY channel, direction
ORDER BY direction;
