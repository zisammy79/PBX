import { Inject, Injectable } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CONFIG } from './tokens.js';
import type { AppConfig } from '../config.js';

@Injectable()
export class ObjectStorageService {
  private client: S3Client | null = null;

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.s3Endpoint &&
        this.config.s3AccessKey &&
        this.config.s3SecretKey &&
        this.config.s3Bucket,
    );
  }

  resolveContentType(format: string | null | undefined): string {
    switch ((format ?? 'wav').toLowerCase()) {
      case 'mp3':
        return 'audio/mpeg';
      case 'ogg':
        return 'audio/ogg';
      case 'wav':
      default:
        return 'audio/wav';
    }
  }

  async createPlaybackUrl(
    storageKey: string,
    format: string | null | undefined,
  ): Promise<{ playbackUrl: string; expiresAt: string; contentType: string }> {
    const client = this.getClient();
    const contentType = this.resolveContentType(format);
    const command = new GetObjectCommand({
      Bucket: this.config.s3Bucket!,
      Key: storageKey,
      ResponseContentType: contentType,
    });
    const playbackUrl = await getSignedUrl(client, command, {
      expiresIn: this.config.recordingPlaybackTtlSeconds,
    });
    const expiresAt = new Date(
      Date.now() + this.config.recordingPlaybackTtlSeconds * 1000,
    ).toISOString();
    return { playbackUrl, expiresAt, contentType };
  }

  async objectExists(storageKey: string): Promise<boolean> {
    const client = this.getClient();
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: this.config.s3Bucket!,
          Key: storageKey,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private getClient(): S3Client {
    if (!this.isConfigured()) {
      throw new Error('Object storage is not configured');
    }
    if (!this.client) {
      this.client = new S3Client({
        region: this.config.s3Region,
        endpoint: this.config.s3Endpoint!,
        credentials: {
          accessKeyId: this.config.s3AccessKey!,
          secretAccessKey: this.config.s3SecretKey!,
        },
        forcePathStyle: this.config.s3ForcePathStyle,
      });
    }
    return this.client;
  }
}
