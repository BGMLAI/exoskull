'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Loop } from '@/lib/types/knowledge'
import { ChevronRight, Target, Folder, FileText } from 'lucide-react'

export interface LoopCardProps {
  loop: Loop
  isSelected?: boolean
  onClick?: () => void
  onEdit?: () => void
  className?: string
}

export function LoopCard({ loop, isSelected, onClick, onEdit, className }: LoopCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
        isSelected && 'border-primary ring-2 ring-primary/20',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{loop.icon || '📁'}</span>
            <span className="text-base font-semibold">{loop.name}</span>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loop.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {loop.description}
          </p>
        )}

        {loop.stats && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              <span>{loop.stats.activeOps} ops</span>
            </div>
            <div className="flex items-center gap-1">
              <Folder className="h-3 w-3" />
              <span>{loop.stats.activeQuests} quests</span>
            </div>
            <div className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <span>{loop.stats.totalNotes} notes</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <Badge
            variant="outline"
            style={{ borderColor: loop.color || '#888', color: loop.color || '#888' }}
          >
            Priorytet: {loop.priority}
          </Badge>
          {loop.is_default && (
            <Badge variant="secondary" className="text-xs">
              Domyslna
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
