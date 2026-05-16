/**
 * Phase 6 / G-2: 性能計測スクリプト (P-14).
 *
 * Validates: NFR-01 (単純 flowchart p50 ≤ 500ms), PROP-6 (Puppeteer プロセス数が
 * リクエスト数に比例しない), tasks.md §9 G-2.
 *
 * 使い方:
 *   npx tsx scripts/perf-check.ts \
 *     --target=http://localhost:3100 \
 *     --concurrency=100 \
 *     --iterations=5 \
 *     --label=before
 *
 * 結果は docs/perf/YYYY-MM-DD_<label>.json に保存。AI 駆動テスト方針 (memory:
 * feedback_development_methodology) に従い、印象論ではなく定量計測で
 * before/after を比較する根拠とする。
 */

import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

type Scenario = {
  /** シナリオ識別子。出力 JSON に転記される。 */
  name: 'simple' | 'complex'
  /** ノード 5 個以下 (simple) / 20 個 (complex)。NFR-01 計測対象は simple。 */
  description: string
  /** Mermaid コード本体。 */
  code: string
  /** リクエスト 1 発のタイムアウト (ms)。MAX_TIMEOUT_MS 内に収める。 */
  timeoutMs: number
}

type LatencySample = {
  status: number
  durationMs: number
  ok: boolean
  errorType?: string
}

type ScenarioResult = {
  scenario: Scenario['name']
  description: string
  /** 計測時の同時リクエスト数。 */
  concurrency: number
  /** 同条件を何回繰り返したか。 */
  iterations: number
  /** 計測した総リクエスト数 (concurrency * iterations)。 */
  totalRequests: number
  /** HTTP 2xx の比率 (0.0–1.0)。 */
  successRate: number
  /** レイテンシ (ms) の p50 / p95 / p99 / min / max。 */
  latency: { p50: number; p95: number; p99: number; min: number; max: number }
  /** 失敗 sample のエラー種別ヒストグラム。 */
  errorBreakdown: Record<string, number>
}

type RuntimeSnapshot = {
  /** 計測時点で host から見える Chromium 系プロセス数 (ps aux | grep chrome)。 */
  chromiumProcesses: number
  /** target が同 host で動いている場合の RSS 合計 (KiB)。判定できない場合は null。 */
  targetRssKib: number | null
}

type RunReport = {
  schemaVersion: 1
  /** ISO8601 (UTC) で計測時刻。 */
  capturedAt: string
  /** "before" | "after" | 任意ラベル。 */
  label: string
  /** 計測対象の base URL。 */
  target: string
  /** Node.js / OS の最低限の identity 情報。 */
  environment: {
    nodeVersion: string
    platform: string
    arch: string
  }
  /** 計測前の Chromium プロセス数のスナップショット。 */
  baseline: RuntimeSnapshot
  /** 全シナリオ完了後のスナップショット。 */
  postRun: RuntimeSnapshot
  scenarios: ScenarioResult[]
  /** NFR-01 判定用ショートカット: 単純シナリオの p50 (ms)。 */
  nfr01SimpleP50Ms: number
  /** NFR-01 ゲート閾値 (ms)。判定結果は perf-compare で表示。 */
  nfr01ThresholdMs: number
  nfr01Passed: boolean
}

const execFileAsync = promisify(execFile)

// === Constants ===
// NFR-01 ゲート閾値 (requirements.md §7 NFR-01)。
const NFR01_THRESHOLD_MS = 500
// 計測前の BrowserPool 初期化・JIT を吸収するための先行リクエスト数。
const WARMUP_REQUESTS = 5
// CLI 引数未指定時の既定値 (本番 = port 3100 想定)。
const DEFAULT_TARGET = 'http://localhost:3100'
const DEFAULT_CONCURRENCY = 20
const DEFAULT_ITERATIONS = 5
const DEFAULT_LABEL = 'before'
// シナリオごとのレンダリングタイムアウト (ms)。
const SIMPLE_SCENARIO_TIMEOUT_MS = 10000
const COMPLEX_SCENARIO_TIMEOUT_MS = 15000

const SIMPLE_CODE = [
  'flowchart TD',
  '  A[Start] --> B[Validate]',
  '  B --> C{OK?}',
  '  C -->|yes| D[Render]',
  '  C -->|no| E[Reject]'
].join('\n')

const COMPLEX_CODE = [
  'flowchart TD',
  '  A[Start] --> B[Auth]',
  '  B --> C[Validate]',
  '  C --> D{Type?}',
  '  D -->|svg| E[Render SVG]',
  '  D -->|png| F[Render PNG]',
  '  E --> G[Post-process]',
  '  F --> G',
  '  G --> H[Cache?]',
  '  H -->|hit| I[Return cached]',
  '  H -->|miss| J[Persist]',
  '  J --> K[Compress]',
  '  K --> L[Sign]',
  '  L --> M[Encrypt]',
  '  M --> N[Upload]',
  '  N --> O[Notify]',
  '  O --> P[Log]',
  '  P --> Q[Metric]',
  '  Q --> R[Done]',
  '  I --> R',
  '  E -.fallback.-> F'
].join('\n')

const SCENARIOS: Scenario[] = [
  {
    name: 'simple',
    description: '単純 flowchart (5 ノード以下)。NFR-01 ゲート対象。',
    code: SIMPLE_CODE,
    timeoutMs: SIMPLE_SCENARIO_TIMEOUT_MS
  },
  {
    name: 'complex',
    description: '複雑 flowchart (約 20 ノード)。スループット参考値。',
    code: COMPLEX_CODE,
    timeoutMs: COMPLEX_SCENARIO_TIMEOUT_MS
  }
]

interface CliArgs {
  target: string
  concurrency: number
  iterations: number
  label: string
  outDir: string
}

function parseArgs(argv: string[]): CliArgs {
  const defaults: CliArgs = {
    target: DEFAULT_TARGET,
    concurrency: DEFAULT_CONCURRENCY,
    iterations: DEFAULT_ITERATIONS,
    label: DEFAULT_LABEL,
    outDir: ''
  }
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue
    const [keyRaw, valueRaw] = raw.slice(2).split('=', 2)
    const key = keyRaw.trim()
    const value = (valueRaw ?? '').trim()
    switch (key) {
      case 'target':
        defaults.target = value || defaults.target
        break
      case 'concurrency': {
        const n = Number.parseInt(value, 10)
        if (Number.isFinite(n) && n > 0) defaults.concurrency = n
        break
      }
      case 'iterations': {
        const n = Number.parseInt(value, 10)
        if (Number.isFinite(n) && n > 0) defaults.iterations = n
        break
      }
      case 'label':
        if (value) defaults.label = value
        break
      case 'out-dir':
        if (value) defaults.outDir = value
        break
      default:
        // 未知フラグは黙殺 (CLI 互換性を優先)
        break
    }
  }
  if (!defaults.outDir) {
    const here = dirname(fileURLToPath(import.meta.url))
    defaults.outDir = resolve(here, '..', 'docs', 'perf')
  }
  return defaults
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return Number.NaN
  const sorted = [...samples].sort((a, b) => a - b)
  // 線形補間 percentile (R-7、Excel と同等)
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  const frac = rank - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

async function singleRequest(
  target: string,
  scenario: Scenario
): Promise<LatencySample> {
  const url = `${target.replace(/\/$/, '')}/render`
  const body = JSON.stringify({
    code: scenario.code,
    format: 'svg',
    timeout_ms: scenario.timeoutMs
  })
  const started = performance.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    })
    // body を drain しないとコネクションが詰まる
    if (res.ok) {
      const buf = await res.arrayBuffer()
      void buf
    } else {
      // エラー JSON も読み切る
      const text = await res.text()
      const elapsed = performance.now() - started
      let errorType: string | undefined
      try {
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed.error_type === 'string') {
          errorType = parsed.error_type
        }
      } catch {
        errorType = `http_${res.status}`
      }
      return {
        status: res.status,
        durationMs: elapsed,
        ok: false,
        errorType
      }
    }
    return {
      status: res.status,
      durationMs: performance.now() - started,
      ok: true
    }
  } catch (err) {
    return {
      status: 0,
      durationMs: performance.now() - started,
      ok: false,
      errorType: err instanceof Error ? `network:${err.name}` : 'network:unknown'
    }
  }
}

async function runScenario(
  target: string,
  scenario: Scenario,
  concurrency: number,
  iterations: number
): Promise<ScenarioResult> {
  const samples: LatencySample[] = []
  for (let iter = 0; iter < iterations; iter++) {
    const batch = await Promise.all(
      Array.from({ length: concurrency }, () => singleRequest(target, scenario))
    )
    samples.push(...batch)
  }
  const okSamples = samples.filter(s => s.ok)
  const durations = okSamples.map(s => s.durationMs)
  const errorBreakdown: Record<string, number> = {}
  for (const s of samples) {
    if (!s.ok) {
      const key = s.errorType ?? `http_${s.status}`
      errorBreakdown[key] = (errorBreakdown[key] ?? 0) + 1
    }
  }
  return {
    scenario: scenario.name,
    description: scenario.description,
    concurrency,
    iterations,
    totalRequests: samples.length,
    successRate: samples.length === 0 ? 0 : okSamples.length / samples.length,
    latency: {
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
      min: durations.length ? Math.min(...durations) : Number.NaN,
      max: durations.length ? Math.max(...durations) : Number.NaN
    },
    errorBreakdown
  }
}

async function countChromiumProcesses(): Promise<number> {
  try {
    const { stdout } = await execFileAsync('bash', [
      '-lc',
      'ps -e -o comm= | grep -Ei "chrome|chromium|headless" | grep -v grep | wc -l'
    ])
    const n = Number.parseInt(stdout.trim(), 10)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

async function readTargetRssKib(target: string): Promise<number | null> {
  // target が localhost のときだけ意味のある値が取れる前提。
  // それ以外は判定不能として null を返す。
  const isLocal =
    target.includes('localhost') ||
    target.includes('127.0.0.1') ||
    target.includes('::1')
  if (!isLocal) return null
  try {
    const portMatch = target.match(/:(\d+)(?:\/|$)/)
    const port = portMatch ? portMatch[1] : ''
    if (!port) return null
    // Docker 経由のコンテナを直接特定するのは難しいため、port を listen する
    // プロセスを探して、その RSS を取得する (ss -ltnp 経由)。
    const { stdout } = await execFileAsync('bash', [
      '-lc',
      `ss -ltnp 2>/dev/null | awk '$4 ~ /:${port}$/ {print $0; exit}' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2`
    ])
    const pid = stdout.trim()
    if (!pid) return null
    const { stdout: rssOut } = await execFileAsync('bash', [
      '-lc',
      `ps -o rss= -p ${pid} 2>/dev/null | tr -d ' '`
    ])
    const n = Number.parseInt(rssOut.trim(), 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

async function snapshot(target: string): Promise<RuntimeSnapshot> {
  const [chromiumProcesses, targetRssKib] = await Promise.all([
    countChromiumProcesses(),
    readTargetRssKib(target)
  ])
  return { chromiumProcesses, targetRssKib }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  console.error(
    `[perf-check] target=${args.target} concurrency=${args.concurrency}` +
      ` iterations=${args.iterations} label=${args.label}`
  )

  // 1. ウォームアップ (BrowserPool の初期化、JIT、最初の context 取得を吸収)
  console.error(`[perf-check] warming up (${WARMUP_REQUESTS} sequential requests)`)
  for (let i = 0; i < WARMUP_REQUESTS; i++) {
    await singleRequest(args.target, SCENARIOS[0])
  }

  // 2. baseline snapshot
  const baseline = await snapshot(args.target)
  console.error(
    `[perf-check] baseline: chromium=${baseline.chromiumProcesses}` +
      ` targetRssKib=${baseline.targetRssKib ?? 'n/a'}`
  )

  // 3. 各シナリオを順次実行
  const scenarios: ScenarioResult[] = []
  for (const scenario of SCENARIOS) {
    console.error(`[perf-check] running scenario=${scenario.name}`)
    const result = await runScenario(
      args.target,
      scenario,
      args.concurrency,
      args.iterations
    )
    console.error(
      `[perf-check] scenario=${scenario.name} ok=${result.successRate.toFixed(3)}` +
        ` p50=${result.latency.p50.toFixed(1)}ms p95=${result.latency.p95.toFixed(1)}ms` +
        ` p99=${result.latency.p99.toFixed(1)}ms`
    )
    scenarios.push(result)
  }

  // 4. post-run snapshot
  const postRun = await snapshot(args.target)
  console.error(
    `[perf-check] postRun: chromium=${postRun.chromiumProcesses}` +
      ` targetRssKib=${postRun.targetRssKib ?? 'n/a'}`
  )

  // 5. NFR-01 判定
  const simple = scenarios.find(s => s.scenario === 'simple')
  const nfr01SimpleP50Ms = simple ? simple.latency.p50 : Number.NaN
  const nfr01Passed = Number.isFinite(nfr01SimpleP50Ms) && nfr01SimpleP50Ms <= NFR01_THRESHOLD_MS

  const report: RunReport = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    label: args.label,
    target: args.target,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    baseline,
    postRun,
    scenarios,
    nfr01SimpleP50Ms,
    nfr01ThresholdMs: NFR01_THRESHOLD_MS,
    nfr01Passed
  }

  await mkdir(args.outDir, { recursive: true })
  const outPath = resolve(args.outDir, `${todayUtc()}_${args.label}.json`)
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.error(`[perf-check] wrote ${outPath}`)
  console.error(
    `[perf-check] NFR-01 simple p50 = ${nfr01SimpleP50Ms.toFixed(1)}ms` +
      ` (threshold ${NFR01_THRESHOLD_MS}ms) -> ${nfr01Passed ? 'PASS' : 'FAIL'}`
  )
  // 失敗時も非ゼロ終了せず、判定は perf-compare 側に委ねる (運用上の柔軟性)
}

main().catch(err => {
  console.error('[perf-check] fatal:', err)
  process.exitCode = 1
})
