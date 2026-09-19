import { describe, expect, it } from 'vitest'
import { isRemoteCustomCssValue } from './custom-css'

describe('isRemoteCustomCssValue', () => {
  it('allows plain colors, local data URLs and relative references', () => {
    expect(isRemoteCustomCssValue('#1e1e2e')).toBe(false)
    expect(isRemoteCustomCssValue('color-mix(in srgb, var(--foreground) 7%, #000)')).toBe(false)
    expect(isRemoteCustomCssValue('url("data:image/png;base64,AAAA")')).toBe(false)
    expect(isRemoteCustomCssValue('url(wallpaper.png)')).toBe(false)
    expect(
      isRemoteCustomCssValue(`url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>")`)
    ).toBe(false)
  })

  it('flags absolute and protocol-relative network URLs', () => {
    expect(isRemoteCustomCssValue('url("https://example.com/a.png")')).toBe(true)
    expect(isRemoteCustomCssValue('url(http://example.com/a.png) no-repeat')).toBe(true)
    expect(isRemoteCustomCssValue('url(//example.com/a.png)')).toBe(true)
    expect(isRemoteCustomCssValue('image-set("//example.com/a.png" 1x)')).toBe(true)
    expect(
      isRemoteCustomCssValue('url("data:image/png;base64,AA"), url(https://example.com/b.png)')
    ).toBe(true)
  })

  it('sees through CSS escapes', () => {
    expect(isRemoteCustomCssValue('url(h\\74tps://example.com/a.png)')).toBe(true)
    expect(isRemoteCustomCssValue('url(\\68 ttp://example.com)')).toBe(true)
  })
})
