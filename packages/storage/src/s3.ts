import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import type { ObjectStat, PresignedUpload, StorageProvider } from './types'

export interface S3Config {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
  forcePathStyle?: boolean
}

// One S3-compatible adapter serves both AWS S3 and Cloudflare R2 (R2 is S3-compatible;
// only the endpoint differs). No provider-specific logic ever leaks into services.
export class S3CompatibleStorage implements StorageProvider {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(cfg: S3Config) {
    this.bucket = cfg.bucket
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle ?? Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    })
  }

  async createUploadUrl({
    storageKey,
    mimeType,
  }: {
    storageKey: string
    mimeType: string
    maxBytes: number
  }): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, ContentType: mimeType }),
      { expiresIn: 900 },
    )
    return {
      uploadUrl: url,
      method: 'PUT',
      headers: { 'content-type': mimeType },
      storageKey,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    }
  }

  createDownloadUrl({
    storageKey,
    downloadName,
    contentType,
    disposition = 'attachment',
    expiresInSeconds = 300,
  }: {
    storageKey: string
    downloadName?: string
    contentType?: string
    disposition?: 'inline' | 'attachment'
    expiresInSeconds?: number
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ResponseContentType: contentType,
        ResponseContentDisposition: downloadName
          ? `${disposition}; filename="${downloadName}"`
          : undefined,
      }),
      { expiresIn: expiresInSeconds },
    )
  }

  async stat(storageKey: string): Promise<ObjectStat | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      )
      return { size: res.ContentLength ?? 0, checksum: (res.ETag ?? '').replace(/"/g, '') }
    } catch {
      return null
    }
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }))
  }
}

export function createR2Storage(cfg: S3Config): StorageProvider {
  return new S3CompatibleStorage({ ...cfg, forcePathStyle: true })
}

export function createS3Storage(cfg: S3Config): StorageProvider {
  return new S3CompatibleStorage(cfg)
}
