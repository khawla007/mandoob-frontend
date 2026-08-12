const SENSITIVE_KEY = String.raw`(?:token|password|secret|api[-_ ]?key|service[-_ ]?role[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|cookie|session(?:[-_ ]?(?:id|token))?|authorization)`;
const ENCODED_TOKEN_KEY = String.raw`(?:access|refresh|id)(?:_|%5f)token`;

export function sanitizeBrowserDiagnostic(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/\bauthorization\s*:\s*(?:basic|bearer)?\s*[^\s,;]+/gi, 'Authorization: [REDACTED]')
    .replace(/\b(?:set-)?cookie\s*:\s*[^\r\n]+/gi, 'Cookie: [REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      new RegExp(`("${SENSITIVE_KEY}"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, 'gi'),
      '$1"[REDACTED]"',
    )
    .replace(
      new RegExp(`('${SENSITIVE_KEY}'\\s*:\\s*)'(?:\\\\.|[^'\\\\])*'`, 'gi'),
      "$1'[REDACTED]'",
    )
    .replace(new RegExp(`\\b(${SENSITIVE_KEY})(\\s*[:=]\\s*)([^\\s&,;]+)`, 'gi'), '$1$2[REDACTED]')
    .replace(new RegExp(`(${ENCODED_TOKEN_KEY})(%3d|%3a)(?:(?!%26|\\s).)+`, 'gi'), '$1$2[REDACTED]')
    .slice(0, 500);
}
