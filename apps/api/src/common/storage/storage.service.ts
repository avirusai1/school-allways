/**
 * Local file storage. Streams uploads to disk — never buffers whole files in RAM.
 * S3 lands later; import only needs a tenant-scoped path today.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ReadStream, WriteStream } from 'node:fs';

@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root =
      this.config.get<string>('STORAGE_LOCAL_ROOT') ??
      this.config.get<string>('STORAGE_ROOT') ??
      './.data/storage';
  }

  /** Relative path under the storage root. */
  importObjectKey(tenantId: string, batchId: string, filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `t/${tenantId}/imports/${batchId}/${safe}`;
  }

  absolutePath(relativeKey: string): string {
    return join(this.root, relativeKey);
  }

  async ensureDirForKey(relativeKey: string): Promise<void> {
    await fs.mkdir(dirname(this.absolutePath(relativeKey)), { recursive: true });
  }

  openWriteStream(relativeKey: string): WriteStream {
    const abs = this.absolutePath(relativeKey);
    return createWriteStream(abs);
  }

  openReadStream(relativeKey: string): ReadStream {
    return createReadStream(this.absolutePath(relativeKey));
  }

  async exists(relativeKey: string): Promise<boolean> {
    try {
      await fs.access(this.absolutePath(relativeKey));
      return true;
    } catch {
      return false;
    }
  }

  async writeBuffer(relativeKey: string, data: Buffer): Promise<void> {
    await this.ensureDirForKey(relativeKey);
    await fs.writeFile(this.absolutePath(relativeKey), data);
  }

  async readBuffer(relativeKey: string): Promise<Buffer> {
    return fs.readFile(this.absolutePath(relativeKey));
  }
}
