/**
 * `Show[A]` provides implicit evidence that values of type `A` have a total
 * ordering.
 */
export interface Show<A> {
  readonly show: (x: A) => string
}

export const ShowURI = "Show"
export type ShowURI = typeof ShowURI

declare module "../HKT" {
  interface URItoKind<SI, SO, X, I, S, Env, Err, Out> {
    [ShowURI]: Show<Out>
  }
}

/**
 * Creates Show[A] from equals & compare functions
 */
export function makeShow<A>(show: (x: A) => string): Show<A> {
  return {
    show
  }
}