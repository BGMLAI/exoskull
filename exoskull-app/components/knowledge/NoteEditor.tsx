'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loop, Quest, Op, NoteType, NOTE_TYPE_LABELS } from '@/lib/types/knowledge'
import { DialogFooter } from '@/components/ui/dialog'

export interface NoteEditorData {
  type: NoteType
  title: string
  content: string
  tags: string[]
  isResearch: boolean
  isExperience: boolean
  loopSlug: string | null
  questId: string | null
  opId: string | null
}

interface NoteEditorProps {
  loops: Loop[]
  quests: Quest[]
  ops: Op[]
  initial: NoteEditorData
  onSave: (data: NoteEditorData) => void
  onCancel: () => void
}

export function NoteEditor({
  loops,
  quests,
  ops,
  initial,
  onSave,
  onCancel,
}: NoteEditorProps) {
  const [form, setForm] = useState<NoteEditorData>(initial)
  const [tagsInput, setTagsInput] = useState(initial.tags.join(', '))

  const filteredQuests = form.loopSlug
    ? quests.filter((q) => q.loop_slug === form.loopSlug)
    : quests

  const filteredOps = form.questId
    ? ops.filter((o) => o.quest_id === form.questId)
    : form.loopSlug
    ? ops.filter((o) => o.loop_slug === form.loopSlug)
    : ops

  function handleSave() {
    if (!form.title.trim() && !form.content.trim()) {
      alert('Podaj tytul lub tresc')
      return
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    onSave({ ...form, tags })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Typ</Label>
          <Select
            value={form.type}
            onValueChange={(value) => setForm({ ...form, type: value as NoteType })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Wybierz typ" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(NOTE_TYPE_LABELS).map(([value, { label, icon }]) => (
                <SelectItem key={value} value={value}>
                  {icon} {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Loop</Label>
          <Select
            value={form.loopSlug || 'none'}
            onValueChange={(value) =>
              setForm({
                ...form,
                loopSlug: value === 'none' ? null : value,
                questId: null,
                opId: null,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Wybierz loop" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Brak</SelectItem>
              {loops.map((loop) => (
                <SelectItem key={loop.slug} value={loop.slug}>
                  {loop.icon} {loop.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Quest</Label>
          <Select
            value={form.questId || 'none'}
            onValueChange={(value) =>
              setForm({
                ...form,
                questId: value === 'none' ? null : value,
                opId: null,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Wybierz quest" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Brak</SelectItem>
              {filteredQuests.map((quest) => (
                <SelectItem key={quest.id} value={quest.id}>
                  {quest.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Op</Label>
          <Select
            value={form.opId || 'none'}
            onValueChange={(value) =>
              setForm({ ...form, opId: value === 'none' ? null : value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Wybierz op" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Brak</SelectItem>
              {filteredOps.map((op) => (
                <SelectItem key={op.id} value={op.id}>
                  {op.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Tytul</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Tytul notatki"
        />
      </div>

      <div className="space-y-2">
        <Label>Tresc</Label>
        <Textarea
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="Tresc notatki..."
          rows={6}
        />
      </div>

      <div className="space-y-2">
        <Label>Tagi (oddzielone przecinkami)</Label>
        <Input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="tag1, tag2, tag3"
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.isResearch}
            onChange={(e) => setForm({ ...form, isResearch: e.target.checked })}
          />
          Research
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.isExperience}
            onChange={(e) => setForm({ ...form, isExperience: e.target.checked })}
          />
          Experience
        </label>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Anuluj
        </Button>
        <Button onClick={handleSave}>Zapisz</Button>
      </DialogFooter>
    </div>
  )
}
