/**
 * Knowledge Upload API
 *
 * POST /api/knowledge/upload - Upload a file to the knowledge base
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const ALLOWED_TYPES = ['application/pdf', 'text/plain', 'text/markdown', 'image/jpeg', 'image/png']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const tenantId = formData.get('tenant_id') as string | null
    const category = formData.get('category') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({
        error: `File type not allowed. Allowed: ${ALLOWED_TYPES.join(', ')}`
      }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      }, { status: 400 })
    }

    // Generate unique filename
    const ext = file.name.split('.').pop()
    const filename = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('user-documents')
      .upload(filename, file, {
        contentType: file.type,
        cacheControl: '3600'
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({
        error: `Upload failed: ${uploadError.message}`
      }, { status: 500 })
    }

    // Create document record
    const { data: document, error: dbError } = await supabase
      .from('exo_user_documents')
      .insert({
        tenant_id: tenantId,
        filename: filename,
        original_name: file.name,
        file_type: ext,
        file_size: file.size,
        storage_path: uploadData.path,
        category: category || 'other',
        status: 'uploaded'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database insert error:', dbError)
      // Try to clean up the uploaded file
      await supabase.storage.from('user-documents').remove([filename])
      return NextResponse.json({
        error: `Database error: ${dbError.message}`
      }, { status: 500 })
    }

    // TODO: Trigger background processing job
    // For now, processing happens on-demand or via cron

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        filename: document.original_name,
        status: document.status,
        category: document.category
      }
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
