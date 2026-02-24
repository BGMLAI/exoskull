"use client";

import { useEffect, useState } from "react";

interface Platform {
  os: string;
  label: string;
  icon: string;
  fileName: string;
  size: string;
  note: string;
}

function detectOS(): string {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "windows";
}

const DOWNLOAD_BASE =
  "https://github.com/BGMLAI/exoskull/releases/latest/download";

export function DownloadButton({
  platforms,
}: {
  platforms: readonly Platform[];
}) {
  const [detectedOS, setDetectedOS] = useState<string>("windows");
  const [clicked, setClicked] = useState(false);

  useEffect(() => {
    setDetectedOS(detectOS());
  }, []);

  const platform = platforms.find((p) => p.os === detectedOS) || platforms[0];
  const downloadUrl = `${DOWNLOAD_BASE}/${platform.fileName}`;

  const handleClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 3000);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <a
        href={downloadUrl}
        onClick={handleClick}
        className="group relative inline-flex items-center gap-3 px-10 py-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-2xl text-lg font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40"
      >
        <span className="text-2xl">{platform.icon}</span>
        <span>
          {clicked ? "Pobieranie..." : `Pobierz dla ${platform.label}`}
        </span>
        <svg
          className="w-5 h-5 transition-transform group-hover:translate-y-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </a>

      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>v0.1.0</span>
        <span className="w-1 h-1 bg-slate-600 rounded-full" />
        <span>{platform.size}</span>
        <span className="w-1 h-1 bg-slate-600 rounded-full" />
        <span>{platform.note}</span>
      </div>

      {clicked && (
        <p className="text-sm text-blue-400 animate-pulse">
          Pobieranie rozpoczete. Sprawdz folder Pobrane.
        </p>
      )}
    </div>
  );
}
