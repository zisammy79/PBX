import { mkdir, open, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from './tokens.js';
import type { AppConfig } from '../config.js';

export interface MediaStreamResult {
  stream: NodeJS.ReadableStream;
  contentType: string;
  contentLength: number;
  contentRange?: { start: number; end: number; total: number };
}

const ALLOWED_MEDIA_FORMATS = new Set(['wav', 'mp3', 'ulaw']);

@Injectable()
export class LocalMediaStorageService {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  isActive(): boolean {
    return Boolean(this.mediaRoot());
  }

  private mediaRoot(): string {
    const root = this.config.callflowMediaLocalRoot;
    if (!root) {
      throw new Error('callflow_media_root_unconfigured');
    }
    return root;
  }

  resolveContentType(format: string | null | undefined): string {
    switch ((format ?? 'wav').toLowerCase()) {
      case 'mp3':
        return 'audio/mpeg';
      case 'ulaw':
        return 'audio/basic';
      case 'wav':
      default:
        return 'audio/wav';
    }
  }

  normalizeFormat(ext: string): string {
    const lower = ext.toLowerCase().replace(/^\./, '');
    if (lower === 'ul') return 'ulaw';
    if (!ALLOWED_MEDIA_FORMATS.has(lower)) {
      throw new Error('unsupported_media_format');
    }
    return lower;
  }

  buildStorageKey(tenantId: string, fileId: string, format: string): string {
    return `${tenantId}/${fileId}.${format}`;
  }

  async saveObject(storageKey: string, data: Buffer): Promise<void> {
    const filePath = this.resolveSafePath(storageKey);
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o750 });
    await writeFile(filePath, data, { mode: 0o640 });
  }

  async objectExists(storageKey: string): Promise<boolean> {
    try {
      await stat(this.resolveSafePath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async openReadStream(
    storageKey: string,
    format: string | null | undefined,
    rangeHeader?: string,
  ): Promise<MediaStreamResult> {
    const filePath = this.resolveSafePath(storageKey);
    const info = await stat(filePath);
    const contentType = this.resolveContentType(format);
    const total = info.size;

    if (!rangeHeader) {
      return {
        stream: createReadStream(filePath),
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
    const chunkSize = boundedEnd - start + 1;
    const handle = await open(filePath, 'r');
    const stream = createReadStream(filePath, { start, end: boundedEnd, autoClose: true });
    stream.on('close', () => {
      void handle.close();
    });

    return {
      stream,
      contentType,
      contentLength: chunkSize,
      contentRange: { start, end: boundedEnd, total },
    };
  }

  resolveSafePath(storageKey: string): string {
    const root = path.resolve(this.mediaRoot());
    const normalizedKey = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalizedKey || normalizedKey.includes('..')) {
      throw new Error('invalid_storage_key');
    }
    const resolved = path.resolve(root, normalizedKey);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error('storage_key_outside_root');
    }
    return resolved;
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.mediaRoot(), { recursive: true, mode: 0o750 });
  }
}
