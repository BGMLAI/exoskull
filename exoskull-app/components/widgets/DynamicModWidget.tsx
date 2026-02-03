'use client'

/**
 * DynamicModWidget - Renders any Mod as a dashboard widget
 *
 * Based on the Mod's config.widget type, renders the appropriate UI:
 * - log: List of recent entries
 * - chart: Simple line/bar chart placeholder
 * - counter: Daily counter with goal
 * - checklist: Toggle list
 * - progress: Progress bar
 */

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Loader2 } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface ModConfig {
  fields: Array<{
    name: string
    type: string
    label: string
    options?: string[]
    min?: number
    max?: number
    default?: number
  }>
  widget: string
  chart_type?: string
  daily_goal?: number
}

interface ModData {
  id: string
  data: Record<string, any>
  created_at: string
}

interface DynamicModWidgetProps {
  slug: string
  name: string
  icon: string
  config: ModConfig
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DynamicModWidget({ slug, name, icon, config }: DynamicModWidgetProps) {
  const [entries, setEntries] = useState<ModData[]>([])
  const [loading, setLoading] = useState(true)
  const [showInput, setShowInput] = useState(false)
  const [inputData, setInputData] = useState<Record<string, any>>({})

  useEffect(() => {
    fetchData()
  }, [slug])

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/mods/${slug}/data?limit=5`)
      const json = await res.json()
      setEntries(json.data || [])
    } catch (err) {
      console.error(`[ModWidget ${slug}] Fetch error:`, err)
    } finally {
      setLoading(false)
    }
  }

  const addEntry = async () => {
    try {
      const res = await fetch(`/api/mods/${slug}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData)
      })

      if (res.ok) {
        setInputData({})
        setShowInput(false)
        fetchData()
      }
    } catch (err) {
      console.error(`[ModWidget ${slug}] Add error:`, err)
    }
  }

  const renderEntries = () => {
    if (entries.length === 0) {
      return (
        <p className="text-slate-500 text-sm text-center py-4">
          Brak danych. Powiedz IORSowi lub dodaj ręcznie.
        </p>
      )
    }

    return (
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {entries.map(entry => (
          <div
            key={entry.id}
            className="flex justify-between items-center text-sm bg-slate-700/30 rounded-lg px-3 py-2"
          >
            <span className="text-slate-300">
              {Object.entries(entry.data)
                .filter(([k]) => k !== 'id')
                .map(([k, v]) => `${v}`)
                .join(' · ')}
            </span>
            <span className="text-slate-500 text-xs">
              {new Date(entry.created_at).toLocaleDateString('pl-PL')}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const renderQuickInput = () => {
    if (!showInput) return null

    return (
      <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
        {config.fields.map(field => (
          <div key={field.name}>
            <label className="text-xs text-slate-500">{field.label}</label>
            {field.type === 'select' && field.options ? (
              <select
                value={inputData[field.name] || ''}
                onChange={e => setInputData(prev => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
              >
                <option value="">Wybierz...</option>
                {field.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                value={inputData[field.name] || ''}
                onChange={e => setInputData(prev => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white resize-none"
                rows={2}
              />
            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                min={field.min}
                max={field.max}
                value={inputData[field.name] || ''}
                onChange={e => setInputData(prev => ({
                  ...prev,
                  [field.name]: field.type === 'number' ? Number(e.target.value) : e.target.value
                }))}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-white"
              />
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <button
            onClick={addEntry}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded px-3 py-1.5"
          >
            Zapisz
          </button>
          <button
            onClick={() => { setShowInput(false); setInputData({}) }}
            className="text-slate-400 hover:text-white text-sm px-3 py-1.5"
          >
            Anuluj
          </button>
        </div>
      </div>
    )
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h3 className="font-medium text-white text-sm">{name}</h3>
          </div>
          <button
            onClick={() => setShowInput(!showInput)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        ) : (
          renderEntries()
        )}

        {/* Quick input form */}
        {renderQuickInput()}
      </CardContent>
    </Card>
  )
}
