#!/usr/bin/env bash
# upload-folder.sh — Upload entire folder to ExoSkull knowledge base
#
# Usage:
#   ./scripts/upload-folder.sh <folder-path> [category]
#
# Example:
#   ./scripts/upload-folder.sh ./docs documentation
#   ./scripts/upload-folder.sh ~/projects/my-app codebase
#
# Requires: curl, jq
# Auth: Uses EXOSKULL_API_KEY or prompts for Supabase JWT

set -euo pipefail

FOLDER="${1:?Usage: $0 <folder-path> [category]}"
CATEGORY="${2:-folder_upload}"
API_URL="${EXOSKULL_URL:-https://exoskull.xyz}/api/knowledge/upload-folder"

if [ ! -d "$FOLDER" ]; then
  echo "Error: $FOLDER is not a directory"
  exit 1
fi

# Auth token
TOKEN="${EXOSKULL_API_KEY:-}"
if [ -z "$TOKEN" ]; then
  echo "Set EXOSKULL_API_KEY env var (Supabase JWT)"
  exit 1
fi

echo "Scanning $FOLDER..."

# Build multipart form data
CURL_ARGS=(-s -X POST "$API_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -F "category=$CATEGORY")

FILE_COUNT=0
TOTAL_SIZE=0

# Find all files, skip common junk
while IFS= read -r -d '' filepath; do
  # Get relative path
  relpath="${filepath#$FOLDER/}"
  filesize=$(stat -c%s "$filepath" 2>/dev/null || stat -f%z "$filepath" 2>/dev/null || echo "0")

  CURL_ARGS+=(-F "files=@$filepath")
  CURL_ARGS+=(-F "paths=$relpath")

  FILE_COUNT=$((FILE_COUNT + 1))
  TOTAL_SIZE=$((TOTAL_SIZE + filesize))
done < <(find "$FOLDER" -type f \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/.next/*' \
  -not -path '*/dist/*' \
  -not -path '*/__pycache__/*' \
  -not -path '*/.venv/*' \
  -not -name '*.pyc' \
  -not -name '.DS_Store' \
  -not -name 'Thumbs.db' \
  -not -name '*.lock' \
  -not -name 'package-lock.json' \
  -not -name 'yarn.lock' \
  -not -name 'pnpm-lock.yaml' \
  -print0)

if [ "$FILE_COUNT" -eq 0 ]; then
  echo "No files found in $FOLDER"
  exit 0
fi

SIZE_MB=$(echo "scale=1; $TOTAL_SIZE / 1048576" | bc 2>/dev/null || echo "?")
echo "Uploading $FILE_COUNT files (${SIZE_MB}MB) to ExoSkull..."

RESPONSE=$(curl "${CURL_ARGS[@]}" 2>&1)

# Parse response
SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false' 2>/dev/null || echo "false")
UPLOADED=$(echo "$RESPONSE" | jq -r '.uploaded // 0' 2>/dev/null || echo "0")
FAILED=$(echo "$RESPONSE" | jq -r '.failed // 0' 2>/dev/null || echo "0")
BATCH_ID=$(echo "$RESPONSE" | jq -r '.batchId // "unknown"' 2>/dev/null || echo "unknown")

if [ "$SUCCESS" = "true" ]; then
  echo "✓ Uploaded: $UPLOADED files"
  [ "$FAILED" -gt 0 ] && echo "✗ Failed: $FAILED files"
  echo "Batch ID: $BATCH_ID"
  echo "Files are being processed (text extraction, chunking, embeddings)."
else
  echo "Upload failed:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
  exit 1
fi
