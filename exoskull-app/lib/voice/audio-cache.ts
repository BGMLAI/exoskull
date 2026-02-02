/**
 * ElevenLabs Audio Cache System
 *
 * Pre-generates and caches common voice responses to:
 * 1. Reduce ElevenLabs API costs (~$0.15-0.30/1000 chars)
 * 2. Improve response latency (instant playback vs ~200ms generation)
 *
 * Storage: Supabase Storage bucket 'audio-cache'
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ============================================================================
// CACHED PHRASES CONFIGURATION
// ============================================================================

export interface CachedPhrase {
  key: string
  text: string
  category: 'greeting' | 'task' | 'confirmation' | 'farewell' | 'error'
  variants?: string[] // Alternative phrasings that map to same audio
}

export const CACHED_PHRASES: CachedPhrase[] = [
  // Greetings (time-based)
  { key: 'greeting_morning', text: 'Dzień dobry! Jak się czujesz?', category: 'greeting' },
  { key: 'greeting_afternoon', text: 'Cześć! Co słychać?', category: 'greeting' },
  { key: 'greeting_evening', text: 'Hej! Jak minął dzień?', category: 'greeting' },
  { key: 'greeting_night', text: 'Hej, jeszcze nie śpisz?', category: 'greeting' },

  // Task responses
  { key: 'task_added', text: 'Dodane.', category: 'task', variants: ['Zapisane.', 'Mam.', 'Ok, dodałem.'] },
  { key: 'task_completed', text: 'Oznaczone jako zrobione.', category: 'task', variants: ['Super, odhaczyłem.', 'Zrobione.'] },
  { key: 'no_tasks', text: 'Nie masz żadnych zadań na liście.', category: 'task', variants: ['Lista pusta.', 'Brak zadań.'] },
  { key: 'task_list_intro', text: 'Masz kilka zadań.', category: 'task' },

  // Confirmations
  { key: 'understood', text: 'Jasne.', category: 'confirmation', variants: ['Rozumiem.', 'Ok.'] },
  { key: 'got_it', text: 'Mam.', category: 'confirmation' },
  { key: 'sure', text: 'Pewnie.', category: 'confirmation' },
  { key: 'ok', text: 'Ok.', category: 'confirmation' },

  // Farewells
  { key: 'goodbye', text: 'Do usłyszenia.', category: 'farewell', variants: ['Pa.', 'Trzymaj się.'] },
  { key: 'bye_short', text: 'Pa.', category: 'farewell' },
  { key: 'take_care', text: 'Trzymaj się.', category: 'farewell' },
  { key: 'good_night', text: 'Dobranoc.', category: 'farewell' },

  // Error handling
  { key: 'error_generic', text: 'Coś poszło nie tak. Spróbuj jeszcze raz.', category: 'error' },
  { key: 'error_connection', text: 'Mam problem z połączeniem. Chwila.', category: 'error' },
]

// Build a lookup map for quick matching
const variantToKeyMap = new Map<string, string>()
CACHED_PHRASES.forEach(phrase => {
  variantToKeyMap.set(phrase.text.toLowerCase(), phrase.key)
  phrase.variants?.forEach(v => variantToKeyMap.set(v.toLowerCase(), phrase.key))
})

// ============================================================================
// AUDIO CACHE CLASS
// ============================================================================

export class AudioCache {
  private supabase
  private bucket = 'audio-cache'
  private localCache: Map<string, string> = new Map() // key -> blob URL

  constructor() {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey)
  }

  /**
   * Check if a response text matches any cached phrase
   */
  findCachedKey(text: string): string | null {
    const normalized = text.toLowerCase().trim()
    return variantToKeyMap.get(normalized) || null
  }

  /**
   * Get cached audio URL for a phrase key
   * Returns null if not cached
   */
  async getCachedAudioUrl(key: string): Promise<string | null> {
    // Check local memory cache first
    if (this.localCache.has(key)) {
      return this.localCache.get(key)!
    }

    try {
      // Try to get from Supabase Storage
      const { data } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(`${key}.mp3`, 3600) // 1 hour signed URL

      if (data?.signedUrl) {
        this.localCache.set(key, data.signedUrl)
        return data.signedUrl
      }
    } catch (error) {
      console.warn(`Audio cache miss for key: ${key}`, error)
    }

    return null
  }

  /**
   * Check if audio exists for a key
   */
  async exists(key: string): Promise<boolean> {
    const { data } = await this.supabase.storage
      .from(this.bucket)
      .list('', { search: `${key}.mp3` })

    return (data?.length ?? 0) > 0
  }

  /**
   * Upload pre-generated audio to cache
   */
  async uploadAudio(key: string, audioBlob: Blob): Promise<boolean> {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .upload(`${key}.mp3`, audioBlob, {
          contentType: 'audio/mpeg',
          upsert: true
        })

      if (error) {
        console.error(`Failed to upload audio for ${key}:`, error)
        return false
      }

      return true
    } catch (error) {
      console.error(`Failed to upload audio for ${key}:`, error)
      return false
    }
  }

  /**
   * Get all cached phrase configurations
   */
  getPhrases(): CachedPhrase[] {
    return CACHED_PHRASES
  }

  /**
   * Clear local memory cache
   */
  clearLocalCache(): void {
    this.localCache.clear()
  }
}

// Singleton instance
let audioCacheInstance: AudioCache | null = null

export function getAudioCache(): AudioCache {
  if (!audioCacheInstance) {
    audioCacheInstance = new AudioCache()
  }
  return audioCacheInstance
}

// ============================================================================
// HELPER: Match response to cached audio
// ============================================================================

export interface CacheMatchResult {
  matched: boolean
  key?: string
  audioUrl?: string
}

export async function matchResponseToCache(responseText: string): Promise<CacheMatchResult> {
  const cache = getAudioCache()
  const key = cache.findCachedKey(responseText)

  if (!key) {
    return { matched: false }
  }

  const audioUrl = await cache.getCachedAudioUrl(key)

  if (!audioUrl) {
    return { matched: false }
  }

  return {
    matched: true,
    key,
    audioUrl
  }
}
