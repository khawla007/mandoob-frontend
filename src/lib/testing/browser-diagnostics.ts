const SENSITIVE_KEY = String.raw`(?:token|password|secret|api[-_ ]?key|client[-_ ]?secret|service[-_ ]?role[-_ ]?key|private[-_ ]?key|secret[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|cookie|session(?:[-_ ]?(?:id|token))?|authorization)`;
const ENCODED_SEPARATOR = String.raw`(?:_|-|%5f|%2d)`;
const ENCODED_KEY = String.raw`(?:token|password|secret|api${ENCODED_SEPARATOR}?key|client${ENCODED_SEPARATOR}?secret|service${ENCODED_SEPARATOR}?role${ENCODED_SEPARATOR}?key|private${ENCODED_SEPARATOR}?key|secret${ENCODED_SEPARATOR}?key|(?:access|refresh|id)${ENCODED_SEPARATOR}?token|cookie|session(?:${ENCODED_SEPARATOR}?(?:id|token))?|authorization)`;

export function sanitizeBrowserDiagnostic(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/\bauthorization\s*:\s*[^\r\n]+/gi, 'Authorization: [REDACTED]')
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
    .replace(new RegExp(`(${ENCODED_KEY})(%3d|%3a)(?:(?!%26|\\s).)+`, 'gi'), '$1$2[REDACTED]')
    .slice(0, 500);
}
