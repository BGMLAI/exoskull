/**
 * Ingest Claude Code + ChatGPT conversation history into ExoSkull RAG knowledge base.
 *
 * Usage:
 *   node scripts/ingest-history.mjs
 *
 * Reads JSONL files from Claude Code projects + ChatGPT markdown export,
 * chunks text, generates embeddings, inserts into exo_document_chunks.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ─── Config (from env vars) ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TENANT_ID = process.env.TENANT_ID || 'be769cc4-43db-4b26-bcc2-046c6653e3b3';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

// Paths
const CLAUDE_PROJECT_DIRS = [
  'C:/Users/bogum/.claude/projects/c--Users-bogum-exoskull',
  'C:/Users/bogum/.claude/projects/C--Users-bogum--exoskull',
  'C:/Users/bogum/.claude/projects/C--Users-bogum',
];
const CHATGPT_MD = 'D:/downloads/famguard_v4.6_docx_fix/conversations_md/conversations_0001.md';

// Chunking config
const CHUNK_SIZE = 1500;   // chars (~375 tokens)
const CHUNK_OVERLAP = 200; // chars
const EMBED_BATCH = 50;    // embeddings per API call

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── JSONL → Markdown Converter ───────────────────────────────────────────────

function convertClaudeJSONL(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const parts = [];
  let sessionTitle = path.basename(filePath, '.jsonl');

  for (const line of lines) {
    let d;
    try { d = JSON.parse(line); } catch { continue; }

    if (d.type === 'user' || d.type === 'assistant') {
      const content = d.message?.content;
      if (!Array.isArray(content)) continue;

      const textParts = content
        .filter(c => c.type === 'text' && c.text)
        .map(c => c.text.trim())
        .filter(Boolean);

      if (textParts.length === 0) continue;

      const label = d.type === 'user' ? '**User:**' : '**Assistant:**';
      parts.push(`${label}\n${textParts.join('\n')}`);
    }
  }

  if (parts.length === 0) return null;
  return `# Claude Code Session: ${sessionTitle}\n\n${parts.join('\n\n')}`;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

function chunkText(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + CHUNK_SIZE;
    if (end < text.length) {
      // Try to break at paragraph or sentence boundary
      const slice = text.substring(start, end);
      const lastPara = slice.lastIndexOf('\n\n');
      const lastSent = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('.\n'),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! ')
      );
      if (lastPara > CHUNK_SIZE * 0.5) end = start + lastPara + 2;
      else if (lastSent > CHUNK_SIZE * 0.3) end = start + lastSent + 2;
    } else {
      end = text.length;
    }
    const chunk = text.substring(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start = end - CHUNK_OVERLAP;
    if (start < 0) start = 0;
    if (end >= text.length) break;
  }
  return chunks;
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

async function generateEmbeddings(texts) {
  const allEmbeddings = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const truncated = batch.map(t => t.substring(0, 8000));

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: truncated,
        model: 'text-embedding-3-small',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI embedding error: ${res.status} ${err}`);
    }

    const data = await res.json();
    const embeddings = data.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
    allEmbeddings.push(...embeddings);

    console.log(`  Embedded ${Math.min(i + EMBED_BATCH, texts.length)}/${texts.length} chunks`);
  }
  return allEmbeddings;
}

// ─── Store Document + Chunks ──────────────────────────────────────────────────

async function ingestDocument(name, fullText, category, tags) {
  console.log(`\n📄 Ingesting: ${name} (${(fullText.length / 1024).toFixed(0)} KB)`);

  // 1. Create document record
  const docId = crypto.randomUUID();
  const { error: docErr } = await supabase.from('exo_user_documents').insert({
    id: docId,
    tenant_id: TENANT_ID,
    filename: name.replace(/[^a-zA-Z0-9_.-]/g, '_').substring(0, 100) + '.md',
    original_name: name,
    file_type: 'md',
    file_size: Buffer.byteLength(fullText, 'utf8'),
    storage_path: `conversation-history/${docId}.md`,
    extracted_text: fullText.substring(0, 500000), // max 500KB in text column
    summary: `Conversation history: ${name}. Contains ${fullText.split('\n').length} lines of dialogue.`,
    category: category,
    tags: tags,
    status: 'ready',
    processed_at: new Date().toISOString(),
  });

  if (docErr) {
    console.error(`  ❌ Doc insert failed:`, docErr.message);
    return { success: false, chunks: 0 };
  }
  console.log(`  ✅ Document created: ${docId}`);

  // 2. Chunk text
  const chunks = chunkText(fullText);
  console.log(`  📦 ${chunks.length} chunks`);

  if (chunks.length === 0) return { success: true, chunks: 0 };

  // 3. Generate embeddings
  console.log(`  🧠 Generating embeddings...`);
  let embeddings;
  try {
    embeddings = await generateEmbeddings(chunks);
  } catch (err) {
    console.error(`  ❌ Embedding failed:`, err.message);
    // Mark document as failed
    await supabase.from('exo_user_documents').update({ status: 'failed', error_message: err.message }).eq('id', docId);
    return { success: false, chunks: 0 };
  }

  // 4. Insert chunks in batches of 50
  let inserted = 0;
  for (let i = 0; i < chunks.length; i += 50) {
    const batch = chunks.slice(i, i + 50).map((content, idx) => ({
      id: crypto.randomUUID(),
      document_id: docId,
      tenant_id: TENANT_ID,
      chunk_index: i + idx,
      content: content,
      embedding: JSON.stringify(embeddings[i + idx]),
    }));

    const { error: chunkErr } = await supabase.from('exo_document_chunks').insert(batch);
    if (chunkErr) {
      console.error(`  ❌ Chunk insert batch ${i} failed:`, chunkErr.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`  ✅ ${inserted}/${chunks.length} chunks stored`);
  return { success: true, chunks: inserted };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  ExoSkull Conversation History Ingestion');
  console.log('═══════════════════════════════════════════════════\n');

  let totalDocs = 0;
  let totalChunks = 0;

  // ── Part 1: Claude Code JSONL files ──────────────────────────────────────
  console.log('📂 Processing Claude Code sessions...\n');

  const allJsonlFiles = [];
  for (const dir of CLAUDE_PROJECT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    for (const f of files) {
      allJsonlFiles.push(path.join(dir, f));
    }
  }

  console.log(`Found ${allJsonlFiles.length} JSONL files\n`);

  // Combine smaller sessions, keep large ones separate
  let combinedSmall = [];
  let combinedSmallSize = 0;
  const MAX_COMBINED = 100000; // ~100KB per combined doc

  for (const fp of allJsonlFiles) {
    const md = convertClaudeJSONL(fp);
    if (!md || md.length < 200) {
      console.log(`  ⏭ Skipping ${path.basename(fp)} (too short)`);
      continue;
    }

    if (md.length > MAX_COMBINED) {
      // Large session → ingest separately
      const result = await ingestDocument(
        `Claude Code: ${path.basename(fp, '.jsonl')}`,
        md,
        'productivity',
        ['claude-code', 'conversation-history', 'development']
      );
      if (result.success) { totalDocs++; totalChunks += result.chunks; }
    } else {
      // Small session → combine
      combinedSmall.push(md);
      combinedSmallSize += md.length;
      if (combinedSmallSize > MAX_COMBINED) {
        const result = await ingestDocument(
          `Claude Code Sessions (batch ${totalDocs + 1})`,
          combinedSmall.join('\n\n---\n\n'),
          'productivity',
          ['claude-code', 'conversation-history', 'development']
        );
        if (result.success) { totalDocs++; totalChunks += result.chunks; }
        combinedSmall = [];
        combinedSmallSize = 0;
      }
    }
  }

  // Flush remaining small sessions
  if (combinedSmall.length > 0) {
    const result = await ingestDocument(
      `Claude Code Sessions (batch ${totalDocs + 1})`,
      combinedSmall.join('\n\n---\n\n'),
      'productivity',
      ['claude-code', 'conversation-history', 'development']
    );
    if (result.success) { totalDocs++; totalChunks += result.chunks; }
  }

  // ── Part 2: ChatGPT markdown ─────────────────────────────────────────────
  console.log('\n📂 Processing ChatGPT history...\n');

  if (fs.existsSync(CHATGPT_MD)) {
    const chatgptText = fs.readFileSync(CHATGPT_MD, 'utf8');
    console.log(`ChatGPT markdown: ${(chatgptText.length / 1024 / 1024).toFixed(1)} MB`);

    // Split into ~200KB documents (too large for single doc)
    const DOC_SIZE = 200000;
    let docNum = 1;
    let pos = 0;

    while (pos < chatgptText.length) {
      let end = pos + DOC_SIZE;
      if (end < chatgptText.length) {
        // Break at conversation boundary (--- separator)
        const slice = chatgptText.substring(pos, end);
        const lastSep = slice.lastIndexOf('\n---\n');
        if (lastSep > DOC_SIZE * 0.5) end = pos + lastSep;
      } else {
        end = chatgptText.length;
      }

      const segment = chatgptText.substring(pos, end).trim();
      if (segment.length > 200) {
        const result = await ingestDocument(
          `ChatGPT History (part ${docNum})`,
          segment,
          'productivity',
          ['chatgpt', 'conversation-history', 'ai-assistant']
        );
        if (result.success) { totalDocs++; totalChunks += result.chunks; }
        docNum++;
      }
      pos = end;
    }
  } else {
    console.log(`  ⚠ ChatGPT markdown not found at: ${CHATGPT_MD}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Done! ${totalDocs} documents, ${totalChunks} chunks ingested`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
