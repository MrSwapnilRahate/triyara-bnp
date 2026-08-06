import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names, resolving Tailwind conflicts so a caller's className always
 * wins over a component default. Without twMerge, `<Button className="px-8">`
 * silently loses to the variant's `px-3`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
