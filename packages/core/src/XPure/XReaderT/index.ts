import type { Erase } from "@effect-ts/system/Utils"

import { pipe } from "../../Function"
import type { Applicative, Monad } from "../../Prelude"
import { succeedF } from "../../Prelude/DSL"
import type { Access, Fail, Provide, Run } from "../../Prelude/FX"
import type { URIS, V } from "../../Prelude/HKT"
import * as HKT from "../../Prelude/HKT"
import * as R from "../XReader"

export type XReaderTVariance<C> = Erase<HKT.Strip<C, "R">, HKT.Auto> & V<"R", "-">

export function monad<F extends URIS, C>(
  M: Monad<F, C>
): Monad<HKT.PrependURI<R.XReaderURI, F>, XReaderTVariance<C>>
export function monad(M: Monad<[HKT.UF_]>): Monad<[R.XReaderURI, HKT.UF_]> {
  return HKT.instance({
    any: () => R.succeed(M.any()),
    flatten: <A, R2>(
      ffa: R.XReader<R2, HKT.F_<R.XReader<R2, HKT.F_<A>>>>
    ): R.XReader<R2, HKT.F_<A>> =>
      pipe(
        R.access((e: R2) => pipe(ffa, R.runEnv(e), M.map(R.runEnv(e)))),
        R.map(M.flatten)
      ),
    map: <A, B>(f: (a: A) => B) => <R>(
      fa: R.XReader<R, HKT.F_<A>>
    ): R.XReader<R, HKT.F_<B>> => pipe(fa, R.map(M.map(f)))
  })
}

export function access<F extends URIS, C>(
  M: Monad<F, C>
): Access<HKT.PrependURI<R.XReaderURI, F>, XReaderTVariance<C>>
export function access(M: Monad<[HKT.UF_]>): Access<[R.XReaderURI, HKT.UF_]> {
  return HKT.instance({
    access: (f) => pipe(R.access(f), R.map(succeedF(M)))
  })
}

export function provide<F extends URIS, C>(
  M: Monad<F, C>
): Provide<HKT.PrependURI<R.XReaderURI, F>, XReaderTVariance<C>>
export function provide(M: Monad<[HKT.UF_]>): Provide<[R.XReaderURI, HKT.UF_]> {
  return HKT.instance({
    provide: <R>(r: R) => <A>(
      fa: R.XReader<R, HKT.F_<A>>
    ): R.XReader<unknown, HKT.F_<A>> =>
      pipe(
        fa,
        R.provideSome(() => r)
      )
  })
}

export function applicative<F extends URIS, C>(
  M: Applicative<F, C>
): Applicative<HKT.PrependURI<R.XReaderURI, F>, XReaderTVariance<C>>
export function applicative(
  M: Applicative<[HKT.UF_]>
): Applicative<[R.XReaderURI, HKT.UF_]> {
  return HKT.instance({
    any: () => R.succeed(M.any()),
    map: <A, B>(f: (a: A) => B) => <R>(
      fa: R.XReader<R, HKT.F_<A>>
    ): R.XReader<R, HKT.F_<B>> => pipe(fa, R.map(M.map(f))),
    both: <R2, B>(fb: R.XReader<R2, HKT.F_<B>>) => <A>(
      fa: R.XReader<R2, HKT.F_<A>>
    ): R.XReader<R2, HKT.F_<readonly [A, B]>> =>
      pipe(
        fa,
        R.zip(fb),
        R.map(([_a, _b]) => pipe(_a, M.both(_b)))
      )
  })
}

export function run<F extends URIS, C>(
  M: Run<F, C>
): Run<HKT.PrependURI<R.XReaderURI, F>, XReaderTVariance<C>>
export function run(M: Run<[HKT.UF__]>): Run<[R.XReaderURI, HKT.UF__]> {
  return HKT.instance({
    either: (fa) => pipe(fa, R.map(M.either))
  })
}

export function fail<F extends URIS, C>(
  M: Fail<F, C>
): Fail<HKT.PrependURI<R.XReaderURI, F>, XReaderTVariance<C>>
export function fail(M: Fail<[HKT.UF__]>): Fail<[R.XReaderURI, HKT.UF__]> {
  return HKT.instance({
    fail: (e) => pipe(e, M.fail, R.succeed)
  })
}