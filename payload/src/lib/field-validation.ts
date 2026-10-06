/**
 * Shared field validators (DRY: keeps Sonar duplication low).
 *
 * Payload runs custom `validate` on update even for fields OMITTED from the
 * request body (value arrives as undefined). Any validator that rejects
 * undefined turns every partial PATCH into a 400, so all validators below
 * skip absent values on non-create operations. Presence on create is still
 * enforced by the same function.
 */

/** Options shape (subset) that Payload passes to field validators. */
export interface ValidateOptions {
  operation?: string
}

/** True when the value is absent and this is not a create (skip validation). */
export function optionalOnUpdate(val: unknown, operation?: string): boolean {
  return (val == null || val === '') && operation !== 'create'
}

/**
 * Required-text validator that tolerates omitted fields on update.
 * Example: `validate: makeTextValidate('Name', 100)`.
 */
export function makeTextValidate(label: string, maxLength: number) {
  return (val: unknown, { operation }: ValidateOptions = {}): string | true => {
    if (optionalOnUpdate(val, operation)) return true
    if (typeof val !== 'string' || val.trim().length === 0) return `${label} is required.`
    if (val.length > maxLength) return `${label} must be at most ${maxLength} characters.`
    return true
  }
}
