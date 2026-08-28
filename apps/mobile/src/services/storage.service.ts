/**
 * storage.service.ts
 * NexusID Mobile — Local encrypted SQLite storage
 *
 * Manages credentials and verification data on-device.
 * Encryption key is derived from react-native-keychain (device-specific).
 */

import SQLite, {
  SQLiteDatabase,
  Transaction,
  ResultSet,
} from 'react-native-sqlite-storage';
import * as Keychain from 'react-native-keychain';
import type { SDJWTCredential, CredentialType } from '@nexusid/types';

// ─── Local Types ─────────────────────────────────────────────────────────────

export interface VerificationHistoryRecord {
  id: string;
  credential_id: string;
  verifier_id: string;
  verifier_name: string | null;
  disclosed_fields: string[];   // field names that were shared
  timestamp: string;            // ISO 8601
  status: 'completed' | 'rejected' | 'failed';
}

export interface PendingVerification {
  id: string;                   // verification_request_id from backend
  verifier_id: string;
  verifier_name: string | null;
  requested_fields: string[];
  nonce: string;
  expires_at: string;           // ISO 8601
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  received_at: string;          // ISO 8601
}

// ─── Storage Errors ───────────────────────────────────────────────────────────

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageNotInitializedError extends StorageError {
  constructor() {
    super('StorageService has not been initialized. Call initialize() first.');
    this.name = 'StorageNotInitializedError';
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'nexusid.db';
const KEYCHAIN_SERVICE = 'com.nexusid.dbkey';
const KEYCHAIN_ACCOUNT = 'db_encryption_key';

// ─── SQL Statements ───────────────────────────────────────────────────────────

const CREATE_CREDENTIALS_TABLE = `
  CREATE TABLE IF NOT EXISTS credentials (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    issuer       TEXT NOT NULL,
    sd_jwt       TEXT NOT NULL,
    disclosures  TEXT NOT NULL,
    issued_at    TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    display_name TEXT,
    display_icon TEXT,
    metadata     TEXT,
    created_at   TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`;

const CREATE_VERIFICATION_HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS verification_history (
    id               TEXT PRIMARY KEY,
    credential_id    TEXT NOT NULL,
    verifier_id      TEXT NOT NULL,
    verifier_name    TEXT,
    disclosed_fields TEXT NOT NULL,
    timestamp        TEXT NOT NULL,
    status           TEXT NOT NULL
  )
`;

const CREATE_PENDING_VERIFICATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS pending_verifications (
    id               TEXT PRIMARY KEY,
    verifier_id      TEXT NOT NULL,
    verifier_name    TEXT,
    requested_fields TEXT NOT NULL,
    nonce            TEXT NOT NULL,
    expires_at       TEXT NOT NULL,
    status           TEXT NOT NULL,
    received_at      TEXT NOT NULL
  )
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Promisifies SQLite executeSql.
 */
function execSQL(
  db: SQLiteDatabase,
  sql: string,
  params: (string | number | null)[] = [],
): Promise<ResultSet> {
  return new Promise((resolve, reject) => {
    db.executeSql(
      sql,
      params,
      (_tx: Transaction, result: ResultSet) => resolve(result),
      (_tx: Transaction, error: Error) => {
        reject(new StorageError(`SQL error: ${error.message}`, error));
        return false; // tells SQLite not to roll back
      },
    );
  });
}

/**
 * Maps a SQLite row to an SDJWTCredential.
 */
function rowToCredential(row: Record<string, string>): SDJWTCredential {
  return {
    id: row.id,
    type: row.type as CredentialType,
    issuer: row.issuer,
    subject: '', // subject is encoded inside sd_jwt; not stored separately
    sd_jwt: row.sd_jwt,
    disclosures: JSON.parse(row.disclosures) as string[],
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    // display_name / display_icon are UI hints — kept in metadata JSON
  } as SDJWTCredential;
}

/**
 * Maps a SQLite row to a VerificationHistoryRecord.
 */
function rowToHistoryRecord(row: Record<string, string>): VerificationHistoryRecord {
  return {
    id: row.id,
    credential_id: row.credential_id,
    verifier_id: row.verifier_id,
    verifier_name: row.verifier_name ?? null,
    disclosed_fields: JSON.parse(row.disclosed_fields) as string[],
    timestamp: row.timestamp,
    status: row.status as VerificationHistoryRecord['status'],
  };
}

/**
 * Maps a SQLite row to a PendingVerification.
 */
function rowToPendingVerification(row: Record<string, string>): PendingVerification {
  return {
    id: row.id,
    verifier_id: row.verifier_id,
    verifier_name: row.verifier_name ?? null,
    requested_fields: JSON.parse(row.requested_fields) as string[],
    nonce: row.nonce,
    expires_at: row.expires_at,
    status: row.status as PendingVerification['status'],
    received_at: row.received_at,
  };
}

// ─── StorageService ───────────────────────────────────────────────────────────

class StorageService {
  private db: SQLiteDatabase | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Opens (or creates) the encrypted SQLite database and ensures all tables exist.
   * Must be called once at app startup before any other method.
   */
  async initialize(): Promise<void> {
    if (this.db) return; // already initialized

    try {
      const encryptionKey = await this.getOrCreateEncryptionKey();

      SQLite.enablePromise(true);

      this.db = await SQLite.openDatabase({
        name: DB_NAME,
        location: 'default',
        // react-native-sqlite-storage supports SQLCipher when compiled with it.
        // Pass the key here; the library forwards it to PRAGMA key='...'.
        key: encryptionKey,
      });

      await this.createTables();
    } catch (error) {
      throw new StorageError('Failed to initialize database', error);
    }
  }

  /**
   * Retrieves an existing encryption key from the keychain, or generates and
   * stores a new one if this is the first run.
   */
  private async getOrCreateEncryptionKey(): Promise<string> {
    const existing = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE,
    });

    if (existing) {
      return existing.password;
    }

    // First run — generate a 32-byte random key (hex-encoded)
    const bytes = new Uint8Array(32);
    // React Native's global crypto is available in RN 0.69+
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // Fallback: Math.random (less secure — swap for a native module in production)
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    const key = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    await Keychain.setGenericPassword(KEYCHAIN_ACCOUNT, key, {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });

    return key;
  }

  /** Creates tables if they do not already exist. */
  private async createTables(): Promise<void> {
    const db = this.requireDb();
    await execSQL(db, CREATE_CREDENTIALS_TABLE);
    await execSQL(db, CREATE_VERIFICATION_HISTORY_TABLE);
    await execSQL(db, CREATE_PENDING_VERIFICATIONS_TABLE);
  }

  /** Throws if the database hasn't been opened yet. */
  private requireDb(): SQLiteDatabase {
    if (!this.db) throw new StorageNotInitializedError();
    return this.db;
  }

  // ── Credentials ────────────────────────────────────────────────────────────

  /**
   * Persists an SDJWTCredential.
   * Uses INSERT OR REPLACE so re-issuing an existing credential updates it in place.
   */
  async saveCredential(credential: SDJWTCredential): Promise<void> {
    const db = this.requireDb();

    const metadata = credential.metadata
      ? JSON.stringify(credential.metadata)
      : null;

    await execSQL(
      db,
      `INSERT OR REPLACE INTO credentials
        (id, type, issuer, sd_jwt, disclosures, issued_at, expires_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        credential.id,
        credential.type,
        credential.issuer,
        credential.sd_jwt,
        JSON.stringify(credential.disclosures),
        credential.issued_at,
        credential.expires_at,
        metadata,
      ],
    );
  }

  /**
   * Retrieves a single credential by id.
   * Returns null if not found.
   */
  async getCredential(id: string): Promise<SDJWTCredential | null> {
    const db = this.requireDb();
    const result = await execSQL(
      db,
      'SELECT * FROM credentials WHERE id = ? LIMIT 1',
      [id],
    );

    if (result.rows.length === 0) return null;
    return rowToCredential(result.rows.item(0) as Record<string, string>);
  }

  /**
   * Returns all credentials, ordered from newest to oldest.
   */
  async getAllCredentials(): Promise<SDJWTCredential[]> {
    const db = this.requireDb();
    const result = await execSQL(
      db,
      'SELECT * FROM credentials ORDER BY created_at DESC',
    );

    const credentials: SDJWTCredential[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      credentials.push(
        rowToCredential(result.rows.item(i) as Record<string, string>),
      );
    }
    return credentials;
  }

  /**
   * Deletes a credential and all associated history records.
   */
  async deleteCredential(id: string): Promise<void> {
    const db = this.requireDb();

    await new Promise<void>((resolve, reject) => {
      db.transaction(
        (tx) => {
          tx.executeSql('DELETE FROM verification_history WHERE credential_id = ?', [id]);
          tx.executeSql('DELETE FROM credentials WHERE id = ?', [id]);
        },
        (error) => reject(new StorageError(`Failed to delete credential ${id}`, error)),
        () => resolve(),
      );
    });
  }

  /**
   * Finds the first credential whose selectively_disclosable_fields contains
   * ALL of the requested fields.
   *
   * Returns null if no matching credential exists.
   */
  async findCredentialForFields(
    requestedFields: string[],
  ): Promise<SDJWTCredential | null> {
    if (requestedFields.length === 0) return null;

    const credentials = await this.getAllCredentials();

    for (const credential of credentials) {
      const disclosable =
        credential.metadata?.selectively_disclosable_fields ?? [];

      // Also consider always_visible_fields as satisfiable
      const alwaysVisible =
        credential.metadata?.always_visible_fields ?? [];

      const allSatisfiable = new Set([...disclosable, ...alwaysVisible]);

      const canSatisfy = requestedFields.every((field) =>
        allSatisfiable.has(field),
      );

      if (canSatisfy) return credential;
    }

    return null;
  }

  // ── Verification History ───────────────────────────────────────────────────

  /**
   * Records a completed or rejected verification event.
   */
  async saveVerificationHistory(
    record: VerificationHistoryRecord,
  ): Promise<void> {
    const db = this.requireDb();

    await execSQL(
      db,
      `INSERT OR REPLACE INTO verification_history
        (id, credential_id, verifier_id, verifier_name, disclosed_fields, timestamp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.credential_id,
        record.verifier_id,
        record.verifier_name ?? null,
        JSON.stringify(record.disclosed_fields),
        record.timestamp,
        record.status,
      ],
    );
  }

  /**
   * Returns verification history records, newest first.
   * Pass a limit to cap the result set (defaults to 100).
   */
  async getVerificationHistory(
    limit = 100,
  ): Promise<VerificationHistoryRecord[]> {
    const db = this.requireDb();
    const result = await execSQL(
      db,
      'SELECT * FROM verification_history ORDER BY timestamp DESC LIMIT ?',
      [limit],
    );

    const records: VerificationHistoryRecord[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      records.push(
        rowToHistoryRecord(result.rows.item(i) as Record<string, string>),
      );
    }
    return records;
  }

  /**
   * Deletes a single history record by id.
   */
  async deleteHistoryRecord(id: string): Promise<void> {
    const db = this.requireDb();
    await execSQL(db, 'DELETE FROM verification_history WHERE id = ?', [id]);
  }

  // ── Pending Verifications ──────────────────────────────────────────────────

  /**
   * Saves a new pending verification request received via push notification.
   */
  async savePendingVerification(request: PendingVerification): Promise<void> {
    const db = this.requireDb();

    await execSQL(
      db,
      `INSERT OR REPLACE INTO pending_verifications
        (id, verifier_id, verifier_name, requested_fields, nonce, expires_at, status, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.id,
        request.verifier_id,
        request.verifier_name ?? null,
        JSON.stringify(request.requested_fields),
        request.nonce,
        request.expires_at,
        request.status,
        request.received_at,
      ],
    );
  }

  /**
   * Retrieves a pending verification by id.
   * Returns null if not found.
   */
  async getPendingVerification(id: string): Promise<PendingVerification | null> {
    const db = this.requireDb();
    const result = await execSQL(
      db,
      'SELECT * FROM pending_verifications WHERE id = ? LIMIT 1',
      [id],
    );

    if (result.rows.length === 0) return null;
    return rowToPendingVerification(
      result.rows.item(0) as Record<string, string>,
    );
  }

  /**
   * Updates the status of a pending verification (approved / rejected / expired).
   */
  async updatePendingVerificationStatus(
    id: string,
    status: PendingVerification['status'],
  ): Promise<void> {
    const db = this.requireDb();
    await execSQL(
      db,
      'UPDATE pending_verifications SET status = ? WHERE id = ?',
      [status, id],
    );
  }

  /**
   * Deletes all pending verifications whose expires_at timestamp is in the past.
   * Call this on app startup and periodically during the session.
   */
  async clearExpiredPending(): Promise<void> {
    const db = this.requireDb();
    const now = new Date().toISOString();
    await execSQL(
      db,
      "DELETE FROM pending_verifications WHERE expires_at < ? AND status = 'pending'",
      [now],
    );
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const storageService = new StorageService();
export default storageService;
