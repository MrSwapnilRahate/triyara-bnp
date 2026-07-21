import { z } from 'zod'

// Fail-fast environment validation. Each app calls createEnv with its own schema.
export function createEnv<T extends z.ZodRawShape>(
  shape: T,
  runtime: Record<string, string | undefined> = process.env,
): z.infer<z.ZodObject<T>> {
  const parsed = z.object(shape).safeParse(runtime)
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    throw new Error(`Invalid environment variables: ${JSON.stringify(fields)}`)
  }
  return parsed.data
}
