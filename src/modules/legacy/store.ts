import { randomBytes } from "node:crypto";

/**
 * In-memory skladište generisanih `.shortcut` fajlova između `create_shortcut`
 * (POST) i download rute (GET). Stateless po prirodi gateway-a: ne perzistira
 * nigde, čuva se samo do TTL-a.
 *
 * Bezbednost / resource zaštita (PROJECT_SPEC tačka 4 — "nema curenja memorije"):
 *  - `id` je 128-bitni crypto-random base64url → "capability URL": ko god zna id,
 *    može preuzeti fajl. Zato je download ruta JAVNA (bez KERYX_API_TOKEN) — id
 *    *jeste* autorizacija. Ne pogodljivo (2^128 prostor).
 *  - TTL: fajl nestaje nakon `ttlMs` (default 10 min) → ne nakuplja se zauvek.
 *  - `maxEntries`: kad se dostigne, odbacuje se najstariji (FIFO evikcija) →
 *    gornja granica memorije i zaštita od poplavljivanja create_shortcut-om.
 *  - Periodični `setInterval` cleanup (`unref`-ovan) pazi da istekli ulozi ne
 *    čekaju sledeći pristup da budu obrisani.
 */

interface StoredEntry {
  /** Sirovi `.shortcut` binary property list. */
  readonly buffer: Buffer;
  /** Ime fajla za Content-Disposition (bez ekstenzije). */
  readonly fileName: string;
  /** Unix-ms kada je entry kreiran (radi TTL i FIFO redosleda). */
  readonly createdAt: number;
}

export interface ShortcutStoreOptions {
  /** Koliko dugo (ms) entry ostaje dostupan nakon kreiranja. */
  readonly ttlMs: number;
  /** Maksimalan broj paralelnih entry-ja (FIFO evikcija). */
  readonly maxEntries: number;
  /** Interval čišćenja (ms). `unref`-uje se tako da ne drži proces živim. */
  readonly cleanupIntervalMs?: number;
}

export interface StoredShortcut {
  readonly buffer: Buffer;
  readonly fileName: string;
  /** Unix-ms kada entry ističe (createdAt + ttlMs). */
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
    // `unref`: timer ne sprečava graceful shutdown (SIGTERM u index.ts).
    this.timer = setInterval(() => this.sweep(), interval);
    this.timer.unref();
  }

  /**
   * Snima fajl i vraća nepogodljiv id. Ako je store pun, najstariji entry biva
   * izbačen pre ubacivanja novog.
   */
  put(buffer: Buffer, fileName: string): string {
    // FIFO evikcija ako smo na plafonu (Map čuva redosled umetanja).
    while (this.entries.size >= this.maxEntries && this.entries.size > 0) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
    const id = randomBytes(16).toString("base64url"); // 128-bit, URL-safe
    this.entries.set(id, {
      buffer,
      fileName,
      createdAt: Date.now(),
    });
    return id;
  }

  /** Vraća shortcut ako postoji i nije istekao; inače `undefined`. */
  get(id: string): StoredShortcut | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt >= this.ttlMs) {
      // Lazy expiry: istekao između dva sweep-a.
      this.entries.delete(id);
      return undefined;
    }
    return {
      buffer: entry.buffer,
      fileName: entry.fileName,
      expiresAt: entry.createdAt + this.ttlMs,
    };
  }

  /** Briše sve istekle entry-je. Poziva ga interni timer. */
  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt >= this.ttlMs) {
        this.entries.delete(id);
      }
    }
  }

  /** Za testove / graceful shutdown: zaustavlja cleanup timer. */
  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.entries.clear();
  }
}
