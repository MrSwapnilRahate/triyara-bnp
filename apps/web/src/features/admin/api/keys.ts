export const adminKeys = {
  all: ['admin'] as const,

  summary: () => [...adminKeys.all, 'summary'] as const,
  trends: (window: string) => [...adminKeys.all, 'trends', window] as const,
  audit: (query: Record<string, unknown>) => [...adminKeys.all, 'audit', query] as const,
  organization: () => [...adminKeys.all, 'organization'] as const,
  profile: () => [...adminKeys.all, 'profile'] as const,
  notificationPreferences: () => [...adminKeys.all, 'notification-preferences'] as const,
  directory: (q: string) => [...adminKeys.all, 'directory', q] as const,
} as const
