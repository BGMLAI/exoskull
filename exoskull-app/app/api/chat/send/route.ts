/**
 * POST /api/chat/send - Send a message in the unified chat
 *
 * Uses the same Claude + IORS_TOOLS pipeline as voice,
 * but returns text (no TTS audio by default).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getOrCreateSession,
  processUserMessage,
  updateSession,
  endSession
} from '@/lib/voice/conversation-handler'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, conversationId } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get or create session
    const sessionKey = conversationId || `chat-${user.id}-${new Date().toISOString().slice(0, 10)}`
    const session = await getOrCreateSession(sessionKey, user.id)

    // Process through Claude with IORS tools
    const result = await processUserMessage(session, message)

    // Save to session + unified thread
    await updateSession(session.id, message, result.text, {
      tenantId: user.id,
      channel: 'web_chat',
    })

    if (result.shouldEndCall) {
      await endSession(session.id)
    }

    return NextResponse.json({
      text: result.text,
      toolsUsed: result.toolsUsed,
      conversationId: session.id
    })
  } catch (error) {
    console.error('[Chat Send] Error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
