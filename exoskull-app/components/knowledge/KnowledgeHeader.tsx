'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, FolderTree, FileText, Upload } from 'lucide-react'

type TabType = 'hierarchy' | 'notes' | 'documents'

interface KnowledgeHeaderProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onAddLoop: () => void
  onAddCampaign: () => void
  onAddQuest: () => void
  onAddOp: () => void
  onAddNote: () => void
}

export function KnowledgeHeader({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onAddLoop,
  onAddCampaign,
  onAddQuest,
  onAddOp,
  onAddNote,
}: KnowledgeHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Title and Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Wiedza</h1>
          <p className="text-muted-foreground">
            Zarzadzaj swoimi obszarami, kampaniami, questami i notatkami
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Dodaj
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAddLoop}>
              <span className="mr-2">🔄</span> Nowy Loop
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddCampaign}>
              <span className="mr-2">🎯</span> Nowa Kampania
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddQuest}>
              <span className="mr-2">⚔️</span> Nowy Quest
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddOp}>
              <span className="mr-2">✅</span> Nowy Op
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddNote}>
              <span className="mr-2">📝</span> Nowa Notatka
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabs and Search */}
      <div className="flex items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          <Button
            variant={activeTab === 'hierarchy' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onTabChange('hierarchy')}
            className="gap-2"
          >
            <FolderTree className="h-4 w-4" />
            Hierarchia
          </Button>
          <Button
            variant={activeTab === 'notes' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onTabChange('notes')}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Notatki
          </Button>
          <Button
            variant={activeTab === 'documents' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onTabChange('documents')}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Dokumenty
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Szukaj..."
            className="pl-9"
          />
        </div>
      </div>
    </div>
  )
}
