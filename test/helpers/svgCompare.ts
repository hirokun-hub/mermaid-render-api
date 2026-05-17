/**
 * requestId 由来の mermaid root id を正規化する。
 * 別 requestId で発行した 2 リクエストの SVG を "scale 以外の差分がない" 観点で比較するために使用する。
 * Mermaid 11.15.0 + dagre-wrapper で確認した範囲では、requestId 由来の id は root svg のみ。
 */
export function normalizeSvgForCompare(svg: string): string {
  return svg
    .replace(/id="mermaid-[0-9a-f-]+"/g, 'id="mermaid-NORMALIZED"')
    .replace(/aria-roledescription="mermaid-[^"]+"/g, 'aria-roledescription="mermaid-NORMALIZED"')
}

/** SVG の viewBox 幅を返す。viewBox="x y w h" の w を返す。 */
export function parseSvgViewBoxWidth(svg: string): number {
  const match = /viewBox="[^\s"]+ [^\s"]+ ([^\s"]+)/.exec(svg)
  if (!match) throw new Error('viewBox not found in SVG')
  return parseFloat(match[1])
}

/** PNG バッファから幅を読む (IHDR チャンク offset 16, 4 bytes big-endian) */
export function readPngWidth(buf: Buffer): number {
  return buf.readUInt32BE(16)
}
