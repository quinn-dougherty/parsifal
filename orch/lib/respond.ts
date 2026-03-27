import { Effect } from "effect"
import { NextResponse } from "next/server"

export class NotFound {
  readonly _tag = "NotFound" as const
  constructor(readonly message: string) {}
}

export class BadRequest {
  readonly _tag = "BadRequest" as const
  constructor(readonly message: string) {}
}

export class Conflict {
  readonly _tag = "Conflict" as const
  constructor(readonly message: string) {}
}

export class Internal {
  readonly _tag = "Internal" as const
  constructor(readonly message: string) {}
}

export type ApiError = NotFound | BadRequest | Conflict | Internal

const statusOf = (err: ApiError): number => {
  switch (err._tag) {
    case "NotFound": return 404
    case "BadRequest": return 400
    case "Conflict": return 409
    case "Internal": return 500
  }
}

export const respond = <A>(effect: Effect.Effect<A, ApiError>) =>
  effect.pipe(
    Effect.match({
      onSuccess: (data) => NextResponse.json(data),
      onFailure: (err) => NextResponse.json({ error: err.message }, { status: statusOf(err) }),
    }),
    Effect.runPromise,
  )
