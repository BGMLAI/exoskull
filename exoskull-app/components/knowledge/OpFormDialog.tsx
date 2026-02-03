'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Op, CreateOpInput, Loop, Quest } from '@/lib/types/knowledge'

interface OpFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  op?: Op // undefined = create mode
  loops: Loop[]
  quests: Quest[]
  defaultQuestId?: string
  defaultLoopSlug?: string
  onSave: (input: CreateOpInput) => Promise<void>
}

export function OpFormDialog({
  open,
  onOpenChange,
  op,
  loops,
  quests,
  defaultQuestId,
  defaultLoopSlug,
  onSave,
}: OpFormDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questId, setQuestId] = useState('')
  const [loopSlug, setLoopSlug] = useState('')
  const [priority, setPriority] = useState(5)
  const [dueDate, setDueDate] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [estimatedEffort, setEstimatedEffort] = useState<number | undefined>(undefined)
  const [tagsInput, setTagsInput] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState('')
  const [saving, setSaving] = useState(false)

  // Populate form when editing or reset for create
  useEffect(() => {
    if (op) {
      setTitle(op.title)
      setDescription(op.description || '')
      setQuestId(op.quest_id || '')
      setLoopSlug(op.loop_slug || '')
      setPriority(op.priority)
      setDueDate(op.due_date?.split('T')[0] || '')
      setScheduledFor(op.scheduled_for?.split('T')[0] || '')
      setEstimatedEffort(op.estimated_effort || undefined)
      setTagsInput(op.tags?.join(', ') || '')
      setIsRecurring(op.is_recurring)
      setRecurrenceRule(op.recurrence_rule || '')
    } else {
      setTitle('')
      setDescription('')
      setQuestId(defaultQuestId || '')
      setLoopSlug(defaultLoopSlug || '')
      setPriority(5)
      setDueDate('')
      setScheduledFor('')
      setEstimatedEffort(undefined)
      setTagsInput('')
      setIsRecurring(false)
      setRecurrenceRule('')
    }
  }, [op, defaultQuestId, defaultLoopSlug, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        questId: questId || undefined,
        loopSlug: loopSlug || undefined,
        priority,
        dueDate: dueDate || undefined,
        scheduledFor: scheduledFor || undefined,
        estimatedEffort: estimatedEffort || undefined,
        tags: tags.length > 0 ? tags : undefined,
        isRecurring,
        recurrenceRule: isRecurring ? recurrenceRule || undefined : undefined,
      })
      onOpenChange(false)
    } catch (err) {
      console.error('[OpFormDialog] Save error:', err)
      alert(err instanceof Error ? err.message : 'Blad zapisu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{op ? 'Edytuj Op' : 'Nowy Op'}</DialogTitle>
          <DialogDescription>
            Op to konkretne zadanie do wykonania
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="title">Tytul</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="np. Przygotowac prezentacje"
                required
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Opis</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Szczegoly zadania..."
                rows={2}
              />
            </div>

            {/* Quest & Loop selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Quest</Label>
                <Select value={questId} onValueChange={setQuestId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Brak</SelectItem>
                    {quests.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Loop</Label>
                <Select value={loopSlug} onValueChange={setLoopSlug}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Brak</SelectItem>
                    {loops.map((loop) => (
                      <SelectItem key={loop.slug} value={loop.slug}>
                        {loop.icon} {loop.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Priority & Effort */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="priority">Priorytet (1-10)</Label>
                <Input
                  id="priority"
                  type="number"
                  min={1}
                  max={10}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="effort">Szacowany czas (h)</Label>
                <Input
                  id="effort"
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={estimatedEffort || ''}
                  onChange={(e) => setEstimatedEffort(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="np. 2"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dueDate">Termin</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scheduledFor">Zaplanowane na</Label>
                <Input
                  id="scheduledFor"
                  type="date"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </div>
            </div>

            {/* Tags */}
            <div className="grid gap-2">
              <Label htmlFor="tags">Tagi (oddzielone przecinkami)</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="np. urgent, follow-up"
              />
            </div>

            {/* Recurring */}
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isRecurring"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="isRecurring">Zadanie cykliczne</Label>
              </div>
              {isRecurring && (
                <Input
                  value={recurrenceRule}
                  onChange={(e) => setRecurrenceRule(e.target.value)}
                  placeholder="np. FREQ=DAILY lub FREQ=WEEKLY;BYDAY=MO,WE,FR"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? 'Zapisywanie...' : op ? 'Zapisz' : 'Utworz'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
