'use client'

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@triyara/ui'
import { Plus, Trash2 } from 'lucide-react'
import {
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
  useFieldArray,
  type UseFormRegister,
} from 'react-hook-form'

import { emptyLine } from './line-schema'

/**
 * The repeating line editor, shared by quotation create and the line editor.
 *
 * `showCost` is driven by whether the caller can see cost at all. A user whose
 * role has cost redacted is not shown the field: asking for a number the server
 * will not show back is a way of manufacturing confusion, and leaving it blank
 * would silently zero a margin the API is deliberately hiding.
 */
export interface QuotationLinesFieldProps<T extends FieldValues> {
  control: Control<T>
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  showCost: boolean
  currency: string
  title?: string
  description?: string
}

interface LineErrors {
  customProductName?: { message?: string }
  quantity?: { message?: string }
  unit?: { message?: string }
  unitPrice?: { message?: string }
  unitCost?: { message?: string }
  hsCode?: { message?: string }
}

export function QuotationLinesField<T extends FieldValues>({
  control,
  register,
  errors,
  showCost,
  currency,
  title = 'Lines',
  description = 'What you are quoting, and at what price. At least one line is required.',
}: QuotationLinesFieldProps<T>) {
  const { fields, append, remove } = useFieldArray({ control, name: 'items' as never })

  const itemErrors = errors.items as unknown as
    (LineErrors[] & { message?: string; root?: { message?: string } }) | undefined
  const listMessage = itemErrors?.message ?? itemErrors?.root?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-gap-lg">
        <p className="text-xs text-content-muted">
          {description} Prices are in {currency}. Totals are calculated by the server when you save.
        </p>

        {listMessage ? (
          <p className="text-xs text-danger" role="alert">
            {listMessage}
          </p>
        ) : null}

        {fields.map((field, index) => {
          const rowErrors = Array.isArray(itemErrors) ? itemErrors[index] : undefined
          return (
            <div
              key={field.id}
              className="grid gap-gap-lg rounded-md border border-line p-gap-lg sm:grid-cols-12"
            >
              <Field
                className="sm:col-span-4"
                id={`items.${index}.customProductName`}
                label={`Line ${index + 1}`}
                required
                error={rowErrors?.customProductName?.message}
              >
                <Input
                  id={`items.${index}.customProductName`}
                  placeholder="Turmeric powder, 5% curcumin"
                  invalid={Boolean(rowErrors?.customProductName)}
                  {...register(`items.${index}.customProductName` as Path<T>)}
                />
              </Field>

              <Field
                className="sm:col-span-2"
                id={`items.${index}.quantity`}
                label="Quantity"
                required
                error={rowErrors?.quantity?.message}
              >
                <Input
                  id={`items.${index}.quantity`}
                  type="number"
                  step="any"
                  min="0"
                  invalid={Boolean(rowErrors?.quantity)}
                  {...register(`items.${index}.quantity` as Path<T>)}
                />
              </Field>

              <Field
                className="sm:col-span-1"
                id={`items.${index}.unit`}
                label="Unit"
                required
                error={rowErrors?.unit?.message}
              >
                <Input
                  id={`items.${index}.unit`}
                  placeholder="MT"
                  invalid={Boolean(rowErrors?.unit)}
                  {...register(`items.${index}.unit` as Path<T>)}
                />
              </Field>

              <Field
                className="sm:col-span-2"
                id={`items.${index}.unitPrice`}
                label="Unit price"
                required
                error={rowErrors?.unitPrice?.message}
              >
                <Input
                  id={`items.${index}.unitPrice`}
                  type="number"
                  step="any"
                  min="0"
                  invalid={Boolean(rowErrors?.unitPrice)}
                  {...register(`items.${index}.unitPrice` as Path<T>)}
                />
              </Field>

              {showCost ? (
                <Field
                  className="sm:col-span-2"
                  id={`items.${index}.unitCost`}
                  label="Unit cost"
                  hint="Internal"
                  error={rowErrors?.unitCost?.message}
                >
                  <Input
                    id={`items.${index}.unitCost`}
                    type="number"
                    step="any"
                    min="0"
                    invalid={Boolean(rowErrors?.unitCost)}
                    {...register(`items.${index}.unitCost` as Path<T>)}
                  />
                </Field>
              ) : null}

              <div className={`flex items-end ${showCost ? 'sm:col-span-1' : 'sm:col-span-3'}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove line ${index + 1}`}
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          leadingIcon={<Plus />}
          onClick={() => append(emptyLine as never)}
        >
          Add line
        </Button>
      </CardContent>
    </Card>
  )
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <div className="mt-gap-xs">{children}</div>
      {error ? (
        <p className="mt-gap-xs text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-gap-xs text-xs text-content-subtle">{hint}</p>
      ) : null}
    </div>
  )
}
