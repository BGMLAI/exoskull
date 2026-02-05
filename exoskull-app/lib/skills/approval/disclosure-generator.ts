// =====================================================
// DISCLOSURE GENERATOR - Human-readable capability summary
// Explains what a generated skill will do before approval
// =====================================================

import { SkillCapabilities, SkillRiskLevel, GeneratedSkill } from "../types";

/**
 * Generate a human-readable disclosure message for skill approval.
 * This is sent to the user via SMS/email before they approve.
 */
export function generateDisclosure(skill: {
  name: string;
  slug: string;
  description: string | null;
  capabilities: SkillCapabilities;
  risk_level: SkillRiskLevel;
}): { summary: string; details: Record<string, unknown> } {
  const lines: string[] = [];

  lines.push(`Nowy skill "${skill.name}" chce:`);

  // Database access
  if (skill.capabilities.database.includes("read")) {
    const tables = skill.capabilities.tables.join(", ") || "exo_mod_data";
    lines.push(`- CZYTAC z: ${tables}`);
  }

  if (skill.capabilities.database.includes("write")) {
    const tables = skill.capabilities.tables.join(", ") || "exo_mod_data";
    lines.push(`- ZAPISYWAC do: ${tables}`);
  }

  // Notifications
  if (skill.capabilities.notifications) {
    lines.push("- WYSYLAC powiadomienia");
  }

  // External API
  if (skill.capabilities.externalApi) {
    lines.push("- LACZYC SIE z zewnetrznymi API (UWAGA!)");
  }

  // Risk level
  const riskLabels: Record<SkillRiskLevel, string> = {
    low: "NISKI (tylko odczyt)",
    medium: "SREDNI (odczyt + zapis)",
    high: "WYSOKI (wymaga szczegolnej uwagi)",
  };
  lines.push(`Ryzyko: ${riskLabels[skill.risk_level]}`);

  const summary = lines.join("\n");

  return {
    summary,
    details: {
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      capabilities: skill.capabilities,
      risk_level: skill.risk_level,
      tables_accessed: skill.capabilities.tables,
    },
  };
}

/**
 * Format disclosure for SMS (short version)
 */
export function formatDisclosureForSms(
  disclosure: { summary: string },
  confirmationCode: string,
): string {
  return `[ExoSkull] ${disclosure.summary}\n\nKod: ${confirmationCode}\nOdpisz "${confirmationCode}" aby zatwierdzic lub "REJECT" aby odrzucic.`;
}

/**
 * Format disclosure for email (detailed version)
 */
export function formatDisclosureForEmail(
  skill: GeneratedSkill,
  disclosure: { summary: string; details: Record<string, unknown> },
  confirmationCode: string,
): { subject: string; body: string } {
  return {
    subject: `[ExoSkull] Nowy skill do zatwierdzenia: ${skill.name}`,
    body: `${disclosure.summary}

Opis: ${skill.description || "Brak opisu"}
Wersja: ${skill.version}
Wygenerowany przez: ${skill.generated_by}

Kod potwierdzenia: ${confirmationCode}

Aby zatwierdzic, odpowiedz na ten email z kodem: ${confirmationCode}
Aby odrzucic, odpowiedz: REJECT

Kod wygasa za 24 godziny.`,
  };
}
