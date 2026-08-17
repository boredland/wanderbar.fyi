import { describe, expect, it } from 'vitest'
import { centreValue, maxValue, readFloatRaster } from './geotiff'

/**
 * Builds a TIFF in the shape EFFIS actually serves: little-endian, one strip,
 * uncompressed 32-bit floats, one sample per pixel.
 */
function tiff(
  values: number[],
  width: number,
  height: number,
  over: {
    sampleFormat?: number
    bitsPerSample?: number
    compression?: number
    samplesPerPixel?: number
    magic?: number
    big?: boolean
  } = {}
): ArrayBuffer {
  const tags: [number, number, number][] = [
    [256, 3, width],
    [257, 3, height],
    [258, 3, over.bitsPerSample ?? 32],
    [259, 3, over.compression ?? 1],
    [277, 3, over.samplesPerPixel ?? 1],
    [278, 3, height],
    [339, 3, over.sampleFormat ?? 3],
    [273, 4, 0],
    [279, 4, values.length * 4]
  ]
  const ifdAt = 8
  const dataAt = ifdAt + 2 + tags.length * 12 + 4
  const buf = new ArrayBuffer(dataAt + values.length * 4)
  const view = new DataView(buf)
  const le = !over.big

  view.setUint16(0, over.magic ?? (le ? 0x4949 : 0x4d4d), le)
  view.setUint16(2, 42, le)
  view.setUint32(4, ifdAt, le)
  view.setUint16(ifdAt, tags.length, le)

  tags.forEach(([tag, type, value], i) => {
    const at = ifdAt + 2 + i * 12
    view.setUint16(at, tag, le)
    view.setUint16(at + 2, type, le)
    view.setUint32(at + 4, 1, le)
    // Shorts sit in the first two bytes of the value field; longs fill it.
    if (type === 3) view.setUint16(at + 8, tag === 273 ? dataAt : value, le)
    else view.setUint32(at + 8, tag === 273 ? dataAt : value, le)
  })

  values.forEach((v, i) => view.setFloat32(dataAt + i * 4, v, le))
  return buf
}

describe('readFloatRaster', () => {
  it('reads the samples a WMS float raster carries', () => {
    const r = readFloatRaster(tiff([1.5, 2.5, 3.5, 4.5], 2, 2))
    expect(r?.width).toBe(2)
    expect(r?.height).toBe(2)
    expect(Array.from(r?.values ?? [])).toEqual([1.5, 2.5, 3.5, 4.5])
  })

  it('reads big-endian files too, since the byte order is the file\'s to choose', () => {
    const r = readFloatRaster(tiff([7.25], 1, 1, { big: true }))
    expect(Array.from(r?.values ?? [])).toEqual([7.25])
  })

  /**
   * The refusals matter more than the reads. A misparsed header would hand back
   * plausible numbers that mean nothing, and a caller reporting a hazard cannot
   * tell those from real ones, so anything unexpected must read as no data.
   */
  it('refuses anything that is not an uncompressed single-band float raster', () => {
    expect(readFloatRaster(tiff([1], 1, 1, { sampleFormat: 1 }))).toBeNull()
    expect(readFloatRaster(tiff([1], 1, 1, { bitsPerSample: 16 }))).toBeNull()
    expect(readFloatRaster(tiff([1], 1, 1, { compression: 5 }))).toBeNull()
    expect(readFloatRaster(tiff([1], 1, 1, { samplesPerPixel: 3 }))).toBeNull()
    expect(readFloatRaster(tiff([1], 1, 1, { magic: 0x1234 }))).toBeNull()
  })

  it('refuses an HTML error page served with a 200', () => {
    const html = new TextEncoder().encode('<html>gateway timeout</html>')
    expect(readFloatRaster(html.buffer as ArrayBuffer)).toBeNull()
  })

  it('refuses a truncated file rather than padding it with zeroes', () => {
    // Trailing zeroes would read as a real measurement of nothing.
    const full = tiff([1, 2, 3, 4], 2, 2)
    expect(readFloatRaster(full.slice(0, full.byteLength - 8))).toBeNull()
    expect(readFloatRaster(new ArrayBuffer(4))).toBeNull()
  })
})

describe('sampling', () => {
  it('takes the middle pixel, which is the point the caller asked about', () => {
    const r = readFloatRaster(tiff([1, 2, 3, 4, 9, 6, 7, 8, 9], 3, 3))
    expect(r && centreValue(r)).toBe(9)
  })

  it('takes the worst cell anywhere for a whole route', () => {
    const r = readFloatRaster(tiff([1, 2, 3, 4], 2, 2))
    expect(r && maxValue(r)).toBe(4)
  })
})
