'use client'

import {
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  EmptyState,
  IconButton,
  PageHeader,
  Skeleton,
} from '@triyara/ui'
import { ChevronRight, FolderTree, Plus } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { Can } from '@/lib/ability-context'

import { useCategories } from '../api/reference'
import { buildCategoryTree, type CategoryNode } from '../types'

/**
 * Category tree (TRY-BNP-PORTAL-01 §8).
 *
 * The API returns a flat, path-ordered list with `depth`; the nesting is
 * assembled client-side. Drag-to-reparent is deliberately NOT in this wave: a
 * mis-parented subtree is expensive to reason about, the API recomputes path and
 * depth for every descendant, and the architecture calls for a pending state
 * reconciled against the server rather than an optimistic move.
 */
export function CategoryTree() {
  const query = useCategories({ limit: 100 })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildCategoryTree(query.data?.items ?? []), [query.data?.items])

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <PageHeader
        title="Categories"
        description="Unlimited nesting. A product belongs to exactly one category; filters match a whole subtree."
        actions={
          <Can action="create" subject="ReferenceData">
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/catalog/categories/new">New category</Link>
            </Button>
          </Can>
        }
      />

      <div className="p-gutter">
        <Card className="max-w-3xl">
          <CardContent className="p-gap">
            {query.isPending ? (
              <div className="space-y-gap p-gap">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} variant="text" className="w-full" />
                ))}
              </div>
            ) : query.isError ? (
              <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
            ) : tree.length === 0 ? (
              <EmptyState
                icon={<FolderTree />}
                title="No categories yet"
                description="Categories organise the catalog. Every product needs one."
                action={
                  <Can action="create" subject="ReferenceData">
                    <Button asChild variant="primary" leadingIcon={<Plus />}>
                      <Link href="/catalog/categories/new">New category</Link>
                    </Button>
                  </Can>
                }
              />
            ) : (
              <ul role="tree" aria-label="Category tree">
                {tree.map((node) => (
                  <CategoryBranch
                    key={node.id}
                    node={node}
                    expanded={expanded}
                    onToggle={toggle}
                    level={1}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function CategoryBranch({
  node,
  expanded,
  onToggle,
  level,
}: {
  node: CategoryNode
  expanded: Set<string>
  onToggle: (id: string) => void
  level: number
}) {
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.id)

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-level={level}
      className="select-none"
    >
      <div
        className="flex items-center gap-gap-xs rounded-sm px-gap py-1.5 hover:bg-surface-sunken"
        style={{ paddingLeft: `${(level - 1) * 20 + 8}px` }}
      >
        {hasChildren ? (
          <IconButton
            size="sm"
            label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={() => onToggle(node.id)}
            className="size-5"
          >
            <ChevronRight className={cn('transition-transform', isOpen && 'rotate-90')} />
          </IconButton>
        ) : (
          <span aria-hidden="true" className="size-5" />
        )}

        <Link
          href={`/catalog/products?categoryId=${node.id}`}
          className="focus-ring flex-1 truncate rounded-xs text-base text-content hover:text-accent"
        >
          {node.name}
        </Link>

        {node.isActive ? null : (
          <Badge size="sm" tone="neutral">
            Inactive
          </Badge>
        )}
        <span className="font-mono text-2xs text-content-subtle">{node.path}</span>
      </div>

      {hasChildren && isOpen ? (
        <ul role="group">
          {node.children.map((child) => (
            <CategoryBranch
              key={child.id}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              level={level + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
