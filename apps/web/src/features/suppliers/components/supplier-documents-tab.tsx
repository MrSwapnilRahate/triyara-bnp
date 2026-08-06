'use client'

import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  useToast,
} from '@triyara/ui'
import { SUPPLIER_DOCUMENT_TYPES } from '@triyara/validation'
import { Download, FileText, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useAbility } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import {
  useDeleteSupplierDocument,
  useReplaceSupplierDocument,
  useSupplierDocuments,
  useUploadSupplierDocument,
} from '../api/suppliers'
import type { SupplierDocumentRow } from '../types'

/**
 * Supplier documents (TRY-BNP-SUPPLIER-DOC).
 *
 * Where the company profile, catalogue, GST scan and factory photographs live,
 * so nobody has to scroll back through a chat to find the file a supplier sent
 * three weeks ago.
 *
 * Editing is gated on `update SupplierProfile` - ADMIN and EXPORT_MANAGER. A
 * lesser role can see and download, which is the common case for anyone
 * answering a buyer.
 */

const TYPE_LABELS: Record<string, string> = {
  GST: 'GST',
  IEC: 'IEC',
  PAN: 'PAN',
  CANCELLED_CHEQUE: 'Cancelled cheque',
  MSME: 'MSME',
  IMPORT_EXPORT_LICENSE: 'Import/export licence',
  FACTORY_LICENSE: 'Factory licence',
  COMPANY_PROFILE: 'Company profile',
  CATALOG: 'Catalogue',
  LAB_REPORT: 'Lab report',
  AGREEMENT: 'Agreement',
  OTHER: 'Other',
}

function fileSize(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Photographs and PDFs are worth previewing; a spreadsheet is not. */
const previewable = (mime: string | null) =>
  Boolean(mime && (mime.startsWith('image/') || mime === 'application/pdf'))

export function SupplierDocumentsTab({ supplierId }: { supplierId: string }) {
  const ability = useAbility()
  const canWrite = ability.can('update', 'SupplierProfile')

  const documents = useSupplierDocuments(supplierId)
  const remove = useDeleteSupplierDocument(supplierId)
  const replace = useReplaceSupplierDocument(supplierId)
  const toast = useToast()

  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<SupplierDocumentRow | null>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  const [replacing, setReplacing] = useState<SupplierDocumentRow | null>(null)

  if (documents.isPending)
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-48" />
        <Skeleton className="mt-gap-lg h-40 w-full max-w-3xl" />
      </div>
    )

  if (documents.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={documents.error} onRetry={() => void documents.refetch()} />
      </div>
    )

  const rows = documents.data

  async function onReplaceChosen(file: File | undefined) {
    if (!file || !replacing) return
    try {
      await replace.mutateAsync({ id: replacing.id, file, version: replacing.version })
      toast.success('File replaced')
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
      })
    } finally {
      setReplacing(null)
      if (replaceInput.current) replaceInput.current.value = ''
    }
  }

  return (
    <div className="p-gutter">
      <div className="mx-auto max-w-3xl">
        <div className="mb-gap-lg flex items-center justify-between gap-gap-lg">
          <p className="text-xs text-content-muted">
            {rows.length === 0
              ? 'Nothing uploaded yet.'
              : `${rows.length} ${rows.length === 1 ? 'file' : 'files'}`}
          </p>
          {canWrite ? (
            <Button size="sm" variant="secondary" onClick={() => setUploading(true)}>
              <Plus />
              Upload document
            </Button>
          ) : null}
        </div>

        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<FileText />}
                title="No documents yet"
                description="Company profile, catalogue, GST, IEC, factory photographs — whatever the supplier sends, keep it here rather than in the chat."
              />
            ) : (
              <ul>
                {rows.map((row, index) => (
                  <li key={row.id}>
                    {index > 0 ? <Separator /> : null}
                    <div className="flex items-start justify-between gap-gap-lg px-gutter py-gap-lg">
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-content">
                          {row.title ?? TYPE_LABELS[row.type] ?? row.type}
                        </p>
                        <div className="mt-gap-xs flex flex-wrap items-center gap-gap">
                          <Badge size="sm" tone="neutral">
                            {TYPE_LABELS[row.type] ?? row.type}
                          </Badge>
                          <span className="text-xs text-content-muted">
                            {fileSize(row.fileSize)}
                          </span>
                          <span className="text-xs text-content-subtle">
                            {new Date(row.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {row.documentNumber ? (
                          <p className="mt-gap-xs font-mono text-xs text-content-muted">
                            {row.documentNumber}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-gap">
                        {previewable(row.mimeType) ? (
                          <Button size="sm" variant="ghost" asChild>
                            <a
                              href={`/api/suppliers/${supplierId}/documents/${row.id}/download?disposition=inline`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Preview
                            </a>
                          </Button>
                        ) : null}
                        <Button size="sm" variant="ghost" asChild>
                          <a
                            href={`/api/suppliers/${supplierId}/documents/${row.id}/download`}
                            aria-label={`Download ${row.title ?? row.type}`}
                          >
                            <Download />
                          </a>
                        </Button>
                        {canWrite ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Replace ${row.title ?? row.type}`}
                              onClick={() => {
                                setReplacing(row)
                                replaceInput.current?.click()
                              }}
                              disabled={replace.isPending}
                            >
                              <RefreshCw />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Remove ${row.title ?? row.type}`}
                              onClick={() => setDeleting(row)}
                            >
                              <Trash2 />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* One hidden input serves every row's Replace button. */}
      <input
        ref={replaceInput}
        type="file"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void onReplaceChosen(e.target.files?.[0])}
      />

      {uploading ? (
        <UploadDialog supplierId={supplierId} onClose={() => setUploading(false)} />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Remove ${deleting?.title ?? 'this document'}?`}
        description="It stops appearing on this supplier. The audit trail keeps a record that it was here."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={async () => {
          if (!deleting) return
          await remove.mutateAsync({ id: deleting.id, version: deleting.version })
          toast.success('Document removed')
        }}
      />
    </div>
  )
}

function UploadDialog({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const toast = useToast()
  const upload = useUploadSupplierDocument(supplierId)

  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState<string>('COMPANY_PROFILE')
  const [title, setTitle] = useState('')
  const [documentNumber, setDocumentNumber] = useState('')

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return
    try {
      await upload.mutateAsync({
        file,
        meta: {
          type: type as never,
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(documentNumber.trim() ? { documentNumber: documentNumber.trim() } : {}),
        },
      })
      toast.success('Document uploaded')
      onClose()
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
        ...(described.requestId ? { requestId: described.requestId } : {}),
      })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <DialogBody className="grid gap-gap-lg">
            <div>
              <Label htmlFor="doc-file" required>
                File
              </Label>
              <Input
                id="doc-file"
                type="file"
                className="mt-gap-xs"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-gap-xs text-xs text-content-subtle">
                PDF, images and office documents, up to 20 MB.
              </p>
            </div>

            <div className="grid gap-gap-lg sm:grid-cols-2">
              <div>
                <Label htmlFor="doc-type" required>
                  Type
                </Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="doc-type" className="mt-gap-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPLIER_DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t] ?? t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="doc-number">Reference number</Label>
                <Input
                  id="doc-number"
                  className="mt-gap-xs"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                className="mt-gap-xs"
                placeholder="Spice catalogue 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <p className="mt-gap-xs text-xs text-content-subtle">
                What someone should see in the list. Defaults to the document type.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={upload.isPending} disabled={!file}>
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
