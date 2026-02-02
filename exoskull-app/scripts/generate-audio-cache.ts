/**
 * Script to generate and cache all common audio phrases
 *
 * Usage:
 *   npx ts-node scripts/generate-audio-cache.ts
 *
 * Or via npm script:
 *   npm run generate-audio-cache
 *
 * Prerequisites:
 * 1. ELEVENLABS_API_KEY in .env.local
 * 2. audio-cache bucket created in Supabase Storage
 */

import 'dotenv/config'

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function main() {
  console.log('🎙️ Starting audio cache generation...\n')
  console.log(`API URL: ${API_URL}`)

  // Check for ElevenLabs API key
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY not found in environment')
    console.log('\nTo fix:')
    console.log('1. Go to https://elevenlabs.io/app/settings/api-keys')
    console.log('2. Copy your API key')
    console.log('3. Add to .env.local: ELEVENLABS_API_KEY=your_key_here')
    process.exit(1)
  }

  try {
    // First, check current status
    console.log('\n📊 Checking current cache status...')
    const statusRes = await fetch(`${API_URL}/api/audio/generate-cache`)
    const status = await statusRes.json()

    console.log(`Total phrases: ${status.total}`)
    console.log(`Already cached: ${status.cached}`)
    console.log(`Missing: ${status.missing}`)

    if (status.missing === 0) {
      console.log('\n✅ All phrases already cached!')
      return
    }

    // Generate missing phrases
    console.log('\n🔄 Generating missing audio...\n')
    const generateRes = await fetch(`${API_URL}/api/audio/generate-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false })
    })

    const result = await generateRes.json()

    console.log('\n📊 Generation Summary:')
    console.log(`  Generated: ${result.summary.generated}`)
    console.log(`  Skipped: ${result.summary.skipped}`)
    console.log(`  Failed: ${result.summary.failed}`)

    // Show any failures
    const failures = Object.entries(result.results)
      .filter(([_, r]: [string, any]) => !r.success)

    if (failures.length > 0) {
      console.log('\n❌ Failed phrases:')
      failures.forEach(([key, r]: [string, any]) => {
        console.log(`  ${key}: ${r.error}`)
      })
    }

    console.log('\n✅ Done!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

main()
