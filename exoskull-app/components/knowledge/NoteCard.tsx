"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Note, NOTE_TYPE_LABELS } from "@/lib/types/knowledge";
import {
  BookOpen,
  Calendar,
  FlaskConical,
  MoreHorizontal,
  Tag,
} from "lucide-react";

interface NoteCardProps {
  note: Note;
  isSelected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  className?: string;
}

export function NoteCard({
  note,
  isSelected,
  onClick,
  onEdit,
  className,
}: NoteCardProps) {
  const typeInfo = NOTE_TYPE_LABELS[note.type];

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
        isSelected && "border-primary ring-2 ring-primary/20",
        className,
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xl flex-shrink-0">{typeInfo.icon}</span>
            <CardTitle className="text-base font-semibold truncate">
              {note.title || "Bez tytulu"}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge variant="secondary" className="text-xs">
              {typeInfo.label}
            </Badge>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label="Edytuj notatke"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Content preview or AI summary */}
        {(note.ai_summary || note.content) && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {note.ai_summary || note.content}
          </p>
        )}

        {/* Research/Experience badges */}
        {(note.is_research || note.is_experience) && (
          <div className="flex gap-2 mb-3">
            {note.is_research && (
              <Badge variant="outline" className="text-xs">
                <FlaskConical className="h-3 w-3 mr-1" />
                Research
              </Badge>
            )}
            {note.is_experience && (
              <Badge variant="outline" className="text-xs">
                <BookOpen className="h-3 w-3 mr-1" />
                Doswiadczenie
              </Badge>
            )}
          </div>
        )}

        {/* Tags */}
        {note.tags && note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {note.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                <Tag className="h-2 w-2 mr-1" />
                {tag}
              </Badge>
            ))}
            {note.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{note.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* AI tags if available */}
        {note.ai_tags && note.ai_tags.length > 0 && !note.tags?.length && (
          <div className="flex flex-wrap gap-1 mb-3">
            {note.ai_tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs opacity-70"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>
              {new Date(note.captured_at).toLocaleDateString("pl-PL")}
            </span>
          </div>
          {note.ai_category && (
            <Badge variant="secondary" className="text-xs opacity-70">
              {note.ai_category}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
