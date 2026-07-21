import { logoutAction } from '@/auth/actions'
import { currentOrganization, requireAuth } from '@/auth/context'

export default async function DashboardPage() {
  const ctx = await requireAuth()
  const org = await currentOrganization()

  const checks: Array<[string, boolean]> = [
    ['read Account', ctx.ability.can('read', 'Account')],
    ['update Account', ctx.ability.can('update', 'Account')],
    ['verify Verification', ctx.ability.can('verify', 'Verification')],
    ['manage Users', ctx.ability.can('manage', 'User')],
  ]

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-gold text-2xl font-bold">Dashboard</h1>
        <form action={logoutAction}>
          <button className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:text-white">
            Sign out
          </button>
        </form>
      </div>

      <dl className="mt-8 space-y-2 text-sm">
        <Row label="User" value={ctx.user.name} />
        <Row label="Email" value={ctx.user.email} />
        <Row label="Organization" value={org?.name ?? ctx.organizationId} />
        <Row label="Roles" value={ctx.user.roles.join(', ')} />
      </dl>

      <h2 className="mt-10 text-xs uppercase tracking-widest text-white/40">
        Resolved permissions
      </h2>
      <ul className="mt-3 space-y-1 text-sm">
        {checks.map(([label, allowed]) => (
          <li key={label} className={allowed ? 'text-green-400' : 'text-white/40'}>
            {allowed ? 'can' : 'cannot'} {label}
          </li>
        ))}
      </ul>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-white/5 py-2">
      <dt className="text-white/40">{label}</dt>
      <dd className="text-white">{value}</dd>
    </div>
  )
}
