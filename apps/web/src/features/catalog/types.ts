import type { ProductStatusName } from '@triyara/validation'

/**
 * Response shapes for the Catalog API, derived from its published
 * openapi.json. The portal declares its own view types rather than importing
 * Prisma payloads - it talks HTTP, so it must not depend on the ORM.
 *
 * Decimals arrive as strings (Decimal(18,4)). They are kept as strings and never
 * passed through parseFloat for display; rendering a stored total via floating
 * point is how a price ends up as 1416.0000000000002.
 */
export interface ProductListItem {
  id: string
  sku: string
  name: string
  slug: string
  status: ProductStatusName
  brand: string | null
  countryOfOrigin: string | null
  hsCode: string | null
  isActive: boolean
  categoryId: string
  category?: { id: string; name: string; path: string } | null
  version: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ProductSpecificationValue {
  id: string
  definitionId: string
  valueString: string | null
  valueNumber: string | null
  valueBoolean: boolean | null
  valueDate: string | null
  definition?: { id: string; name: string; unit: string | null; dataType: string } | null
}

export interface Product extends ProductListItem {
  shortDescription: string | null
  description: string | null
  specifications: ProductSpecificationValue[]
  tags: Array<{ tagId: string; tag: { id: string; name: string; slug: string } }>
  images?: Array<{ id: string; url: string; type: string; alt: string | null }>
}

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  path: string
  depth: number
  sortOrder: number
  isActive: boolean
  version: number
  productCount?: number
}

export interface SpecificationDefinition {
  id: string
  name: string
  slug: string
  unit: string | null
  dataType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'ENUM'
  options?: string[] | null
}

export interface Tag {
  id: string
  name: string
  slug: string
}

/** A category tree assembled client-side from the flat, path-ordered list. */
export interface CategoryNode extends Category {
  children: CategoryNode[]
}

/**
 * Builds the tree from a flat list.
 *
 * The API returns categories with a materialised `path` and `depth`, not nested
 * children, so the nesting is assembled here. Orphans - a child whose parent is
 * outside the current page - are surfaced at the root rather than dropped: a
 * category silently missing from a tree is worse than one shown at the wrong
 * level.
 */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>()
  for (const category of categories) byId.set(category.id, { ...category, children: [] })

  const roots: CategoryNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sort = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    for (const node of nodes) sort(node.children)
  }
  sort(roots)

  return roots
}
