/**
 * Common type guard utility functions
 */

/**
 * Checks if a value is a non-null object (Record<string, unknown>)
 */
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Checks if a value is a non-empty string (after trimming)
 */
export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}
