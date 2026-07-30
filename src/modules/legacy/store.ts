import { randomBytes } from "node:crypto";

/**
 * In-memory skladište generisanih `.shortcut` fajlova.
 *
 * Bezbednosna svojstva:
 * - 128-bitni crypto-random capability ID;
 * - kratak TTL;
 * - ograničen broj entry-ja sa FIFO evikcijom;
 * - periodično čišćenje;
 * - `take()` briše fajl pri prvom uspešnom preuzimanju.
 */
interface StoredEntry {
  readonly buffer: Buffer;
  readonly fileName: string;
  readonly createdAt: number;
}

export interface ShortcutStoreOptions {
  readonly ttlMs: number;
  readonly maxEntries: number;
  readonly cleanupIntervalMs?: number;
}

export interface StoredShortcut {
  readonly buffer: Buffer;
  readonly fileName: string;
  readonly expiresAt: number;
}

export class ShortcutStore {
  private readonly entries = new Map<string, StoredEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly timer?: NodeJS.Timeout;

  constructor(opts: ShortcutStoreOptions) {
    this.ttlMs = opts.ttlMs;
    this.maxEntries = opts.maxEntries;
    const interval = opts.cleanupIntervalMs ?? Math.min(opts.ttlMs, 60_000);
    this.timer = setInterval(() => this.sweep(), interval);
    this.timer.unref();
  }

  put(buffer: Buffer, fileName: string): string {
    while (this.entries.size >= this.maxEntries && this.entries.size > 0) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }

    const id = randomBytes(16).toString("base64url");
    this.entries.set(id, { buffer, fileName, createdAt: Date.now() });
    return id;
  }

  /** Vraća entry bez brisanja; koristi se za metapodatke i testove. */
  get(id: string): StoredShortcut | undefined {
    const entry = this.validEntry(id);
    if (!entry) return undefined;
    return this.toPublic(entry);
  }

  /**
   * Vraća entry i odmah ga briše. Download URL je zato jednokratan čak i pre
   * isteka TTL-a, što smanjuje rizik ponovnog preuzimanja fajla sa ugrađenim
   * ciljnim bearer tokenom.
   */
  take(id: string): StoredShortcut | undefined {
    const entry = this.validEntry(id);
    if (!entry) return undefined;
    this.entries.delete(id);
    return this.toPublic(entry);
  }

  private validEntry(id: string): StoredEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt >= this.ttlMs) {
      this.entries.delete(id);
      return undefined;
    }
    return entry;
  }

  private toPublic(entry: StoredEntry): StoredShortcut {
    return {
      buffer: entry.buffer,
      fileName: entry.fileName,
      expiresAt: entry.createdAt + this.ttlMs,
    };
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt >= this.ttlMs) this.entries.delete(id);
    }
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.entries.clear();
  }
}
