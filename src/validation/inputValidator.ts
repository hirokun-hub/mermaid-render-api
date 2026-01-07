export interface RenderRequestInput {
  code?: string
  format?: string
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
  normalizedFormat: 'svg' | 'png'
  requestedFormat: string
  error?: ValidateResultError
}

const MAX_CODE_SIZE = 50 * 1024
const VALID_FORMATS = ['svg', 'png'] as const
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
  const requestedFormat = input.format ?? DEFAULT_FORMAT
  const normalizedFormat: ValidationResult['normalizedFormat'] =
    VALID_FORMATS.includes(
      requestedFormat.toLowerCase() as ValidationResult['normalizedFormat']
    )
      ? (requestedFormat.toLowerCase() as ValidationResult['normalizedFormat'])
      : DEFAULT_FORMAT

  if (!input.code || input.code.trim().length === 0) {
    return {
      valid: false,
      normalizedFormat,
      requestedFormat,
      error: createInvalidRequest('code is required')
    }
  }

  const codeLength = Buffer.byteLength(input.code, 'utf-8')
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
    !VALID_FORMATS.includes(
      requestedFormat.toLowerCase() as ValidationResult['normalizedFormat']
    )
  ) {
    return {
      valid: false,
      normalizedFormat,
      requestedFormat,
      error: createInvalidRequest(
        `format must be one of: ${VALID_FORMATS.join(', ')}`
      )
    }
  }

  return {
    valid: true,
    normalizedFormat,
    requestedFormat
  }
}
