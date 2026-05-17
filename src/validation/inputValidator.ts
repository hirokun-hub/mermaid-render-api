import {
  DEFAULT_FORMAT,
  DEFAULT_PNG_SCALE,
  DEFAULT_TIMEOUT_MS,
  MAX_CODE_SIZE,
  MAX_PNG_SCALE,
  MAX_THEME_CSS_LENGTH,
  MAX_TIMEOUT_MS,
  MIN_PNG_SCALE,
  MIN_TIMEOUT_MS,
  SUPPORTED_FORMATS,
  THEME_CSS_FORBIDDEN_PATTERNS,
  type MermaidConfig,
  type MermaidConfigValue,
  type SupportedFormat
} from '../config.js'
import type { PostProcessOption } from '../renderer/mermaidRendererAdapter.js'
import type { NormalizedPostProcess } from '../renderer/mermaidRendererAdapter.js'
import { FORBIDDEN_KEYS } from '../utils/safeDeepMerge.js'
import {
  WarningCode,
  WarningCollector,
  type Warning
} from '../utils/warnings.js'

export interface RenderRequestInput {
  code?: unknown
  format?: unknown
  timeout_ms?: unknown
  mermaid_config?: unknown
  post_process?: unknown
  scale?: unknown
}

export interface ValidateResultError {
  type: 'invalid_request'
  message: string
  status_code: 400
  stderr: ''
  exit_code: null
  error_field: string | null
  error_constraint: string | null
}

export interface ValidationResult {
  valid: boolean
  normalizedFormat: SupportedFormat
  requestedFormat: string
  timeoutMs: number
  scale: number
  warnings: Warning[]
  mermaidConfig?: Partial<MermaidConfig>
  postProcess: NormalizedPostProcess
  error?: ValidateResultError
}

type ValueKind = 'string' | 'number' | 'boolean' | 'string_array' | 'object'

interface ConfigSchemaNode {
  kind?: ValueKind
  children?: Record<string, ConfigSchemaNode>
  passThroughChildren?: boolean
}

const LOCKED_SETTING_KEYS = new Set([
  'securityLevel',
  'maxTextSize',
  'maxEdges',
  'startOnLoad',
  'secure'
])

const MERMAID_CONFIG_SCHEMA: Record<string, ConfigSchemaNode> = {
  theme: { kind: 'string' },
  themeVariables: {
    kind: 'object',
    passThroughChildren: true,
    children: {
      fontFamily: { kind: 'string' }
    }
  },
  themeCSS: { kind: 'string' },
  htmlLabels: { kind: 'boolean' },
  flowchart: {
    kind: 'object',
    passThroughChildren: true,
    children: {
      useMaxWidth: { kind: 'boolean' },
      diagramPadding: { kind: 'number' },
      nodeSpacing: { kind: 'number' },
      rankSpacing: { kind: 'number' },
      curve: { kind: 'string' },
      wrappingWidth: { kind: 'number' },
      defaultRenderer: { kind: 'string' }
    }
  },
  sequence: { kind: 'object', passThroughChildren: true },
  gantt: { kind: 'object', passThroughChildren: true },
  er: { kind: 'object', passThroughChildren: true },
  class: { kind: 'object', passThroughChildren: true },
  state: { kind: 'object', passThroughChildren: true },
  mindmap: { kind: 'object', passThroughChildren: true }
}

const DEFAULT_POST_PROCESS: NormalizedPostProcess = {
  rewrite_ids: true,
  strip_max_width: false
}

const POST_PROCESS_SCHEMA: Record<keyof PostProcessOption, ValueKind> = {
  rewrite_ids: 'boolean',
  strip_max_width: 'boolean'
}

function createInvalidRequest(
  message: string,
  errorField: string | null = null,
  errorConstraint: string | null = null
): ValidateResultError {
  return {
    type: 'invalid_request',
    message,
    status_code: 400,
    stderr: '',
    exit_code: null,
    error_field: errorField,
    error_constraint: errorConstraint
  }
}

export function validateRenderRequest(input: RenderRequestInput): ValidationResult {
  const warnings = new WarningCollector()
  const base = createBaseResult(input, warnings)
  const basicError = validateBasicFields(input, base)
  if (basicError) return basicError

  const timeoutResult = validateTimeout(input.timeout_ms, base)
  if (!timeoutResult.valid) return timeoutResult

  const scaleResult = validateScale(input.scale, timeoutResult, warnings)
  if (!scaleResult.valid) return scaleResult

  if (input.scale !== undefined && scaleResult.normalizedFormat === 'svg') {
    warnings.add(WarningCode.ScaleIgnoredForSvg, {})
  }

  const mermaidConfigResult = validateMermaidConfig(
    input.mermaid_config,
    scaleResult,
    warnings
  )
  if (!mermaidConfigResult.valid) return mermaidConfigResult

  const postProcessResult = validatePostProcess(
    input.post_process,
    mermaidConfigResult,
    warnings
  )
  if (!postProcessResult.valid) return postProcessResult

  return {
    ...postProcessResult,
    warnings: warnings.drain()
  }
}

function createBaseResult(
  input: RenderRequestInput,
  warnings: WarningCollector
): ValidationResult {
  const formatRaw = input.format
  const requestedFormat =
    typeof formatRaw === 'string' ? formatRaw : String(formatRaw ?? DEFAULT_FORMAT)
  const normalizedFormat = SUPPORTED_FORMATS.includes(
    requestedFormat.toLowerCase() as SupportedFormat
  )
    ? (requestedFormat.toLowerCase() as SupportedFormat)
    : DEFAULT_FORMAT

  return {
    valid: true,
    normalizedFormat,
    requestedFormat,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    scale: DEFAULT_PNG_SCALE,
    warnings: warnings.drain(),
    postProcess: { ...DEFAULT_POST_PROCESS }
  }
}

function validateBasicFields(
  input: RenderRequestInput,
  base: ValidationResult
): ValidationResult | null {
  const formatRaw = input.format

  if (formatRaw !== undefined && typeof formatRaw !== 'string') {
    return invalid(base, 'format must be a string', 'format', 'type_mismatch')
  }

  const codeRaw = input.code
  if (codeRaw === undefined || typeof codeRaw !== 'string') {
    return invalid(base, 'code must be a string', 'code', 'type_mismatch')
  }

  if (codeRaw.trim().length === 0) {
    return invalid(base, 'code is required', 'code', 'required')
  }

  const codeLength = Buffer.byteLength(codeRaw, 'utf-8')
  if (codeLength > MAX_CODE_SIZE) {
    return invalid(
      base,
      `code exceeds maximum size of ${MAX_CODE_SIZE} bytes`,
      'code',
      'max_size'
    )
  }

  if (
    !SUPPORTED_FORMATS.includes(
      base.requestedFormat.toLowerCase() as SupportedFormat
    )
  ) {
    return invalid(
      base,
      `format must be one of: ${SUPPORTED_FORMATS.join(', ')}`,
      'format',
      'unsupported_value'
    )
  }

  return null
}

function validateTimeout(
  timeoutRaw: unknown,
  base: ValidationResult
): ValidationResult {
  if (timeoutRaw === undefined) {
    return { ...base, timeoutMs: DEFAULT_TIMEOUT_MS }
  }

  if (typeof timeoutRaw !== 'number' || !Number.isInteger(timeoutRaw)) {
    return invalid(
      base,
      'timeout_ms must be an integer',
      'timeout_ms',
      'type_mismatch'
    )
  }

  if (timeoutRaw < MIN_TIMEOUT_MS || timeoutRaw > MAX_TIMEOUT_MS) {
    return invalid(
      base,
      `timeout_ms must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
      'timeout_ms',
      'out_of_range'
    )
  }

  return { ...base, timeoutMs: timeoutRaw }
}

function validateScale(
  scaleRaw: unknown,
  base: ValidationResult,
  warnings: WarningCollector
): ValidationResult {
  if (scaleRaw === undefined) {
    return { ...base, scale: DEFAULT_PNG_SCALE }
  }

  if (typeof scaleRaw !== 'number' || !Number.isInteger(scaleRaw)) {
    return invalid(base, 'scale must be an integer', 'scale', 'type_mismatch', warnings)
  }

  if (scaleRaw < MIN_PNG_SCALE || scaleRaw > MAX_PNG_SCALE) {
    return invalid(
      base,
      `scale must be between ${MIN_PNG_SCALE} and ${MAX_PNG_SCALE}`,
      'scale',
      'out_of_range',
      warnings
    )
  }

  return { ...base, scale: scaleRaw }
}

function validateMermaidConfig(
  configRaw: unknown,
  base: ValidationResult,
  warnings: WarningCollector
): ValidationResult {
  if (configRaw === undefined) return base

  if (!isPlainObject(configRaw)) {
    return invalid(
      base,
      'mermaid_config must be an object',
      'mermaid_config',
      'type_mismatch',
      warnings
    )
  }

  const result = sanitizeMermaidConfig(
    configRaw,
    MERMAID_CONFIG_SCHEMA,
    'mermaid_config',
    warnings
  )

  if (!result.valid) {
    return invalid(
      base,
      result.message,
      result.field,
      result.constraint,
      warnings
    )
  }

  return {
    ...base,
    mermaidConfig: result.value as Partial<MermaidConfig>
  }
}

function validatePostProcess(
  postProcessRaw: unknown,
  base: ValidationResult,
  warnings: WarningCollector
): ValidationResult {
  if (postProcessRaw === undefined) {
    return { ...base, postProcess: { ...DEFAULT_POST_PROCESS } }
  }

  if (!isPlainObject(postProcessRaw)) {
    return invalid(
      base,
      'post_process must be an object',
      'post_process',
      'type_mismatch',
      warnings
    )
  }

  const postProcess: NormalizedPostProcess = { ...DEFAULT_POST_PROCESS }
  for (const [key, value] of Object.entries(postProcessRaw)) {
    const field = `post_process.${key}`

    if (FORBIDDEN_KEYS.has(key)) {
      warnings.add(WarningCode.PrototypePollutionAttempt, { key })
      continue
    }

    const expectedKind = POST_PROCESS_SCHEMA[key as keyof PostProcessOption]
    if (!expectedKind) {
      warnings.add(WarningCode.UnknownKey, { key: field })
      continue
    }

    if (!isValueKind(value, expectedKind)) {
      return invalid(
        base,
        `${field} must be a ${expectedKind}`,
        field,
        'type_mismatch',
        warnings
      )
    }

    postProcess[key as keyof PostProcessOption] = value as boolean
  }

  return { ...base, postProcess }
}

function sanitizeMermaidConfig(
  source: Record<string, unknown>,
  schema: Record<string, ConfigSchemaNode>,
  path: string,
  warnings: WarningCollector
):
  | { valid: true; value: Record<string, MermaidConfigValue> }
  | { valid: false; message: string; field: string; constraint: string } {
  const sanitized: Record<string, MermaidConfigValue> = Object.create(null)

  for (const [key, value] of Object.entries(source)) {
    const field = `${path}.${key}`

    if (FORBIDDEN_KEYS.has(key)) {
      warnings.add(WarningCode.PrototypePollutionAttempt, { key })
      continue
    }

    if (LOCKED_SETTING_KEYS.has(key)) {
      warnings.add(WarningCode.LockedSettingOverrideIgnored, { key: field })
      continue
    }

    const node = schema[key]
    if (!node) {
      if (path === 'mermaid_config') {
        warnings.add(WarningCode.UnknownKey, { key: field })
        continue
      }

      sanitized[key] = sanitizeUnknownNestedValue(value, field, warnings)
      continue
    }

    if (node.kind === 'object' && !isPlainObject(value)) {
      return {
        valid: false,
        message: `${field} must be a ${node.kind}`,
        field,
        constraint: 'type_mismatch'
      }
    }

    if (node.children || node.passThroughChildren) {
      const nested = sanitizeMermaidConfig(
        value as Record<string, unknown>,
        node.children ?? {},
        field,
        warnings
      )
      if (!nested.valid) return nested
      sanitized[key] = nested.value
      continue
    }

    const expectedKind = node.kind
    if (expectedKind && !isValueKind(value, expectedKind)) {
      return {
        valid: false,
        message: `${field} must be a ${expectedKind}`,
        field,
        constraint: 'type_mismatch'
      }
    }

    const themeCssError = validateThemeCss(field, value, warnings)
    if (themeCssError) return themeCssError

    sanitized[key] = value as MermaidConfigValue
  }

  return { valid: true, value: sanitized }
}

function sanitizeUnknownNestedValue(
  value: unknown,
  path: string,
  warnings: WarningCollector
): MermaidConfigValue {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeUnknownNestedValue(item, `${path}.${index}`, warnings)
    ) as MermaidConfigValue[]
  }

  if (!isPlainObject(value)) {
    return value as MermaidConfigValue
  }

  const sanitized: Record<string, MermaidConfigValue> = Object.create(null)

  for (const [key, nestedValue] of Object.entries(value)) {
    const field = `${path}.${key}`

    if (FORBIDDEN_KEYS.has(key)) {
      warnings.add(WarningCode.PrototypePollutionAttempt, { key })
      continue
    }

    if (LOCKED_SETTING_KEYS.has(key)) {
      warnings.add(WarningCode.LockedSettingOverrideIgnored, { key: field })
      continue
    }

    sanitized[key] = sanitizeUnknownNestedValue(nestedValue, field, warnings)
  }

  return sanitized
}

function validateThemeCss(
  field: string,
  value: unknown,
  warnings: WarningCollector
): { valid: false; message: string; field: string; constraint: string } | null {
  if (field !== 'mermaid_config.themeCSS' || typeof value !== 'string') {
    return null
  }

  if (value.length > MAX_THEME_CSS_LENGTH) {
    return {
      valid: false,
      message: `${field} exceeds maximum length`,
      field,
      constraint: 'max_length'
    }
  }

  const lowered = value.toLowerCase()
  const forbiddenPattern = THEME_CSS_FORBIDDEN_PATTERNS.find((pattern) =>
    lowered.includes(pattern.toLowerCase())
  )

  if (!forbiddenPattern) return null

  warnings.add(WarningCode.ThemeCssRejected, {
    field,
    pattern: forbiddenPattern
  })
  return {
    valid: false,
    message: `${field} contains a forbidden pattern`,
    field,
    constraint: 'forbidden_pattern'
  }
}

function invalid(
  base: ValidationResult,
  message: string,
  errorField: string | null,
  errorConstraint: string | null,
  warnings?: WarningCollector
): ValidationResult {
  return {
    ...base,
    valid: false,
    warnings: warnings?.drain() ?? base.warnings,
    error: createInvalidRequest(message, errorField, errorConstraint)
  }
}

function isValueKind(value: unknown, expectedKind: ValueKind): boolean {
  switch (expectedKind) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'string_array':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
    case 'object':
      return isPlainObject(value)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
