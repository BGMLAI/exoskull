"use client";

/**
 * NodeDetailPanel — Slide-in panel showing full details of a selected mind map node.
 */

import { X, ChevronRight, Tag, Calendar, BarChart3 } from "lucide-react";
import type { MindMapNode } from "@/lib/mindmap/graph-converter";

interface NodeDetailPanelProps {
  node: MindMapNode | null;
  onClose: () => void;
}

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  if (!node) return null;

  const statusColors: Record<string, string> = {
    active: "text-green-400 bg-green-900/20 border-green-800/30",
    paused: "text-yellow-400 bg-yellow-900/20 border-yellow-800/30",
    completed: "text-cyan-400 bg-cyan-900/20 border-cyan-800/30",
    abandoned: "text-red-400 bg-red-900/20 border-red-800/30",
  };

  return (
    <div className="absolute top-0 right-0 w-72 h-full bg-[#0a0a1a]/95 backdrop-blur-md border-l border-cyan-900/30 z-30 flex flex-col shadow-2xl shadow-black/40">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-cyan-900/20">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-wider mb-1">
            {node.type}
          </div>
          <h3 className="text-sm font-medium text-white truncate">
            {node.name}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-white transition-colors ml-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 chat-scroll">
        {/* Status */}
        {node.status && (
          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
              Status
            </label>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${statusColors[node.status] || "text-slate-400 bg-slate-900/20 border-slate-800/30"}`}
            >
              {node.status}
            </span>
          </div>
        )}

        {/* Description */}
        {node.description && (
          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
              Opis
            </label>
            <p className="text-xs text-slate-300 leading-relaxed">
              {node.description}
            </p>
          </div>
        )}

        {/* Progress */}
        {node.progress !== undefined && node.progress > 0 && (
          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
              <BarChart3 className="w-3 h-3 inline mr-1" />
              Postep
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, node.progress)}%` }}
                />
              </div>
              <span className="text-[11px] text-cyan-400 font-mono">
                {Math.round(node.progress)}%
              </span>
            </div>
          </div>
        )}

        {/* Tags */}
        {node.tags && node.tags.length > 0 && (
          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
              <Tag className="w-3 h-3 inline mr-1" />
              Tagi
            </label>
            <div className="flex flex-wrap gap-1">
              {node.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[10px] bg-cyan-900/20 text-cyan-400 border border-cyan-800/20 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Visual type */}
        <div>
          <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
            Typ wizualizacji
          </label>
          <span className="text-xs text-slate-300">
            {node.visualType || "orb"}
          </span>
        </div>

        {/* Depth */}
        <div>
          <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
            Poziom glebokosci
          </label>
          <span className="text-xs text-slate-300">{node.depth}</span>
        </div>

        {/* Color indicator */}
        <div>
          <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1.5">
            Kolor
          </label>
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border border-white/10"
              style={{ backgroundColor: node.color }}
            />
            <span className="text-xs text-slate-400 font-mono">
              {node.color}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
