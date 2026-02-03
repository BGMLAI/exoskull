'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { uploadDocument } from '@/lib/api/knowledge'
import { Upload, FileText, X, CheckCircle2, AlertCircle } from 'lucide-react'

interface FileUploadZoneProps {
  tenantId: string
  onUploadComplete: () => void
}

interface UploadingFile {
  file: File
  progress: number
  status: 'uploading' | 'success' | 'error'
  error?: string
}

const CATEGORIES = [
  { value: 'research', label: 'Research' },
  { value: 'notes', label: 'Notatki' },
  { value: 'documents', label: 'Dokumenty' },
  { value: 'media', label: 'Media' },
  { value: 'other', label: 'Inne' },
]

export function FileUploadZone({ tenantId, onUploadComplete }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [category, setCategory] = useState('documents')
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const uploadFile = async (file: File, index: number) => {
    try {
      // Simulate progress (real progress would need XHR)
      setUploadingFiles((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], progress: 30 }
        return updated
      })

      await uploadDocument(tenantId, file, category)

      setUploadingFiles((prev) => {
        const updated = [...prev]
        updated[index] = { ...updated[index], progress: 100, status: 'success' }
        return updated
      })

      onUploadComplete()
    } catch (err) {
      console.error('[FileUploadZone] Upload error:', err)
      setUploadingFiles((prev) => {
        const updated = [...prev]
        updated[index] = {
          ...updated[index],
          status: 'error',
          error: err instanceof Error ? err.message : 'Blad uploadu',
        }
        return updated
      })
    }
  }

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return

      const newFiles: UploadingFile[] = Array.from(files).map((file) => ({
        file,
        progress: 0,
        status: 'uploading' as const,
      }))

      setUploadingFiles((prev) => [...prev, ...newFiles])

      // Upload each file
      const startIndex = uploadingFiles.length
      newFiles.forEach((_, i) => {
        uploadFile(newFiles[i].file, startIndex + i)
      })
    },
    [tenantId, category, uploadingFiles.length]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files)
    },
    [handleFiles]
  )

  const removeFile = (index: number) => {
    setUploadingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const clearCompleted = () => {
    setUploadingFiles((prev) => prev.filter((f) => f.status === 'uploading'))
  }

  const hasCompleted = uploadingFiles.some((f) => f.status !== 'uploading')

  return (
    <div className="space-y-4">
      {/* Category selector */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Kategoria:</span>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Drop zone */}
      <Card
        className={cn(
          'border-2 border-dashed transition-colors cursor-pointer',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Upload className={cn('h-12 w-12 mb-4', isDragging ? 'text-primary' : 'text-muted-foreground')} />
          <h3 className="text-lg font-medium mb-2">
            {isDragging ? 'Upusc pliki tutaj' : 'Przeciagnij pliki lub kliknij'}
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            PDF, TXT, MD, JSON, CSV, DOCX, XLSX, PPTX, obrazy (JPEG, PNG, WebP), wideo (MP4, WebM) - max 1GB
          </p>
          <input
            id="file-input"
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.txt,.md,.json,.csv,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov"
          />
        </CardContent>
      </Card>

      {/* Uploading files list */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Pliki ({uploadingFiles.length})</span>
            {hasCompleted && (
              <Button variant="ghost" size="sm" onClick={clearCompleted}>
                Wyczysc zakonczone
              </Button>
            )}
          </div>

          {uploadingFiles.map((item, index) => (
            <Card key={index} className="p-3">
              <div className="flex items-center gap-3">
                {item.status === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                ) : item.status === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.file.name}</p>
                  {item.status === 'uploading' && (
                    <Progress value={item.progress} className="h-1 mt-1" />
                  )}
                  {item.status === 'error' && (
                    <p className="text-xs text-destructive">{item.error}</p>
                  )}
                </div>

                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {(item.file.size / 1024 / 1024).toFixed(1)} MB
                </span>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile(index)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
