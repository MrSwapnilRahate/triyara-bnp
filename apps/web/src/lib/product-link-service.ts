import { createProductLinkService } from '@triyara/core'
import { productLinkRepository } from '@triyara/db'

export const productLinkService = createProductLinkService({ repo: productLinkRepository })
