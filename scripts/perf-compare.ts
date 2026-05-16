/**
 * Phase 6 / G-2: 性能 before/after 比較スクリプト (P-14).
 *
 * Validates: NFR-01 (単純 flowchart p50 ≤ 500ms ゲート判定), tasks.md §9 G-2.
 *
 * 使い方:
 *   npx tsx scripts/perf-compare.ts \
 *     --before=docs/perf/2026-05-16_before.json \
 *     --after=docs/perf/2026-05-16_after.json
 *
 * Markdown レポートを docs/perf/YYYY-MM-DD_compare.md に出力する。
 * 印象論を排除し、p50/p95/p99 の差分を絶対値とパーセントで残す。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, basename } from 'node:path'

interface ScenarioResult {
  scenario: 'simple' | 'complex'
  description: string
  concurrency: number
  iterations: number
  totalRequests: number
  successRate: number
  latency: { p50: number; p95: number; p99: number; min: number; max: number }
  errorBreakdown: Record<string, number>
}

interface RunReport {
  schemaVersion: 1
  capturedAt: string
  label: string
  target: string
  environment: { nodeVersion: string; platform: string; arch: string }
  baseline: { chromiumProcesses: number; targetRssKib: number | null }
  postRun: { chromiumProcesses: number; targetRssKib: number | null }
  scenarios: ScenarioResult[]
  nfr01SimpleP50Ms: number
  nfr01ThresholdMs: number
  nfr01Passed: boolean
}

interface CliArgs {
  before: string
  after: string
  outDir: string
  outName?: string
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { before: '', after: '', outDir: '' }
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue
    const [key, value] = raw.slice(2).split('=', 2)
    switch (key) {
      case 'before':
        out.before = value ?? ''
        break
      case 'after':
        out.after = value ?? ''
        break
      case 'out-dir':
        out.outDir = value ?? ''
        break
      case 'out-name':
        out.outName = value ?? ''
        break
    }
  }
  if (!out.before || !out.after) {
    throw new Error('--before=<json> --after=<json> は必須')
  }
  if (!out.outDir) {
    const here = dirname(fileURLToPath(import.meta.url))
    out.outDir = resolve(here, '..', 'docs', 'perf')
  }
  return out
}

async function loadReport(path: string): Promise<RunReport> {
  const text = await readFile(path, 'utf8')
  const parsed = JSON.parse(text) as RunReport
  if (parsed.schemaVersion !== 1) {
    throw new Error(`unsupported schemaVersion in ${path}: ${parsed.schemaVersion}`)
  }
  return parsed
}

function fmtMs(value: number): string {
  if (!Number.isFinite(value)) return 'n/a'
  return `${value.toFixed(1)}ms`
}

function diffMs(before: number, after: number): string {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 'n/a'
  const delta = after - before
  const sign = delta >= 0 ? '+' : '−'
  const pct = before === 0 ? Number.NaN : (delta / before) * 100
  const pctStr = Number.isFinite(pct) ? `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%` : 'n/a'
  return `${sign}${Math.abs(delta).toFixed(1)}ms (${pctStr})`
}

function fmtRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function fmtRss(kib: number | null): string {
  if (kib === null) return 'n/a'
  if (kib >= 1024 * 1024) return `${(kib / 1024 / 1024).toFixed(2)} GiB`
  if (kib >= 1024) return `${(kib / 1024).toFixed(1)} MiB`
  return `${kib} KiB`
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildMarkdown(before: RunReport, after: RunReport, beforePath: string, afterPath: string): string {
  const lines: string[] = []
  lines.push(`# 性能比較レポート: ${before.label} vs ${after.label}`)
  lines.push('')
  lines.push(`生成日時: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## 概要')
  lines.push('')
  lines.push(`- **before**: \`${basename(beforePath)}\` (label=${before.label}, target=${before.target})`)
  lines.push(`  - capturedAt: ${before.capturedAt}`)
  lines.push(
    `  - environment: Node ${before.environment.nodeVersion} ${before.environment.platform}/${before.environment.arch}`
  )
  lines.push(`- **after**: \`${basename(afterPath)}\` (label=${after.label}, target=${after.target})`)
  lines.push(`  - capturedAt: ${after.capturedAt}`)
  lines.push(
    `  - environment: Node ${after.environment.nodeVersion} ${after.environment.platform}/${after.environment.arch}`
  )
  lines.push('')

  // NFR-01 ゲート判定
  lines.push('## NFR-01 ゲート判定 (単純 flowchart p50 ≤ 500ms)')
  lines.push('')
  lines.push('| ラベル | simple p50 | 閾値 | 判定 |')
  lines.push('|---|---|---|---|')
  lines.push(
    `| before (${before.label}) | ${fmtMs(before.nfr01SimpleP50Ms)} | ${before.nfr01ThresholdMs}ms | ${before.nfr01Passed ? '✅ PASS' : '❌ FAIL'} |`
  )
  lines.push(
    `| after (${after.label}) | ${fmtMs(after.nfr01SimpleP50Ms)} | ${after.nfr01ThresholdMs}ms | ${after.nfr01Passed ? '✅ PASS' : '❌ FAIL'} |`
  )
  lines.push('')
  lines.push(
    `差分: ${diffMs(before.nfr01SimpleP50Ms, after.nfr01SimpleP50Ms)} (after − before)`
  )
  lines.push('')
  lines.push(`**ゲート結論 (Phase 6 G-3)**: ${after.nfr01Passed ? '✅ PASS — Phase 6 G-4 (切替) へ進行可' : '❌ FAIL — Phase 1 / Phase 3 へ戻して原因分析'}`)
  lines.push('')

  // シナリオ別比較
  lines.push('## シナリオ別レイテンシ比較')
  lines.push('')
  const scenarios = Array.from(
    new Set([
      ...before.scenarios.map(s => s.scenario),
      ...after.scenarios.map(s => s.scenario)
    ])
  )
  for (const name of scenarios) {
    const b = before.scenarios.find(s => s.scenario === name)
    const a = after.scenarios.find(s => s.scenario === name)
    lines.push(`### ${name}`)
    lines.push('')
    if (b) lines.push(`- before: ${b.description} (concurrency=${b.concurrency}, iterations=${b.iterations}, total=${b.totalRequests})`)
    if (a) lines.push(`- after: ${a.description} (concurrency=${a.concurrency}, iterations=${a.iterations}, total=${a.totalRequests})`)
    lines.push('')
    lines.push('| 指標 | before | after | 差分 |')
    lines.push('|---|---|---|---|')
    if (b && a) {
      lines.push(`| 成功率 | ${fmtRate(b.successRate)} | ${fmtRate(a.successRate)} | ${(((a.successRate - b.successRate) * 100)).toFixed(1)}pt |`)
      lines.push(`| p50 | ${fmtMs(b.latency.p50)} | ${fmtMs(a.latency.p50)} | ${diffMs(b.latency.p50, a.latency.p50)} |`)
      lines.push(`| p95 | ${fmtMs(b.latency.p95)} | ${fmtMs(a.latency.p95)} | ${diffMs(b.latency.p95, a.latency.p95)} |`)
      lines.push(`| p99 | ${fmtMs(b.latency.p99)} | ${fmtMs(a.latency.p99)} | ${diffMs(b.latency.p99, a.latency.p99)} |`)
      lines.push(`| min | ${fmtMs(b.latency.min)} | ${fmtMs(a.latency.min)} | ${diffMs(b.latency.min, a.latency.min)} |`)
      lines.push(`| max | ${fmtMs(b.latency.max)} | ${fmtMs(a.latency.max)} | ${diffMs(b.latency.max, a.latency.max)} |`)
    } else if (b) {
      lines.push(`| (after 計測なし) | ${fmtMs(b.latency.p50)} | n/a | n/a |`)
    } else if (a) {
      lines.push(`| (before 計測なし) | n/a | ${fmtMs(a.latency.p50)} | n/a |`)
    }
    lines.push('')
    // エラー内訳
    const errKeys = Array.from(
      new Set([
        ...(b ? Object.keys(b.errorBreakdown) : []),
        ...(a ? Object.keys(a.errorBreakdown) : [])
      ])
    )
    if (errKeys.length > 0) {
      lines.push('エラー内訳:')
      lines.push('')
      lines.push('| error_type / 種別 | before | after |')
      lines.push('|---|---|---|')
      for (const k of errKeys) {
        const bv = b?.errorBreakdown[k] ?? 0
        const av = a?.errorBreakdown[k] ?? 0
        lines.push(`| \`${k}\` | ${bv} | ${av} |`)
      }
      lines.push('')
    }
  }

  // ランタイム比較 (PROP-6 連動)
  lines.push('## ランタイム比較 (Browser_Pool 連動指標)')
  lines.push('')
  lines.push('| 指標 | before baseline | before post | after baseline | after post |')
  lines.push('|---|---|---|---|---|')
  lines.push(
    `| Chromium プロセス数 | ${before.baseline.chromiumProcesses} | ${before.postRun.chromiumProcesses} | ${after.baseline.chromiumProcesses} | ${after.postRun.chromiumProcesses} |`
  )
  lines.push(
    `| target RSS | ${fmtRss(before.baseline.targetRssKib)} | ${fmtRss(before.postRun.targetRssKib)} | ${fmtRss(after.baseline.targetRssKib)} | ${fmtRss(after.postRun.targetRssKib)} |`
  )
  lines.push('')
  lines.push(
    '> 注: Docker コンテナ内 Chromium は host の `ps` から見える範囲のみ。コンテナ namespace の制約で 0 となる場合がある (PROP-6 は `/metrics` の `browser_restarts_total` と組み合わせて判定するのが正)。'
  )
  lines.push('')

  // 監視ポイント (G-4 監視ガイド)
  lines.push('## Phase 6 G-4 切替後 5 分監視ポイント')
  lines.push('')
  lines.push(`- \`render_total{result="ok"}\` カウンタ増加 (リクエスト流入確認)`)
  lines.push(`- \`render_timeout_total\` 急増なし`)
  lines.push(`- \`browser_restarts_total\` 安定 (初期 +1〜2 のみ、以降増えない)`)
  lines.push(`- \`browser_pool_in_use\` がピーク時も POOL_QUEUE_MAX 未満`)
  lines.push('')

  return lines.join('\n') + '\n'
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const [before, after] = await Promise.all([
    loadReport(resolve(args.before)),
    loadReport(resolve(args.after))
  ])
  const md = buildMarkdown(before, after, args.before, args.after)
  const name = args.outName ?? `${todayUtc()}_compare.md`
  const outPath = resolve(args.outDir, name)
  await writeFile(outPath, md, 'utf8')
  console.error(`[perf-compare] wrote ${outPath}`)
  console.error(
    `[perf-compare] NFR-01 verdict: ${after.nfr01Passed ? 'PASS' : 'FAIL'}` +
      ` (after simple p50 = ${fmtMs(after.nfr01SimpleP50Ms)})`
  )
  if (!after.nfr01Passed) process.exitCode = 2
}

main().catch(err => {
  console.error('[perf-compare] fatal:', err)
  process.exitCode = 1
})
