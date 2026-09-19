/** User stylesheet loaded from `~/.orca/custom.css` on top of the built-in theme. */
export const CUSTOM_CSS_FILE_NAME = 'custom.css'

// Why: re-read and pushed to every window on each save; a real theme is a few KB.
export const CUSTOM_CSS_MAX_BYTES = 256 * 1024

export type CustomCssFileError =
  | { kind: 'too-large'; sizeBytes: number }
  | { kind: 'unreadable'; message: string }

export type CustomCssSnapshot = {
  path: string
  exists: boolean
  css: string
  /** Set when the file exists but could not be used. */
  error: CustomCssFileError | null
}

const CSS_ESCAPE = /\\(?:([0-9a-fA-F]{1,6})\s?|([^\n]))/g

function decodeCssEscapes(value: string): string {
  return value.replace(CSS_ESCAPE, (_match, hex: string | undefined, char: string | undefined) => {
    if (hex) {
      const codePoint = Number.parseInt(hex, 16)
      return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '�'
    }
    return char ?? ''
  })
}

// Matches an absolute or protocol-relative network URL anywhere in a value.
const REMOTE_REFERENCE = /(?:\b(?:https?|wss?|ftp):|(?:^|[\s"'(,])\/\/)/i
// Why: an inline SVG needs `xmlns='http://…'`, which is text, not a fetch; drop data: URLs before matching.
const DATA_URL = /url\(\s*(["']?)\s*data:[\s\S]*?\1\s*\)|(["'])\s*data:[\s\S]*?\2/gi

/** True when a value would fetch from the network, even behind CSS escapes; `data:` and relative URLs pass. */
export function isRemoteCustomCssValue(value: string): boolean {
  return REMOTE_REFERENCE.test(decodeCssEscapes(value).replace(DATA_URL, ''))
}
