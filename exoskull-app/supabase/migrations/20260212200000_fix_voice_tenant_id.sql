-- Fix voice messages tenant_id linkage
-- Problem: Voice calls couldn't find user by phone → saved as 'anonymous'
-- Solution: Add phone to user account + fix existing voice messages

-- 1. Add phone number to tenant (user: jankiewicz3@gmail.com)
UPDATE exo_tenants
SET phone = '+48732143210'
WHERE id = 'c66bc058-af8e-408b-9e88-bfe2a23ed65f';

-- 2. Fix existing voice sessions (change anonymous → real tenant)
UPDATE exo_voice_sessions
SET tenant_id = 'c66bc058-af8e-408b-9e88-bfe2a23ed65f'
WHERE tenant_id = 'anonymous'
  AND call_sid IN (
    -- Find sessions with voice messages in unified thread
    SELECT DISTINCT source_id
    FROM exo_unified_messages
    WHERE channel = 'voice'
      AND source_type = 'voice_session'
  );

-- 3. Fix existing voice messages in unified thread
UPDATE exo_unified_messages
SET tenant_id = 'c66bc058-af8e-408b-9e88-bfe2a23ed65f'
WHERE channel = 'voice'
  AND tenant_id = 'anonymous';
