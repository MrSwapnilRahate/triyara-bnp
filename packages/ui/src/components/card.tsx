import { cn } from '../lib/cn'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-line bg-surface rounded-md border shadow-xs', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'gap-gap-lg border-line px-gutter py-gap-lg flex items-start justify-between border-b',
        className,
      )}
      {...props}
    />
  )
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * Heading level. Defaults to `h3`.
   *
   * A card under a `PageHeader` sits below its `h1`, so `h3` skips a level and
   * fails axe's heading-order rule. Callers in that position pass `as="h2"`.
   * The visual size is set by the class, not the tag, so changing this changes
   * document structure only - which is the point.
   */
  as?: 'h2' | 'h3' | 'h4'
}

export function CardTitle({ className, as: Tag = 'h3', ...props }: CardTitleProps) {
  return <Tag className={cn('text-md text-content font-semibold', className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-gap-xs text-content-muted text-xs', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-gutter py-gap-lg', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'gap-gap border-line px-gutter py-gap-lg flex items-center justify-end border-t',
        className,
      )}
      {...props}
    />
  )
}
