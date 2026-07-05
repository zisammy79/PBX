import { Inject, Injectable } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CONFIG } from './tokens.js';
import type { AppConfig } from '../config.js';

export interface ObjectStorageStreamResult {
  stream: NodeJS.ReadableStream;
  contentType: string;
  contentLength: number;
  contentRange?: { start: number; end: number; total: number };
}

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

  async openReadStream(
    storageKey: string,
    format: string | null | undefined,
    rangeHeader?: string,
  ): Promise<ObjectStorageStreamResult> {
    const client = this.getClient();
    const contentType = this.resolveContentType(format);
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: this.config.s3Bucket!,
        Key: storageKey,
      }),
    );
    const total = Number(head.ContentLength ?? 0);
    if (!total) {
      throw new Error('recording_empty');
    }

    if (!rangeHeader) {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: this.config.s3Bucket!,
          Key: storageKey,
          ResponseContentType: contentType,
        }),
      );
      if (!response.Body) {
        throw new Error('recording_unavailable');
      }
      return {
        stream: response.Body as NodeJS.ReadableStream,
        contentType,
        contentLength: total,
      };
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      throw new RangeError('invalid_range');
    }
    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Number.parseInt(match[2], 10) : total - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      throw new RangeError('invalid_range');
    }
    const boundedEnd = Math.min(end, total - 1);
    const rangeValue = `bytes=${start}-${boundedEnd}`;
    const response = await client.send(
      new GetObjectCommand({
        Bucket: this.config.s3Bucket!,
        Key: storageKey,
        Range: rangeValue,
        ResponseContentType: contentType,
      }),
    );
    if (!response.Body) {
      throw new Error('recording_unavailable');
    }
    const contentLength = boundedEnd - start + 1;
    return {
      stream: response.Body as NodeJS.ReadableStream,
      contentType,
      contentLength,
      contentRange: { start, end: boundedEnd, total },
    };
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
