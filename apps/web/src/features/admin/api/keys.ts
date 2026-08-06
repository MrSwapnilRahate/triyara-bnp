export const adminKeys = {
  all: ['admin'] as const,

  summary: () => [...adminKeys.all, 'summary'] as const,
  trends: (window: string) => [...adminKeys.all, 'trends', window] as const,
  audit: (query: Record<string, unknown>) => [...adminKeys.all, 'audit', query] as const,
  organization: () => [...adminKeys.all, 'organization'] as const,
  profile: () => [...adminKeys.all, 'profile'] as const,
  notificationPreferences: () => [...adminKeys.all, 'notification-preferences'] as const,
  directory: (q: string) => [...adminKeys.all, 'directory', q] as const,

  // User administration. Everything about one person hangs off `user(id)`, so
  // a role change can invalidate that subtree without touching the list query
  // the operator is paging through.
  users: (query: Record<string, unknown>) => [...adminKeys.all, 'users', query] as const,
  user: (id: string) => [...adminKeys.all, 'user', id] as const,
  userRoles: (id: string) => [...adminKeys.user(id), 'roles'] as const,
  userSessions: (id: string, activeOnly: boolean) =>
    [...adminKeys.user(id), 'sessions', activeOnly] as const,
  userLoginAttempts: (id: string, query: Record<string, unknown>) =>
    [...adminKeys.user(id), 'login-attempts', query] as const,
  userScopedRoles: (id: string) => [...adminKeys.user(id), 'scoped-roles'] as const,
  permissionMatrix: () => [...adminKeys.all, 'permission-matrix'] as const,
} as const
