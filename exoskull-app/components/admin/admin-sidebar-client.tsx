"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ThemeSwitcher } from "./theme-switcher";

interface AdminSidebarClientProps {
  type: "logo" | "theme-switcher";
}

export function AdminSidebarClient({ type }: AdminSidebarClientProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (type === "theme-switcher") {
    return <ThemeSwitcher />;
  }

  // Logo - show appropriate variant based on theme
  const isDark = mounted && resolvedTheme !== "xo-minimal";
  const logoSrc = isDark ? "/logo-dark.svg" : "/logo.svg";

  return (
    <div className="w-8 h-8 shrink-0">
      {mounted ? (
        <Image
          src={logoSrc}
          alt="ExoSkull"
          width={32}
          height={32}
          className="w-8 h-8"
        />
      ) : (
        <div className="w-8 h-8 rounded-md bg-muted animate-pulse" />
      )}
    </div>
  );
}
