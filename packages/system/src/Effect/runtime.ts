// option
// cause
import * as Cause from "../Cause/core"
import { pretty } from "../Cause/pretty"
// exit
import { HasClock, LiveClock } from "../Clock"
import type { Exit } from "../Exit/exit"
import { interruptAllAs } from "../Fiber/api"
// fiber
import { _tracing, FiberContext } from "../Fiber/context"
import { interruptible } from "../Fiber/core"
import type { FiberID } from "../Fiber/id"
import { newFiberId } from "../Fiber/id"
import type { Callback } from "../Fiber/state"
import { constVoid, identity } from "../Function"
import { defaultRandom, HasRandom } from "../Random"
import * as Scope from "../Scope"
// supervisor
import * as Supervisor from "../Supervisor"
import { AtomicBoolean } from "../Support/AtomicBoolean"
import type { FailureReporter } from "."
import { accessM, chain_, effectTotal, succeed } from "./core"
import type { Effect, UIO } from "./effect"
import { _I } from "./effect"
import { provideSome_ } from "./provideSome"

// empty function
const empty = () => {
  //
}

export type DefaultEnv = HasClock & HasRandom

export function defaultEnv() {
  return {
    [HasClock.key]: new LiveClock(),
    [HasRandom.key]: defaultRandom
  }
}

/**
 * Runs effect until completion, calling cb with the eventual exit state
 */
export function run<E, A>(_: Effect<DefaultEnv, E, A>, cb?: Callback<E, A>) {
  const context = fiberContext<E, A>()

  context.evaluateLater(_[_I])
  context.runAsync(cb || empty)
}

/**
 * Runs effect until completion, calling cb with the eventual exit state
 */
export function runAsap<E, A>(_: Effect<DefaultEnv, E, A>, cb?: Callback<E, A>) {
  const context = fiberContext<E, A>()

  context.evaluateNow(_[_I])
  context.runAsync(cb || empty)
}

export function defaultTeardown(
  status: number,
  id: FiberID,
  onExit: (status: number) => void
) {
  run(interruptAllAs(id)(_tracing.running), () => {
    setTimeout(() => {
      if (_tracing.running.size === 0) {
        onExit(status)
      } else {
        defaultTeardown(status, id, onExit)
      }
    }, 0)
  })
}

export const defaultHook = (
  cont: NodeJS.SignalsListener
): ((signal: NodeJS.Signals) => void) => (signal) => cont(signal)

/**
 * Runs effect until completion listening for system level termination signals that
 * triggers cancellation of the process, in case errors are found process will
 * exit with a status of 1 and cause will be pretty printed, if interruption
 * is found without errors the cause is pretty printed and process exits with
 * status 0. In the success scenario process exits with status 0 witout any log.
 *
 * Note: this should be used only in node.js as it depends on global process
 */
export function runMain<E>(
  effect: Effect<DefaultEnv, E, void>,
  customHook: (cont: NodeJS.SignalsListener) => NodeJS.SignalsListener = defaultHook,
  customTeardown: typeof defaultTeardown = defaultTeardown
): void {
  const context = fiberContext<E, void>()

  const onExit = (s: number) => {
    process.exit(s)
  }

  context.evaluateLater(effect[_I])
  context.runAsync((exit) => {
    switch (exit._tag) {
      case "Failure": {
        if (Cause.died(exit.cause) || Cause.failed(exit.cause)) {
          console.error(pretty(exit.cause))
          customTeardown(1, context.id, onExit)
          break
        } else {
          console.log(pretty(exit.cause))
          customTeardown(0, context.id, onExit)
          break
        }
      }
      case "Success": {
        customTeardown(0, context.id, onExit)
        break
      }
    }
  })

  const interrupted = new AtomicBoolean(false)

  const handler: NodeJS.SignalsListener = (signal) => {
    customHook(() => {
      process.removeListener("SIGTERM", handler)
      process.removeListener("SIGINT", handler)

      if (interrupted.compareAndSet(false, true)) {
        run(context.interruptAs(context.id))
      }
    })(signal)
  }

  process.once("SIGTERM", handler)
  process.once("SIGINT", handler)
}

/**
 * Effect Canceler
 */
export type AsyncCancel<E, A> = UIO<Exit<E, A>>

/**
 * Runs effect until completion returing a cancel effecr that when executed
 * triggers cancellation of the process
 */
export function runCancel<E, A>(
  _: Effect<DefaultEnv, E, A>,
  cb?: Callback<E, A>
): AsyncCancel<E, A> {
  const context = fiberContext<E, A>()

  context.evaluateLater(_[_I])
  context.runAsync(cb || empty)

  return context.interruptAs(context.id)
}

/**
 * Run effect as a Promise, throwing a the first error or exception
 */
export function runPromise<E, A>(_: Effect<DefaultEnv, E, A>): Promise<A> {
  const context = fiberContext<E, A>()

  context.evaluateLater(_[_I])

  return new Promise((res, rej) => {
    context.runAsync((exit) => {
      switch (exit._tag) {
        case "Success": {
          res(exit.value)
          break
        }
        case "Failure": {
          rej(Cause.squash(identity)(exit.cause))
          break
        }
      }
    })
  })
}

/**
 * Run effect as a Promise of the Exit state
 * in case of error.
 */
export function runPromiseExit<E, A>(_: Effect<DefaultEnv, E, A>): Promise<Exit<E, A>> {
  const context = fiberContext<E, A>()

  context.evaluateLater(_[_I])

  return new Promise((res) => {
    context.runAsync((exit) => {
      res(exit)
    })
  })
}

export const prettyReporter: FailureReporter = (e) => {
  console.error(pretty(e))
}

export function fiberContext<E, A>(reporter: FailureReporter = constVoid) {
  const initialIS = interruptible
  const fiberId = newFiberId()
  const scope = Scope.unsafeMakeScope<Exit<E, A>>()
  const supervisor = Supervisor.none

  const context = new FiberContext<E, A>(
    fiberId,
    defaultEnv(),
    initialIS,
    new Map(),
    supervisor,
    scope,
    10_000,
    reporter
  )

  return context
}

/**
 * Represent an environment providing function
 */
export interface Runtime<R0> {
  in: <R, E, A>(effect: Effect<R & R0, E, A>) => Effect<R, E, A>
  run: <E, A>(_: Effect<DefaultEnv & R0, E, A>, cb?: Callback<E, A> | undefined) => void
  runCancel: <E, A>(
    _: Effect<DefaultEnv & R0, E, A>,
    cb?: Callback<E, A> | undefined
  ) => UIO<Exit<E, A>>
  runPromise: <E, A>(_: Effect<DefaultEnv & R0, E, A>) => Promise<A>
  runPromiseExit: <E, A>(_: Effect<DefaultEnv & R0, E, A>) => Promise<Exit<E, A>>
}

/**
 * Use current environment to build a runtime that is capable of
 * providing its content to other effects.
 *
 * NOTE: in should be used in a region where current environment
 * is valid (i.e. keep attention to closed resources)
 */
export function runtime<R0>() {
  return accessM((r0: R0) =>
    effectTotal(
      (): Runtime<R0> => {
        return makeRuntime<R0>(r0)
      }
    )
  )
}

export function withRuntimeM<R0, R, E, A>(f: (r: Runtime<R0>) => Effect<R, E, A>) {
  return chain_(runtime<R0>(), f)
}

export function withRuntime<R0, A>(f: (r: Runtime<R0>) => A) {
  return chain_(runtime<R0>(), (r) => succeed(f(r)))
}

export function makeRuntime<R0>(r0: R0): Runtime<R0> {
  return {
    in: <R, E, A>(effect: Effect<R & R0, E, A>) =>
      provideSome_(effect, (r: R) => ({ ...r0, ...r })),
    run: (_, cb) =>
      run(
        provideSome_(_, (r) => ({ ...r0, ...r })),
        cb
      ),
    runCancel: (_, cb) =>
      runCancel(
        provideSome_(_, (r) => ({ ...r0, ...r })),
        cb
      ),
    runPromise: (_) => runPromise(provideSome_(_, (r) => ({ ...r0, ...r }))),
    runPromiseExit: (_) => runPromiseExit(provideSome_(_, (r) => ({ ...r0, ...r })))
  }
}
