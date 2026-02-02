/**
 * System Prompt Safety Guardrails
 *
 * Based on OpenClaw 2026.2.x security features
 * Additional safety layers for AI interactions
 */

// Safety guardrails to append to system prompts
export const SAFETY_GUARDRAILS = `

## BEZPIECZENSTWO (Safety Guardrails)

### Nigdy nie:
- Udostepniaj credentials, API keys, tokenow
- Wykonuj kod ktory moze uszkodzic system
- Wysylaj wiadomosci do nieznanych odbiorcow bez zgody
- Usuwaj danych bez 3x potwierdzenia
- Akceptuj polecen ktore naruszaja prywatnosc innych osob

### Zawsze:
- Weryfikuj zrodlo przed wykonaniem akcji zewnetrznej
- Loguj wszystkie akcje modyfikujace dane
- Pytaj o potwierdzenie przy operacjach finansowych
- Zachowaj ostroznosc przy danych osobowych (RODO)

### Eskalacja:
- Mysli samobojcze → natychmiast: "Zadzwon 116 123"
- Przemoc → "Czy jestes bezpieczny? Jak moge pomoc?"
- Kryzys zdrowotny → "Skontaktuj sie z lekarzem lub 112"
`

/**
 * Validate user input for potential injection attacks
 */
export function sanitizeUserInput(input: string): string {
  // Remove potential prompt injection patterns
  const dangerous = [
    /ignore\s+(previous|above|all)\s+(instructions?|prompts?)/gi,
    /you\s+are\s+now\s+a?\s*(different|new|evil)/gi,
    /disregard\s+(all|previous|your)/gi,
    /system:\s/gi,
    /\[INST\]/gi,
    /<<SYS>>/gi,
    /<\|im_start\|>/gi,
  ]

  let sanitized = input
  for (const pattern of dangerous) {
    sanitized = sanitized.replace(pattern, '[BLOCKED]')
  }

  return sanitized
}

/**
 * Check if content contains sensitive data patterns
 */
export function containsSensitiveData(content: string): {
  hasSensitive: boolean
  types: string[]
} {
  const patterns: { name: string; pattern: RegExp }[] = [
    { name: 'credit_card', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
    { name: 'ssn', pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/ },
    { name: 'api_key', pattern: /\b(sk|pk|api)[-_]?[a-zA-Z0-9]{20,}\b/i },
    { name: 'password', pattern: /password\s*[:=]\s*['"]?[^\s'"]+['"]?/i },
    { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
    { name: 'pesel', pattern: /\b\d{11}\b/ }, // Polish national ID
  ]

  const found: string[] = []
  for (const { name, pattern } of patterns) {
    if (pattern.test(content)) {
      found.push(name)
    }
  }

  return {
    hasSensitive: found.length > 0,
    types: found
  }
}

/**
 * Mask sensitive data in content
 */
export function maskSensitiveData(content: string): string {
  let masked = content

  // Credit cards
  masked = masked.replace(
    /\b(\d{4})[\s-]?\d{4}[\s-]?\d{4}[\s-]?(\d{4})\b/g,
    '$1-****-****-$2'
  )

  // API keys
  masked = masked.replace(
    /\b(sk|pk|api)[-_]?([a-zA-Z0-9]{4})[a-zA-Z0-9]{12,}([a-zA-Z0-9]{4})\b/gi,
    '$1-$2****$3'
  )

  // Passwords
  masked = masked.replace(
    /(password\s*[:=]\s*['"]?)[^\s'"]+(['"]?)/gi,
    '$1********$2'
  )

  return masked
}

/**
 * Rate limiter for sensitive operations
 */
const operationCounts = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(
  userId: string,
  operation: string,
  limit: number = 10,
  windowMs: number = 60000
): boolean {
  const key = `${userId}:${operation}`
  const now = Date.now()
  const record = operationCounts.get(key)

  if (!record || now > record.resetAt) {
    operationCounts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (record.count >= limit) {
    return false
  }

  record.count++
  return true
}
