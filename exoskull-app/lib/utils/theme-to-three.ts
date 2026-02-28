import * as THREE from "three";

/**
 * Converts a CSS color value (hex, hsl(), rgb(), var()) to a THREE.Color.
 * Falls back to #000000 if parsing fails.
 */
export function cssToThreeColor(cssValue: string): THREE.Color {
  try {
    // If it's a CSS variable, resolve it from the DOM
    if (cssValue.startsWith("var(")) {
      if (typeof document === "undefined") return new THREE.Color("#000000");
      const varName = cssValue.replace(/var\(|\)/g, "").trim();
      const resolved = getComputedStyle(document.documentElement)
        .getPropertyValue(varName)
        .trim();
      if (!resolved) return new THREE.Color("#000000");
      return cssToThreeColor(resolved);
    }

    // HSL format: "220 14% 10%" or "hsl(220, 14%, 10%)"
    if (/^\d+\s+\d+%?\s+\d+%?$/.test(cssValue.trim())) {
      const [h, s, l] = cssValue
        .trim()
        .split(/\s+/)
        .map((v) => parseFloat(v));
      return new THREE.Color().setHSL(h / 360, s / 100, l / 100);
    }

    // Standard formats (hex, rgb, hsl) — THREE.Color handles these
    return new THREE.Color(cssValue);
  } catch {
    return new THREE.Color("#000000");
  }
}

/**
 * Get the current theme's primary color as THREE.Color.
 */
export function getThemePrimary(): THREE.Color {
  return cssToThreeColor("var(--primary)");
}

/**
 * Get the current theme's background color as THREE.Color.
 */
export function getThemeBackground(): THREE.Color {
  return cssToThreeColor("var(--background)");
}
