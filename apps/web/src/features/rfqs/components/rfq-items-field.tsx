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
 * The repeating line-item editor, shared by RFQ create and the revise screen.
 *
 * Generic over the form shape so both hosts can use their own schema: create
 * nests it under `items` alongside the header, revise uses it standalone.
 */
export interface RfqItemsFieldProps<T extends FieldValues> {
  control: Control<T>
  register: UseFormRegister<T>
  errors: FieldErrors<T>
  title?: string
  description?: string
}

interface ItemErrors {
  customProductName?: { message?: string }
  quantity?: { message?: string }
  unit?: { message?: string }
  targetPrice?: { message?: string }
}

export function RfqItemsField<T extends FieldValues>({
  control,
  register,
  errors,
  title = 'Lines',
  description = 'What you are asking suppliers to quote. At least one is required.',
}: RfqItemsFieldProps<T>) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items' as never,
  })

  // `errors.items` is an array with an optional root message; both shapes need
  // reading, and RHF's types do not narrow it for a generic form.
  const itemErrors = errors.items as unknown as
    (ItemErrors[] & { message?: string; root?: { message?: string } }) | undefined
  const listMessage = itemErrors?.message ?? itemErrors?.root?.message

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-gap-lg">
        <p className="text-xs text-content-muted">{description}</p>

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
              <div className="sm:col-span-5">
                <Label htmlFor={`items.${index}.customProductName`} required>
                  Line {index + 1}
                </Label>
                <Input
                  id={`items.${index}.customProductName`}
                  className="mt-gap-xs"
                  placeholder="Black pepper, 550 g/l"
                  invalid={Boolean(rowErrors?.customProductName)}
                  {...register(`items.${index}.customProductName` as Path<T>)}
                />
                {rowErrors?.customProductName ? (
                  <p className="mt-gap-xs text-xs text-danger" role="alert">
                    {rowErrors.customProductName.message}
                  </p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor={`items.${index}.quantity`} required>
                  Quantity
                </Label>
                <Input
                  id={`items.${index}.quantity`}
                  className="mt-gap-xs"
                  type="number"
                  step="any"
                  min="0"
                  invalid={Boolean(rowErrors?.quantity)}
                  {...register(`items.${index}.quantity` as Path<T>)}
                />
                {rowErrors?.quantity ? (
                  <p className="mt-gap-xs text-xs text-danger" role="alert">
                    {rowErrors.quantity.message}
                  </p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor={`items.${index}.unit`} required>
                  Unit
                </Label>
                <Input
                  id={`items.${index}.unit`}
                  className="mt-gap-xs"
                  placeholder="MT"
                  invalid={Boolean(rowErrors?.unit)}
                  {...register(`items.${index}.unit` as Path<T>)}
                />
                {rowErrors?.unit ? (
                  <p className="mt-gap-xs text-xs text-danger" role="alert">
                    {rowErrors.unit.message}
                  </p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor={`items.${index}.targetPrice`}>Target price</Label>
                <Input
                  id={`items.${index}.targetPrice`}
                  className="mt-gap-xs"
                  type="number"
                  step="any"
                  min="0"
                  invalid={Boolean(rowErrors?.targetPrice)}
                  {...register(`items.${index}.targetPrice` as Path<T>)}
                />
              </div>

              <div className="flex items-end sm:col-span-1">
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
