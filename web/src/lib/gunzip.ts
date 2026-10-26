/** Some servers send .gz files with Content-Encoding: gzip (the browser has then unpacked them), others don't. */
export async function gunzip(res: Response): Promise<ArrayBuffer> {
  const buf = await res.arrayBuffer()
  const b = new Uint8Array(buf, 0, 2)
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
}
