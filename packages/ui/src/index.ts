// Design-system components (presentational only). Business components arrive with features.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
