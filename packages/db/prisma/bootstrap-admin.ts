import { PrismaClient } from '@prisma/client'

import { bootstrapAdmin, parseBootstrapConfig } from '../src/bootstrap-admin'

/**
 * One-time, manual creation of the first administrator.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=… BOOTSTRAP_ADMIN_PASSWORD=… \
 *   DATABASE_URL=… pnpm --filter @triyara/db db:bootstrap-admin -- --confirm
 *
 * `--confirm` is required. Without it the command prints what it would do and
 * exits without touching anything - the point being that DATABASE_URL is
 * usually whatever was last exported in a shell, and "I thought that terminal
 * was pointed at staging" is how the wrong database gets written to.
 *
 * Nothing here prints the password or the hash. The only credential-shaped
 * value that reaches stdout is the email address, which the operator typed.
 */

/* eslint-disable no-console -- a CLI's entire output is console. */

/** Host and database only, so the operator can see which server they hit. */
function describeTarget(raw: string | undefined): string {
  if (!raw) return '(DATABASE_URL is not set)'
  try {
    const u = new URL(raw)
    return `${u.hostname}/${u.pathname.replace(/^\//, '')}`
  } catch {
    return '(DATABASE_URL is not a parseable URL)'
  }
}

async function main() {
  const confirmed = process.argv.includes('--confirm')

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Refusing to run.')
    process.exit(1)
  }

  let config
  try {
    config = parseBootstrapConfig(process.env)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  console.log('Bootstrap administrator')
  console.log(`  database     : ${describeTarget(process.env.DATABASE_URL)}`)
  console.log(`  organization : ${config.organizationSlug}`)
  console.log(`  email        : ${config.email}`)
  console.log(`  name         : ${config.name}`)
  console.log('  password     : (supplied via environment, not shown)')

  if (!confirmed) {
    console.log('\nDry run. Nothing was written.')
    console.log('Re-run with --confirm once the database above is the one you mean.')
    return
  }

  const prisma = new PrismaClient()
  try {
    const result = await bootstrapAdmin(prisma, config)
    const said = {
      created: 'Created the administrator and granted ADMIN.',
      'already-existed': 'That user already exists and already holds ADMIN. Nothing changed.',
      'role-linked': 'That user already existed; granted ADMIN. Password left untouched.',
    }[result.outcome]
    console.log(`\n${said}`)
    console.log(`  user id: ${result.userId}`)
    console.log('\nSign in at /login with the address above.')
    console.log('Then remove BOOTSTRAP_ADMIN_* from your shell and any local env file.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  // The message, never the stack: a Prisma stack can carry the connection
  // string, and this output is the thing most likely to be pasted somewhere.
  console.error(`\nBootstrap failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
