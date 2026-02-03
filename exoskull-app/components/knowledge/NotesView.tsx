'use client'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NoteCard } from './NoteCard'
import { Note, NoteType, NOTE_TYPE_LABELS } from '@/lib/types/knowledge'
import { Plus, FileText } from 'lucide-react'

interface NotesViewProps {
  notes: Note[]
  loading: boolean
  total: number
  typeFilter: NoteType | null
  onTypeFilterChange: (type: NoteType | null) => void
  onEditNote: (note: Note) => void
  onAddNote: () => void
  onLoadMore?: () => void
  hasMore?: boolean
}

function NoteSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

export function NotesView({
  notes,
  loading,
  total,
  typeFilter,
  onTypeFilterChange,
  onEditNote,
  onAddNote,
  onLoadMore,
  hasMore = false,
}: NotesViewProps) {
  const noteTypes = Object.entries(NOTE_TYPE_LABELS) as [NoteType, { label: string; icon: string }][]

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select
            value={typeFilter || 'all'}
            onValueChange={(v) => onTypeFilterChange(v === 'all' ? null : v as NoteType)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Wszystkie typy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie typy</SelectItem>
              {noteTypes.map(([type, info]) => (
                <SelectItem key={type} value={type}>
                  {info.icon} {info.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'notatka' : total < 5 ? 'notatki' : 'notatek'}
          </span>
        </div>

        <Button onClick={onAddNote}>
          <Plus className="h-4 w-4 mr-2" />
          Nowa notatka
        </Button>
      </div>

      {/* Notes grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <NoteSkeleton key={i} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Brak notatek</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {typeFilter
              ? `Nie ma notatek typu "${NOTE_TYPE_LABELS[typeFilter].label}"`
              : 'Zacznij dodawac notatki do swojej bazy wiedzy'}
          </p>
          <Button onClick={onAddNote}>
            <Plus className="h-4 w-4 mr-2" />
            Dodaj pierwsza notatke
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => onEditNote(note)}
              />
            ))}
          </div>

          {hasMore && onLoadMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={onLoadMore}>
                Zaladuj wiecej
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
