import { describe, expect, it } from 'vitest'
import { loadsExternalCustomCssResource } from './custom-css'

describe('loadsExternalCustomCssResource', () => {
  it('allows plain values and inline data: URLs', () => {
    expect(loadsExternalCustomCssResource('#1e1e2e')).toBe(false)
    expect(loadsExternalCustomCssResource('color-mix(in srgb, var(--foreground) 7%, #000)')).toBe(
      false
    )
    expect(loadsExternalCustomCssResource('url("data:image/png;base64,AAAA")')).toBe(false)
    expect(loadsExternalCustomCssResource('image-set(url("data:image/png;base64,AAAA") 1x)')).toBe(
      false
    )
    expect(
      loadsExternalCustomCssResource(
        `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>")`
      )
    ).toBe(false)
  })

  it('flags absolute and protocol-relative network URLs', () => {
    expect(loadsExternalCustomCssResource('url("https://example.com/a.png")')).toBe(true)
    expect(loadsExternalCustomCssResource('url(http://example.com/a.png) no-repeat')).toBe(true)
    expect(loadsExternalCustomCssResource('url(HTTPS://example.com/a.png)')).toBe(true)
    expect(loadsExternalCustomCssResource('url(//example.com/a.png)')).toBe(true)
    expect(loadsExternalCustomCssResource('image-set("//example.com/a.png" 1x)')).toBe(true)
    expect(
      loadsExternalCustomCssResource(
        'url("data:image/png;base64,AA"), url(https://example.com/b.png)'
      )
    ).toBe(true)
  })

  it('flags the spellings the URL parser normalizes back into a fetch', () => {
    // An escaped tab splits the scheme in the CSS text; Chromium strips it before resolving.
    expect(loadsExternalCustomCssResource('url("htt\\9 ps://example.com/beacon")')).toBe(true)
    expect(loadsExternalCustomCssResource('url(h\\74tps://example.com/a.png)')).toBe(true)
    expect(loadsExternalCustomCssResource('url(\\68 ttp://example.com)')).toBe(true)
    // The parser folds `\` to `/`, so a UNC path is a file://server/share fetch.
    expect(loadsExternalCustomCssResource('url(\\\\server\\share\\x.png)')).toBe(true)
    expect(loadsExternalCustomCssResource('@import "htt\\9 ps://example.com/a.css";')).toBe(true)
  })

  it('flags references that resolve against the document, including file://', () => {
    expect(loadsExternalCustomCssResource('url(file://server/share/x.png)')).toBe(true)
    expect(loadsExternalCustomCssResource('url(/abs.png)')).toBe(true)
    expect(loadsExternalCustomCssResource('url(rel.png)')).toBe(true)
    expect(loadsExternalCustomCssResource('url(wallpaper.png)')).toBe(true)
    expect(loadsExternalCustomCssResource('image-set("x.png" 1x)')).toBe(true)
    expect(loadsExternalCustomCssResource('src("fonts/x.woff2")')).toBe(true)
  })
})
