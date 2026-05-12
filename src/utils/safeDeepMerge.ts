import {
  WarningCode,
  type WarningCollector
} from './warnings.js'

export const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function safeDeepMerge<T extends Record<string, unknown>>(
  base: T,
  override?: unknown,
  warnings?: WarningCollector
): T {
  const out = clonePlainObject(base, warnings)
  if (!isPlainObject(override)) {
    return out as T
  }

  for (const [key, value] of Object.entries(override)) {
    if (FORBIDDEN_KEYS.has(key)) {
      warnings?.add(WarningCode.PrototypePollutionAttempt, { key })
      continue
    }

    const existing = out[key]
    if (isPlainObject(value) && isPlainObject(existing)) {
      out[key] = safeDeepMerge(
        existing as Record<string, unknown>,
        value,
        warnings
      )
      continue
    }

    out[key] = cloneValue(value, warnings)
  }

  return out as T
}

function clonePlainObject(
  value: Record<string, unknown>,
  warnings?: WarningCollector
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null)
  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      warnings?.add(WarningCode.PrototypePollutionAttempt, { key })
      continue
    }
    out[key] = cloneValue(nestedValue, warnings)
  }
  return out
}

function cloneValue(value: unknown, warnings?: WarningCollector): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item, warnings))
  }

  if (isPlainObject(value)) {
    return clonePlainObject(value, warnings)
  }

  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
