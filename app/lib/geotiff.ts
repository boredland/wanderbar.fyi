/**
 * Just enough TIFF to read numbers out of a WMS raster.
 *
 * EFFIS publishes its gridded products as map layers, not as an API: there is
 * no JSON endpoint that will tell you the value at a point. What it will do is
 * render a GetMap in `image/tiff`, and for these layers that is an
 * uncompressed 32-bit float raster, one sample per pixel, i.e. the model values
 * themselves rather than a picture of them.
 *
 * So this reads the handful of tags needed to find the samples and stops. It is
 * not a TIFF library and must not become one: anything it does not understand
 * is rejected outright, because a misread header would hand back a plausible
 * number that means nothing, and the caller cannot tell those apart.
 */

export type Raster = {
  width: number
  height: number
  /** Row-major, top-left origin, `width * height` samples. */
  values: Float32Array
}

const TAG_WIDTH = 256
const TAG_HEIGHT = 257
const TAG_BITS_PER_SAMPLE = 258
const TAG_COMPRESSION = 259
const TAG_STRIP_OFFSETS = 273
const TAG_SAMPLES_PER_PIXEL = 277
const TAG_ROWS_PER_STRIP = 278
const TAG_STRIP_BYTE_COUNTS = 279
const TAG_SAMPLE_FORMAT = 339

const TYPE_SHORT = 3
const TYPE_LONG = 4

const SAMPLE_FORMAT_IEEE_FLOAT = 3
const COMPRESSION_NONE = 1

/**
 * Reads a single-band float raster, or null if the bytes are anything else.
 *
 * Null rather than a throw: every caller is reporting a hazard, and a raster
 * that cannot be read is a missing reading, not an exception to handle. It is
 * also the shape a failed fetch already takes, so both non-answers look alike.
 */
export function readFloatRaster(buffer: ArrayBuffer): Raster | null {
  if (buffer.byteLength < 8) return null
  const view = new DataView(buffer)

  const magic = view.getUint16(0, true)
  // 'II' little-endian or 'MM' big-endian; anything else is not a TIFF.
  const le = magic === 0x4949
  if (!le && magic !== 0x4d4d) return null
  if (view.getUint16(2, le) !== 42) return null

  const ifdOffset = view.getUint32(4, le)
  if (ifdOffset + 2 > buffer.byteLength) return null
  const count = view.getUint16(ifdOffset, le)

  const tags = new Map<number, { type: number; count: number; inlineAt: number; pointer: number }>()
  for (let i = 0; i < count; i++) {
    const at = ifdOffset + 2 + i * 12
    if (at + 12 > buffer.byteLength) return null
    tags.set(view.getUint16(at, le), {
      type: view.getUint16(at + 2, le),
      count: view.getUint32(at + 4, le),
      inlineAt: at + 8,
      pointer: view.getUint32(at + 8, le)
    })
  }

  const scalar = (tag: number): number | null => {
    const t = tags.get(tag)
    if (!t || t.count < 1) return null
    if (t.type === TYPE_SHORT) return view.getUint16(t.inlineAt, le)
    if (t.type === TYPE_LONG) return view.getUint32(t.inlineAt, le)
    return null
  }

  const list = (tag: number): number[] => {
    const t = tags.get(tag)
    if (!t) return []
    const size = t.type === TYPE_SHORT ? 2 : t.type === TYPE_LONG ? 4 : 0
    if (size === 0) return []
    // Four bytes or fewer live in the entry; more are addressed by a pointer.
    const base = t.count * size <= 4 ? t.inlineAt : t.pointer
    const out: number[] = []
    for (let i = 0; i < t.count; i++) {
      const at = base + i * size
      if (at + size > buffer.byteLength) return []
      out.push(t.type === TYPE_SHORT ? view.getUint16(at, le) : view.getUint32(at, le))
    }
    return out
  }

  const width = scalar(TAG_WIDTH)
  const height = scalar(TAG_HEIGHT)
  if (!width || !height) return null

  /*
   * Everything below is a refusal rather than an accommodation. These layers
   * are served as uncompressed single-band float32 today; if that ever changes
   * the right answer is no reading at all, because guessing at a packed or
   * palette image would produce numbers that look like flash densities.
   */
  if (scalar(TAG_SAMPLE_FORMAT) !== SAMPLE_FORMAT_IEEE_FLOAT) return null
  if (scalar(TAG_BITS_PER_SAMPLE) !== 32) return null
  if ((scalar(TAG_SAMPLES_PER_PIXEL) ?? 1) !== 1) return null
  if ((scalar(TAG_COMPRESSION) ?? COMPRESSION_NONE) !== COMPRESSION_NONE) return null

  const offsets = list(TAG_STRIP_OFFSETS)
  const byteCounts = list(TAG_STRIP_BYTE_COUNTS)
  if (offsets.length === 0 || offsets.length !== byteCounts.length) return null

  const rowsPerStrip = scalar(TAG_ROWS_PER_STRIP) ?? height
  if (rowsPerStrip < 1) return null

  /*
   * The header is not to be trusted about size. A malformed or hostile
   * response can claim 65535x65535, and allocating on that word alone throws
   * on a phone; the samples have to actually be present in the bytes received.
   */
  const total = width * height
  if (!Number.isSafeInteger(total) || total < 1) return null
  if (total * 4 > buffer.byteLength) return null

  const values = new Float32Array(total)
  let written = 0
  for (let s = 0; s < offsets.length; s++) {
    const start = offsets[s]
    const bytes = byteCounts[s]
    if (start < 0 || bytes < 0 || start + bytes > buffer.byteLength) return null
    /*
     * Strips are placed by row, not appended end to end. Writing them
     * consecutively would still fill the array when a strip carries padding,
     * but every later row would be shifted sideways: a plausible raster of
     * numbers taken from the wrong places.
     */
    const firstRow = s * rowsPerStrip
    if (firstRow >= height) break
    const rows = Math.min(rowsPerStrip, height - firstRow)
    if (bytes < rows * width * 4) return null
    for (let r = 0; r < rows; r++) {
      const rowAt = start + r * width * 4
      const out = (firstRow + r) * width
      for (let c = 0; c < width; c++) {
        values[out + c] = view.getFloat32(rowAt + c * 4, le)
      }
      written += width
    }
  }
  // A short read would leave trailing zeroes, which read as a real measurement
  // of nothing rather than as missing data.
  if (written !== total) return null

  return { width, height, values }
}

/**
 * The value at the centre of the raster.
 *
 * Callers ask for a small window around a point, and this takes the middle of
 * it. Sampling a 1x1 window instead would seem more direct and does not work:
 * the service returns 0 for a single-pixel GetMap even where a 3x3 over the
 * same box returns a real value, so the window has to have some extent and the
 * centre is the pixel the caller actually asked about.
 */
export function centreValue(raster: Raster): number | null {
  if (raster.width < 1 || raster.height < 1) return null
  const x = raster.width >> 1
  const y = raster.height >> 1
  const v = raster.values[y * raster.width + x]
  return Number.isFinite(v) ? v : null
}

/** The largest sample anywhere in the raster, for "worst along this stretch". */
export function maxValue(raster: Raster): number | null {
  let best = -Infinity
  for (const v of raster.values) {
    if (Number.isFinite(v) && v > best) best = v
  }
  return best === -Infinity ? null : best
}
