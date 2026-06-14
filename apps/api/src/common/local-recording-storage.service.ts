import { mkdir, open, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG } from './tokens.js';
import type { AppConfig } from '../config.js';

export interface RecordingStreamResult {
  stream: NodeJS.ReadableStream;
  contentType: string;
  contentLength: number;
  contentRange?: { start: number; end: number; total: number };
}

@Injectable()
export class LocalRecordingStorageService {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  isActive(): boolean {
    return this.config.callRecordingStorageBackend === 'local';
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

  async objectExists(storageKey: string): Promise<boolean> {
    try {
      await stat(this.resolveSafePath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async statObject(storageKey: string): Promise<{ size: number }> {
    const info = await stat(this.resolveSafePath(storageKey));
    return { size: info.size };
  }

  async openReadStream(
    storageKey: string,
    format: string | null | undefined,
    rangeHeader?: string,
  ): Promise<RecordingStreamResult> {
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
    const root = path.resolve(this.config.callRecordingLocalRoot);
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
    await mkdir(this.config.callRecordingLocalRoot, { recursive: true, mode: 0o750 });
  }
}
