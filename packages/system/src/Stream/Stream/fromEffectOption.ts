import { pipe } from "../../Function"
import type * as Option from "../../Option"
import * as Ref from "../../Ref"
import * as T from "../_internal/effect"
import * as M from "../_internal/managed"
import * as Pull from "../Pull"
import { Stream } from "./definitions"

/**
 * Creates a stream from an effect producing a value of type `A` or an empty Stream
 */
export const fromEffectOption = <R, E, A>(
  fa: T.Effect<R, Option.Option<E>, A>
): Stream<R, E, A> =>
  new Stream(
    pipe(
      M.do,
      M.bind("doneRef", () => pipe(Ref.makeRef(false), T.toManaged())),
      M.let("pull", ({ doneRef }) =>
        pipe(
          doneRef,
          Ref.modify((b) =>
            b
              ? [Pull.end, true]
              : [
                  pipe(
                    fa,
                    T.map((a) => [a])
                  ),
                  true
                ]
          ),
          T.flatten
        )
      ),
      M.map(({ pull }) => pull)
    )
  )
