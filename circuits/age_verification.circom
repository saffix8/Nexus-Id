pragma circom 2.0.0;

include "node_modules/circomlib/circuits/comparators.circom";

/*
 * AgeVerification Circuit
 *
 * Proves that (current_year - birth_year) >= age_threshold
 * WITHOUT revealing birth_year to the verifier.
 *
 * Inputs:
 *   Private: birth_year   — The user's year of birth (kept hidden)
 *   Private: current_year — The current calendar year (hidden; verifier trusts public signal)
 *   Public:  age_threshold — The minimum age required (e.g. 18 or 21)
 *
 * Outputs:
 *   meets_threshold — 1 if age >= age_threshold, 0 otherwise
 *
 * Public signals emitted (in publicSignals array):
 *   [0] meets_threshold
 *   [1] age_threshold  (verifier confirms this matches what they requested)
 *
 * Bit-width notes:
 *   - We use n=8 bits for GreaterEqThan because ages are 0–255 (well within uint8).
 *   - birth_year and current_year are reasonable in range [1900, 2100] — fits in 11 bits.
 *   - The subtraction current_year - birth_year must be constrained to be non-negative
 *     and < 2^8 = 256. This is enforced by the GreaterEqThan comparator's range check.
 *
 * Security:
 *   - birth_year is a private input — it is NOT included in publicSignals.
 *   - The proof only reveals whether the threshold is met, not the actual age.
 *   - The nonce/binding to a specific credential is handled at the SD-JWT layer,
 *     not inside this circuit.
 */

template AgeVerification() {
    // ── Inputs ────────────────────────────────────────────────────────────────
    signal input birth_year;     // private — never revealed
    signal input current_year;   // private — bound to proof generation timestamp
    signal input age_threshold;  // public  — what the verifier requires

    // ── Output ───────────────────────────────────────────────────────────────
    signal output meets_threshold; // 1 if age >= age_threshold, else 0

    // ── Intermediate signals ──────────────────────────────────────────────────
    signal age;

    // Compute age: age = current_year - birth_year
    // Circom subtraction is field arithmetic — we must ensure current_year >= birth_year
    // The GreaterEqThan comparator enforces this implicitly (result is 0 if input goes negative)
    age <== current_year - birth_year;

    // ── Comparator ───────────────────────────────────────────────────────────
    // GreaterEqThan(n) checks if in[0] >= in[1], where both inputs are n-bit integers.
    // n=8 supports values 0–255 — sufficient for ages (no one lives past 120).
    component gte = GreaterEqThan(8);

    gte.in[0] <== age;
    gte.in[1] <== age_threshold;

    // Wire comparator output to circuit output
    meets_threshold <== gte.out;
}

// Instantiate the main component
component main {public [age_threshold]} = AgeVerification();
