import { SUPPORTED_FORMATS } from '../config.js'

export interface RenderRequestInput {
  code?: unknown
  format?: unknown
}

export interface ValidateResultError {
  type: 'invalid_request'
  message: string
  status_code: 400
  stderr: ''
  exit_code: null
}

export interface ValidationResult {
  valid: boolean
  normalizedFormat: (typeof SUPPORTED_FORMATS)[number]
  requestedFormat: string
  error?: ValidateResultError
}

const MAX_CODE_SIZE = 50 * 1024
const DEFAULT_FORMAT: ValidationResult['normalizedFormat'] = 'svg'

function createInvalidRequest(message: string): ValidateResultError {
  return {
    type: 'invalid_request',
    message,
    status_code: 400,
    stderr: '',
    exit_code: null
  }
}

export function validateRenderRequest(input: RenderRequestInput): ValidationResult {
  const formatRaw = input.format

  if (formatRaw !== undefined && typeof formatRaw !== 'string') {
    return {
      valid: false,
      normalizedFormat: DEFAULT_FORMAT,
      requestedFormat: String(formatRaw),
      error: createInvalidRequest('format must be a string')
    }
  }

  const requestedFormat = formatRaw ?? DEFAULT_FORMAT
  const normalizedFormat: ValidationResult['normalizedFormat'] =
    SUPPORTED_FORMATS.includes(
      requestedFormat.toLowerCase() as ValidationResult['normalizedFormat']
    )
      ? (requestedFormat.toLowerCase() as ValidationResult['normalizedFormat'])
      : DEFAULT_FORMAT

  const codeRaw = input.code
  if (codeRaw === undefined || typeof codeRaw !== 'string') {
    return {
      valid: false,
      normalizedFormat,
      requestedFormat,
      error: createInvalidRequest('code must be a string')
    }
  }

  const trimmedCode = codeRaw.trim()

  if (trimmedCode.length === 0) {
    return {
      valid: false,
      normalizedFormat,
      requestedFormat,
      error: createInvalidRequest('code is required')
    }
  }

  const codeLength = Buffer.byteLength(codeRaw, 'utf-8')
  if (codeLength > MAX_CODE_SIZE) {
    return {
      valid: false,
      normalizedFormat,
      requestedFormat,
      error: createInvalidRequest(
        `code exceeds maximum size of ${MAX_CODE_SIZE} bytes`
      )
    }
  }

  if (
    !SUPPORTED_FORMATS.includes(
      requestedFormat.toLowerCase() as ValidationResult['normalizedFormat']
    )
  ) {
    return {
      valid: false,
      normalizedFormat,
      requestedFormat,
      error: createInvalidRequest(
        `format must be one of: ${SUPPORTED_FORMATS.join(', ')}`
      )
    }
  }

  return {
    valid: true,
    normalizedFormat,
    requestedFormat
  }
}
