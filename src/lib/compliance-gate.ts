/**
 * Synchronous bilateral compliance gate (DEV-162).
 *
 * Runs at match formation as a BLOCKING step: both carriers' FMCSA authority is
 * verified live (QCMobile + SAFER) before a match/TLA can be created. This is
 * patent-relevant — see Confluence "Compliance System" and "What We're Patenting".
 * Do not introduce caching or a scheduled-refresh path: the check must fire
 * synchronously within the match-formation request.
 */
import { lookupByDOT } from './fmcsa';
import { getComplianceStatus } from './compliance';
import type {
  Driver,
  OwnerOperator,
  ComplianceSnapshot,
  PartyComplianceSnapshot,
  ComplianceGateStatus,
} from './data';

export interface ComplianceGateResult {
  decision: 'pass' | 'warn' | 'block';
  // Distinguishes an inactive-authority block (403) from an unverifiable one (422).
  blockKind?: 'authority' | 'verification';
  reason?: string;
  warnings: string[];
  snapshot: ComplianceSnapshot;
}

/** Layer 1 (authority) + Layer 3 (cross-source discrepancy) for one carrier. */
async function checkCarrier(oo: OwnerOperator): Promise<PartyComplianceSnapshot> {
  const legalName = oo.legalName || oo.companyName;
  const base = { ownerOperatorId: oo.id, legalName, dotNumber: oo.dotNumber };

  // No DOT on file — authority cannot be verified at all.
  if (!oo.dotNumber) {
    return { ...base, verified: false, status: 'Unverified' };
  }

  const result = await lookupByDOT(oo.dotNumber);
  if (!result.success || !result.carrier) {
    // FMCSA unreachable / not found — treat as unverifiable, not as "Red".
    return { ...base, verified: false, status: 'Unverified' };
  }

  const carrier = result.carrier;
  const allowed = carrier.allowedToOperate === true;
  let status: ComplianceGateStatus = 'Green';
  if (!allowed) status = 'Red'; // Layer 1: authority is the hard gate.
  else if (carrier.saferDiscrepancy) status = 'Yellow'; // Layer 3: QCMobile/SAFER disagree.

  return {
    ...base,
    verified: true,
    allowedToOperate: allowed,
    authorityStatus: carrier.authorityStatus,
    saferDiscrepancy: carrier.saferDiscrepancy === true,
    status,
  };
}

/**
 * Run the bilateral compliance gate. Both carriers are verified in parallel
 * against the live FMCSA APIs; the driver's qualification scorecard is also
 * evaluated. The match is blocked if either carrier cannot be verified or has
 * inactive authority.
 */
export async function runComplianceGate(params: {
  loadOwner: OwnerOperator; // lessee — hiring carrier
  driverOwner: OwnerOperator; // lessor — carrier supplying the driver
  driver: Driver;
}): Promise<ComplianceGateResult> {
  const { loadOwner, driverOwner, driver } = params;

  const [lessee, lessor] = await Promise.all([
    checkCarrier(loadOwner),
    checkCarrier(driverOwner),
  ]);

  // Layer 2: driver document / qualification scorecard.
  const driverStatus = getComplianceStatus(driver);

  const warnings: string[] = [];
  const snapshot: ComplianceSnapshot = {
    checkedAt: new Date().toISOString(),
    overallStatus: 'Green',
    lessor,
    lessee,
    driver: { id: driver.id, status: driverStatus },
  };

  const label = (p: PartyComplianceSnapshot) => p.legalName || p.ownerOperatorId;

  // BLOCK 1 — a carrier could not be verified. Fail closed: no match forms
  // without a successful live regulatory check.
  const unverified = !lessee.verified ? lessee : !lessor.verified ? lessor : null;
  if (unverified) {
    snapshot.overallStatus = 'Unverified';
    const why = unverified.dotNumber
      ? 'FMCSA could not be reached to verify authority — please try again shortly'
      : 'no DOT number is on file, so authority cannot be verified';
    return {
      decision: 'block',
      blockKind: 'verification',
      reason: `Compliance cannot be confirmed for ${label(unverified)}: ${why}.`,
      warnings,
      snapshot,
    };
  }

  // BLOCK 2 — a carrier's FMCSA authority is inactive. The hard gate.
  const red = lessee.status === 'Red' ? lessee : lessor.status === 'Red' ? lessor : null;
  if (red) {
    snapshot.overallStatus = 'Red';
    return {
      decision: 'block',
      blockKind: 'authority',
      reason: `${label(red)} is not currently authorized to operate by FMCSA. A match cannot be formed.`,
      warnings,
      snapshot,
    };
  }

  // WARN — match still forms, but with a recorded compliance warning.
  if (lessee.saferDiscrepancy) {
    warnings.push(`${label(lessee)}: FMCSA and SAFER records disagree — authority status should be re-verified.`);
  }
  if (lessor.saferDiscrepancy) {
    warnings.push(`${label(lessor)}: FMCSA and SAFER records disagree — authority status should be re-verified.`);
  }
  if (driverStatus === 'Red') {
    warnings.push(`Driver ${driver.name}'s qualification file is incomplete or has an expired document.`);
  } else if (driverStatus === 'Yellow') {
    warnings.push(`Driver ${driver.name} has a document expiring within 30 days.`);
  }

  if (warnings.length > 0) {
    snapshot.overallStatus = 'Yellow';
    snapshot.warnings = warnings;
    return { decision: 'warn', warnings, snapshot };
  }

  return { decision: 'pass', warnings, snapshot };
}
