"use client";

import type { StreamEvent, RichContentEventData } from "@/lib/stream/types";
import { RichContentCard, type RichCardData } from "../RichContentCard";

interface RichContentEventProps {
  event: StreamEvent;
}

export function RichContentEvent({ event }: RichContentEventProps) {
  const data = event.data as RichContentEventData;

  const cardData = toCardData(data);
  if (!cardData) return null;

  return (
    <div className="animate-in fade-in duration-200 max-w-[95%]">
      <RichContentCard data={cardData} />
    </div>
  );
}

function toCardData(data: RichContentEventData): RichCardData | null {
  switch (data.contentType) {
    case "image":
      if (!data.imageUrl) return null;
      return {
        type: "image",
        imageUrl: data.imageUrl,
        title: data.title,
        caption: data.caption,
        alt: data.alt,
      };
    case "article":
      if (!data.url) return null;
      return {
        type: "article",
        url: data.url,
        title: data.title,
        favicon: data.favicon,
        snippet: data.snippet,
        siteName: data.siteName,
        thumbnailUrl: data.thumbnailUrl,
      };
    case "code":
      if (!data.code) return null;
      return {
        type: "code",
        code: data.code,
        title: data.title,
        language: data.language,
      };
    case "model3d":
      if (!data.modelUrl) return null;
      return {
        type: "model3d",
        modelUrl: data.modelUrl,
        title: data.title,
        thumbnailUrl: data.thumbnailUrl,
      };
    default:
      return null;
  }
}
