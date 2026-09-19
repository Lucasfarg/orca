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

// Matches an absolute or protocol-relative URL anywhere in a value.
const REMOTE_REFERENCE = /(?:\b(?:https?|wss?|ftp|file):|(?:^|[\s"'(,])\/\/)/i
// Why: an inline SVG needs `xmlns='http://…'`, which is text, not a fetch; drop data: URLs before matching.
const DATA_URL = /url\(\s*(["']?)\s*data:[\s\S]*?\1\s*\)|(["'])\s*data:[\s\S]*?\2/gi
// Why: allowlist — the URL parser normalizes too many spellings for a denylist to hold.
const RESOURCE_FUNCTION = /(?:^|[^\w-])(?:url|src)\(/i
// image-set() also takes bare strings, so a string surviving inside one is a reference.
const IMAGE_SET_STRING = /image-set\([^)]*["']/i

/** True when a value loads anything but an inline `data:` URL, even behind CSS escapes. */
export function loadsExternalCustomCssResource(value: string): boolean {
  const withoutDataUrls = decodeCssEscapes(value).replace(DATA_URL, '')
  if (RESOURCE_FUNCTION.test(withoutDataUrls) || IMAGE_SET_STRING.test(withoutDataUrls)) {
    return true
  }
  // Why: the URL parser drops ASCII tab/newline and folds `\` to `/`, so a scheme can hide outside url().
  return REMOTE_REFERENCE.test(withoutDataUrls.replace(/[\t\n\r]/g, '').replace(/\\/g, '/'))
}
