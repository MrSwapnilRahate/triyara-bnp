import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { permissionService } from '@/lib/auth-extension-service'

// GET /api/v1/auth/permission-matrix -> what every role may do.
//
// Derived from `buildAbilityFor` at read time, one role at a time, so this is
// the same function the guards call. It cannot describe a permission the
// platform would refuse or omit one it would allow.
//
// `actions` and `subjects` ship with it so a client can draw the axes of the
// table without keeping its own copy of either vocabulary. That is the whole
// point: the portal renders this, it never restates it.
//
// Distinct from GET /api/v1/auth/permissions, which is unchanged and answers a
// different question - what THIS caller may do, optionally within one scope.
//
// Authentication only. It is the published rule book: identical for every
// caller, carrying no tenant data, and gating it would only push the portal
// into maintaining the copy this endpoint exists to prevent.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    await requireAuth()
    const res = ok(permissionService.roleMatrix(), { requestId })
    // Private, not public: the body is the same for everyone, but it is served
    // behind a session and must not sit in a shared cache.
    res.headers.set('cache-control', 'private, max-age=300')
    return res
  })
}
