'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');

/**
 * CredentialAuditContract — Hyperledger Fabric chaincode
 *
 * Stores privacy-preserving audit records for NexusID credential lifecycle events.
 * NEVER stores raw personal data — only hashes and metadata.
 *
 * Key space:
 *   cred:{credentialId}           → issuance record
 *   ver:{credentialId}:{timestamp} → verification event
 */
class CredentialAuditContract extends Contract {

  constructor() {
    super('CredentialAuditContract');
  }

  // ─── INIT ────────────────────────────────────────────────────────────────

  /**
   * initLedger — called once when chaincode is deployed.
   * Seeds the ledger with a genesis record for operational confirmation.
   */
  async initLedger(ctx) {
    console.info('=== CredentialAuditContract: initLedger ===');

    const genesis = {
      type: 'GENESIS',
      contract: 'CredentialAuditContract',
      version: '1.0.0',
      initializedAt: new Date().toISOString(),
      network: 'nexusid-channel',
    };

    await ctx.stub.putState('__genesis__', Buffer.from(JSON.stringify(genesis)));

    console.info('Ledger initialized successfully');
    return JSON.stringify(genesis);
  }

  // ─── ISSUANCE ────────────────────────────────────────────────────────────

  /**
   * logIssuance — records that a credential was issued.
   *
   * @param {string} credentialId    - UUID of the credential (from issuer service)
   * @param {string} issuerDID       - e.g. "nadra.gov.pk"
   * @param {string} subjectHash     - SHA-256 of raw subject (CNIC / reg number); hashed by caller
   * @param {string} credentialType  - 'identity' | 'education' | 'employment' | 'enrollment'
   * @param {string} timestamp       - ISO 8601 string
   */
  async logIssuance(ctx, credentialId, issuerDID, subjectHash, credentialType, timestamp) {
    console.info(`logIssuance: credentialId=${credentialId} issuer=${issuerDID} type=${credentialType}`);

    _validateArgs({ credentialId, issuerDID, subjectHash, credentialType, timestamp });

    // Validate credential type
    const validTypes = ['identity', 'education', 'employment', 'enrollment'];
    if (!validTypes.includes(credentialType)) {
      throw new Error(`Invalid credentialType "${credentialType}". Must be one of: ${validTypes.join(', ')}`);
    }

    // Check for duplicate issuance
    const existing = await ctx.stub.getState(_credKey(credentialId));
    if (existing && existing.length > 0) {
      throw new Error(`Credential ${credentialId} already logged. Use logIssuance only once per credential.`);
    }

    const record = {
      credentialId,
      issuerDID,
      subjectHash,       // SHA-256 — no raw PII ever touches the ledger
      credentialType,
      event: 'ISSUED',
      timestamp,
      txId: ctx.stub.getTxID(),
      revoked: false,
      revocationReason: null,
      revocationTimestamp: null,
    };

    await ctx.stub.putState(_credKey(credentialId), _toBuffer(record));

    // Emit chaincode event for event listeners
    const eventPayload = {
      credentialId,
      issuerDID,
      credentialType,
      timestamp,
      txId: record.txId,
    };
    ctx.stub.setEvent('CredentialIssued', _toBuffer(eventPayload));

    console.info(`Issuance logged: ${credentialId}`);
    return JSON.stringify(record);
  }

  // ─── VERIFICATION ────────────────────────────────────────────────────────

  /**
   * logVerification — records that a credential was verified by a verifier.
   *
   * Verification events are stored under a composite key to allow multiple
   * verifications per credential without overwriting the issuance record.
   *
   * @param {string} credentialId        - UUID of the credential used
   * @param {string} verifierIdHash      - SHA-256 of verifier domain; hashed by caller
   * @param {string} disclosedFieldNames - JSON array of field NAMES (no values)
   * @param {string} timestamp           - ISO 8601 string
   */
  async logVerification(ctx, credentialId, verifierIdHash, disclosedFieldNames, timestamp) {
    console.info(`logVerification: credentialId=${credentialId}`);

    _validateArgs({ credentialId, verifierIdHash, disclosedFieldNames, timestamp });

    // Verify the credential exists in the ledger
    const credBytes = await ctx.stub.getState(_credKey(credentialId));
    if (!credBytes || credBytes.length === 0) {
      throw new Error(`Credential ${credentialId} not found. Must be issued before verification can be logged.`);
    }

    const cred = JSON.parse(credBytes.toString());
    if (cred.revoked) {
      throw new Error(`Credential ${credentialId} is revoked. Verification of revoked credentials cannot be logged.`);
    }

    // Parse and validate field names (no values — privacy by design)
    let fieldNames;
    try {
      fieldNames = JSON.parse(disclosedFieldNames);
      if (!Array.isArray(fieldNames)) throw new Error('Not an array');
    } catch {
      throw new Error('disclosedFieldNames must be a valid JSON array of field name strings');
    }

    const verRecord = {
      credentialId,
      verifierIdHash,    // hashed — actual domain never stored on ledger
      disclosedFieldNames: fieldNames,  // field names only, no values
      event: 'VERIFIED',
      timestamp,
      txId: ctx.stub.getTxID(),
    };

    // Composite key: ver:{credentialId}:{timestamp} (timestamp ensures uniqueness)
    const verKey = _verKey(credentialId, timestamp);
    await ctx.stub.putState(verKey, _toBuffer(verRecord));

    // Emit event
    const eventPayload = {
      credentialId,
      verifierIdHash,
      fieldCount: fieldNames.length,
      timestamp,
      txId: verRecord.txId,
    };
    ctx.stub.setEvent('CredentialVerified', _toBuffer(eventPayload));

    console.info(`Verification logged: ${credentialId} at ${timestamp}`);
    return JSON.stringify(verRecord);
  }

  // ─── REVOCATION ──────────────────────────────────────────────────────────

  /**
   * revokeCredential — marks a credential as revoked.
   * Once revoked, the credential cannot be un-revoked (append-only ledger).
   *
   * @param {string} credentialId  - UUID of the credential to revoke
   * @param {string} reason        - Human-readable reason (e.g. "Document expired")
   * @param {string} timestamp     - ISO 8601 string of revocation time
   */
  async revokeCredential(ctx, credentialId, reason, timestamp) {
    console.info(`revokeCredential: credentialId=${credentialId}`);

    _validateArgs({ credentialId, reason, timestamp });

    const credBytes = await ctx.stub.getState(_credKey(credentialId));
    if (!credBytes || credBytes.length === 0) {
      throw new Error(`Credential ${credentialId} not found on ledger.`);
    }

    const record = JSON.parse(credBytes.toString());

    if (record.revoked) {
      throw new Error(`Credential ${credentialId} is already revoked.`);
    }

    record.revoked = true;
    record.revocationReason = reason;
    record.revocationTimestamp = timestamp;
    record.revocationTxId = ctx.stub.getTxID();

    await ctx.stub.putState(_credKey(credentialId), _toBuffer(record));

    const eventPayload = {
      credentialId,
      reason,
      timestamp,
      txId: record.revocationTxId,
    };
    ctx.stub.setEvent('CredentialRevoked', _toBuffer(eventPayload));

    console.info(`Revoked: ${credentialId}`);
    return JSON.stringify({
      credentialId,
      revoked: true,
      revocationReason: reason,
      revocationTimestamp: timestamp,
      txId: record.revocationTxId,
    });
  }

  // ─── QUERIES ─────────────────────────────────────────────────────────────

  /**
   * checkRevocation — returns current revocation status.
   * This is an evaluate (read-only) transaction — no ledger write.
   *
   * @param {string} credentialId
   */
  async checkRevocation(ctx, credentialId) {
    console.info(`checkRevocation: credentialId=${credentialId}`);

    _validateArgs({ credentialId });

    const credBytes = await ctx.stub.getState(_credKey(credentialId));
    if (!credBytes || credBytes.length === 0) {
      // Not found — treat as not revoked to avoid blocking unknown credentials
      return JSON.stringify({ revoked: false, found: false });
    }

    const record = JSON.parse(credBytes.toString());
    const response = {
      revoked: record.revoked,
      found: true,
    };

    if (record.revoked) {
      response.reason = record.revocationReason;
      response.revokedAt = record.revocationTimestamp;
    }

    return JSON.stringify(response);
  }

  /**
   * getCredentialHistory — returns the full ledger history for a credential key.
   * Shows every state change including the raw transaction records.
   *
   * @param {string} credentialId
   */
  async getCredentialHistory(ctx, credentialId) {
    console.info(`getCredentialHistory: credentialId=${credentialId}`);

    _validateArgs({ credentialId });

    const historyIterator = await ctx.stub.getHistoryForKey(_credKey(credentialId));
    const results = [];

    while (true) {
      const result = await historyIterator.next();
      if (result.done) break;

      const item = result.value;
      const record = {
        txId: item.txId,
        timestamp: _fabricTimestampToISO(item.timestamp),
        isDelete: item.isDelete,
        value: null,
      };

      if (!item.isDelete && item.value && item.value.length > 0) {
        try {
          record.value = JSON.parse(item.value.toString());
        } catch {
          record.value = item.value.toString();
        }
      }

      results.push(record);
    }

    await historyIterator.close();

    console.info(`History for ${credentialId}: ${results.length} records`);
    return JSON.stringify(results);
  }

  /**
   * getIssuanceRecord — returns the current issuance state for a credential.
   * Useful for verifiers to confirm a credential exists on-chain.
   */
  async getIssuanceRecord(ctx, credentialId) {
    _validateArgs({ credentialId });

    const credBytes = await ctx.stub.getState(_credKey(credentialId));
    if (!credBytes || credBytes.length === 0) {
      throw new Error(`Credential ${credentialId} not found on ledger.`);
    }

    return credBytes.toString();
  }
}

// ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

/** Ledger key for issuance record */
function _credKey(credentialId) {
  return `cred:${credentialId}`;
}

/** Ledger key for a verification event (composite, per-timestamp) */
function _verKey(credentialId, timestamp) {
  // Replace colons in ISO timestamp to avoid key parsing ambiguity
  const safeTs = timestamp.replace(/[:.]/g, '-');
  return `ver:${credentialId}:${safeTs}`;
}

/** Serialize an object to Buffer */
function _toBuffer(obj) {
  return Buffer.from(JSON.stringify(obj));
}

/** Validate that required args are non-empty strings */
function _validateArgs(args) {
  for (const [key, value] of Object.entries(args)) {
    if (!value || typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Argument "${key}" is required and must be a non-empty string. Got: ${JSON.stringify(value)}`);
    }
  }
}

/** Convert Fabric's google.protobuf.Timestamp to ISO 8601 string */
function _fabricTimestampToISO(fabricTimestamp) {
  if (!fabricTimestamp) return null;
  try {
    const seconds = fabricTimestamp.seconds
      ? (typeof fabricTimestamp.seconds.toNumber === 'function'
          ? fabricTimestamp.seconds.toNumber()
          : Number(fabricTimestamp.seconds))
      : 0;
    return new Date(seconds * 1000).toISOString();
  } catch {
    return null;
  }
}

module.exports = CredentialAuditContract;
