'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, CheckCircle2, Circle, AlertCircle, Clock } from 'lucide-react'

type Task = {
  id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
  priority: 1 | 2 | 3 | 4 // 1=critical, 2=high, 3=medium, 4=low
  energy_required: number | null
  time_estimate_minutes: number | null
  due_date: string | null
  created_at: string
  completed_at: string | null
}

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  blocked: 'bg-red-100 text-red-800',
  done: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-500'
}

const STATUS_LABELS = {
  pending: 'Do zrobienia',
  in_progress: 'W trakcie',
  blocked: 'Zablokowane',
  done: 'Gotowe',
  cancelled: 'Anulowane'
}

const PRIORITY_COLORS = {
  1: 'bg-red-100 text-red-800',
  2: 'bg-orange-100 text-orange-800',
  3: 'bg-yellow-100 text-yellow-800',
  4: 'bg-green-100 text-green-800'
}

const PRIORITY_LABELS = {
  1: 'Krytyczny',
  2: 'Wysoki',
  3: 'Średni',
  4: 'Niski'
}

export default function TasksPage() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'pending' as Task['status'],
    priority: 2 as Task['priority'],
    energy_required: '',
    time_estimate_minutes: '',
    due_date: ''
  })

  useEffect(() => {
    initializeAndLoadTasks()
  }, [])

  async function ensureTenantExists() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      // Check if tenant exists
      const { data: existing } = await supabase
        .from('exo_tenants')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!existing) {
        // Create tenant record
        const { error } = await supabase
          .from('exo_tenants')
          .insert({
            id: user.id,
            name: user.email?.split('@')[0] || 'User',
            email: user.email,
            created_at: new Date().toISOString()
          })

        if (error) {
          console.error('[EnsureTenant] Failed to create tenant:', error)
          return false
        }
        console.log('[EnsureTenant] Created tenant for user:', user.id)
      }
      return true
    } catch (error) {
      console.error('[EnsureTenant] Error:', error)
      return false
    }
  }

  async function initializeAndLoadTasks() {
    await ensureTenantExists()
    await loadTasks()
  }

  async function loadTasks() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('exo_tasks')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error('Error loading tasks:', error)
      alert('Nie udało się załadować zadań')
    } finally {
      setLoading(false)
    }
  }

  async function createTask() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Ensure tenant exists before creating task
      const tenantReady = await ensureTenantExists()
      if (!tenantReady) {
        throw new Error('Failed to initialize user profile')
      }

      const { error } = await supabase.from('exo_tasks').insert({
        tenant_id: user.id,
        title: formData.title,
        description: formData.description || null,
        status: formData.status,
        priority: formData.priority,
        energy_required: formData.energy_required ? parseInt(formData.energy_required) : null,
        time_estimate_minutes: formData.time_estimate_minutes ? parseInt(formData.time_estimate_minutes) : null,
        due_date: formData.due_date || null
      })

      if (error) throw error

      await loadTasks()
      setIsCreateDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error('[CreateTask] Error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error
      })
      alert(`Nie udało się utworzyć zadania: ${error instanceof Error ? error.message : 'Nieznany błąd'}`)
    }
  }

  async function updateTask(task: Task) {
    try {
      const updates: any = {
        title: formData.title,
        description: formData.description || null,
        status: formData.status,
        priority: formData.priority,
        energy_required: formData.energy_required ? parseInt(formData.energy_required) : null,
        time_estimate_minutes: formData.time_estimate_minutes ? parseInt(formData.time_estimate_minutes) : null,
        due_date: formData.due_date || null
      }

      // If marking as done, set completed_at
      if (formData.status === 'done' && task.status !== 'done') {
        updates.completed_at = new Date().toISOString()
      }
      // If unmarking done, clear completed_at
      if (formData.status !== 'done' && task.status === 'done') {
        updates.completed_at = null
      }

      const { error } = await supabase
        .from('exo_tasks')
        .update(updates)
        .eq('id', task.id)

      if (error) throw error

      await loadTasks()
      setEditingTask(null)
      resetForm()
    } catch (error) {
      console.error('Error updating task:', error)
      alert('Nie udało się zaktualizować zadania')
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Czy na pewno chcesz usunąć to zadanie?')) return

    try {
      const { error } = await supabase
        .from('exo_tasks')
        .delete()
        .eq('id', taskId)

      if (error) throw error

      await loadTasks()
    } catch (error) {
      console.error('Error deleting task:', error)
      alert('Nie udało się usunąć zadania')
    }
  }

  async function toggleTaskStatus(task: Task) {
    const newStatus = task.status === 'done' ? 'pending' : 'done'
    const updates: any = { status: newStatus }

    if (newStatus === 'done') {
      updates.completed_at = new Date().toISOString()
    } else {
      updates.completed_at = null
    }

    try {
      const { error } = await supabase
        .from('exo_tasks')
        .update(updates)
        .eq('id', task.id)

      if (error) throw error
      await loadTasks()
    } catch (error) {
      console.error('Error toggling task:', error)
    }
  }

  function resetForm() {
    setFormData({
      title: '',
      description: '',
      status: 'pending',
      priority: 2,
      energy_required: '',
      time_estimate_minutes: '',
      due_date: ''
    })
  }

  function openEditDialog(task: Task) {
    setFormData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      energy_required: task.energy_required?.toString() || '',
      time_estimate_minutes: task.time_estimate_minutes?.toString() || '',
      due_date: task.due_date || ''
    })
    setEditingTask(task)
  }

  const filteredTasks = tasks.filter(task => {
    if (filterStatus !== 'all' && task.status !== filterStatus) return false
    if (filterPriority !== 'all' && task.priority.toString() !== filterPriority) return false
    return true
  })

  const taskStats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Zadania</h1>
          <p className="text-muted-foreground">
            Zarządzaj swoimi zadaniami w systemie GTD
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nowe zadanie
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Nowe zadanie</DialogTitle>
              <DialogDescription>
                Dodaj nowe zadanie do swojej listy
              </DialogDescription>
            </DialogHeader>
            <TaskForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={createTask}
              onCancel={() => {
                setIsCreateDialogOpen(false)
                resetForm()
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Wszystkie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Do zrobienia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">W trakcie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.in_progress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Ukończone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{taskStats.done}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            <SelectItem value="pending">Do zrobienia</SelectItem>
            <SelectItem value="in_progress">W trakcie</SelectItem>
            <SelectItem value="blocked">Zablokowane</SelectItem>
            <SelectItem value="done">Gotowe</SelectItem>
            <SelectItem value="cancelled">Anulowane</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Priorytet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie priorytety</SelectItem>
            <SelectItem value="1">Krytyczny</SelectItem>
            <SelectItem value="2">Wysoki</SelectItem>
            <SelectItem value="3">Średni</SelectItem>
            <SelectItem value="4">Niski</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Ładowanie zadań...
            </CardContent>
          </Card>
        ) : filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Brak zadań do wyświetlenia
            </CardContent>
          </Card>
        ) : (
          filteredTasks.map(task => (
            <Card key={task.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleTaskStatus(task)}
                    className="mt-1 flex-shrink-0"
                  >
                    {task.status === 'done' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className={`font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {task.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(task)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTask(task.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-2">
                      <Badge className={STATUS_COLORS[task.status]}>
                        {STATUS_LABELS[task.status]}
                      </Badge>
                      <Badge className={PRIORITY_COLORS[task.priority]}>
                        {PRIORITY_LABELS[task.priority]}
                      </Badge>
                      {task.energy_required && (
                        <Badge variant="outline">
                          ⚡ Energia: {task.energy_required}/10
                        </Badge>
                      )}
                      {task.time_estimate_minutes && (
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          {task.time_estimate_minutes} min
                        </Badge>
                      )}
                      {task.due_date && (
                        <Badge variant="outline">
                          📅 {new Date(task.due_date).toLocaleDateString('pl-PL')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      {editingTask && (
        <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Edytuj zadanie</DialogTitle>
              <DialogDescription>
                Zaktualizuj szczegóły zadania
              </DialogDescription>
            </DialogHeader>
            <TaskForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={() => updateTask(editingTask)}
              onCancel={() => {
                setEditingTask(null)
                resetForm()
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// Task Form Component
function TaskForm({
  formData,
  setFormData,
  onSubmit,
  onCancel
}: {
  formData: any
  setFormData: any
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="title">Tytuł *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Nazwa zadania"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Opis</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Dodatkowe szczegóły..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData({ ...formData, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Do zrobienia</SelectItem>
              <SelectItem value="in_progress">W trakcie</SelectItem>
              <SelectItem value="blocked">Zablokowane</SelectItem>
              <SelectItem value="done">Gotowe</SelectItem>
              <SelectItem value="cancelled">Anulowane</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priorytet</Label>
          <Select
            value={formData.priority.toString()}
            onValueChange={(value) => setFormData({ ...formData, priority: parseInt(value) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Krytyczny</SelectItem>
              <SelectItem value="2">Wysoki</SelectItem>
              <SelectItem value="3">Średni</SelectItem>
              <SelectItem value="4">Niski</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="energy">Energia (1-10)</Label>
          <Input
            id="energy"
            type="number"
            min="1"
            max="10"
            value={formData.energy_required}
            onChange={(e) => setFormData({ ...formData, energy_required: e.target.value })}
            placeholder="1-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="time">Czas (minuty)</Label>
          <Input
            id="time"
            type="number"
            min="1"
            value={formData.time_estimate_minutes}
            onChange={(e) => setFormData({ ...formData, time_estimate_minutes: e.target.value })}
            placeholder="np. 30"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="due_date">Termin</Label>
        <Input
          id="due_date"
          type="datetime-local"
          value={formData.due_date}
          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Anuluj
        </Button>
        <Button onClick={onSubmit} disabled={!formData.title}>
          Zapisz
        </Button>
      </DialogFooter>
    </div>
  )
}
