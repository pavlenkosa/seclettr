/**
 * Shared helpers for shared-primitive unit tests.
 *
 * CSS-module class maps are typed with an index signature, so under
 * `noUncheckedIndexedAccess` every `styles.x` access is `string | undefined`.
 * `cssClass` narrows that to a usable single class token for query selectors.
 */

/** Returns the first class token of a CSS-module value, failing loudly if absent. */
export function cssClass(token: string | undefined): string {
  if (!token) {
    throw new Error("expected a defined CSS-module class token");
  }
  return token.split(" ")[0] ?? token;
}
