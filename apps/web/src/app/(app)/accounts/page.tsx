import { AccountsView } from './accounts-view'

/**
 * Mounts the accounts screen, which fetches its own rows.
 *
 * The same shape as /suppliers. The list is still entirely the server's: the
 * view calls GET /api/v1/accounts, which parses `listAccountsQuerySchema` and
 * runs the same `accountService.list` this page used to call directly. What
 * changes is only how the answer reaches the browser - over fetch, rather than
 * an RSC tree that a mutation has to get re-applied.
 */
export default function AccountsPage() {
  return <AccountsView />
}
