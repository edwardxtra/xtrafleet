import type { Match, TLA, OwnerOperator, Driver } from "@/lib/data";

export interface TLAGenerationData {
  match: Match;
  lessorInfo: OwnerOperator;
  lesseeInfo: OwnerOperator;
  driverInfo: Driver;
}

/**
 * Generate a TLA document from match and party data
 * Filters out undefined values to prevent Firestore errors
 */
export function generateTLA(data: TLAGenerationData): Omit<TLA, 'id'> {
  const { match, lessorInfo, lesseeInfo, driverInfo } = data;
  
  // Determine final terms (use counter terms if accepted, otherwise original)
  const finalTerms = match.counterTerms || match.originalTerms;

  // Build lessor object - only include defined values
  const lessor: TLA['lessor'] = {
    ownerOperatorId: match.driverOwnerId,
    legalName: lessorInfo.legalName || lessorInfo.companyName || 'Unknown',
    contactEmail: lessorInfo.contactEmail || '',
  };
  if (lessorInfo.dotNumber) lessor.dotNumber = lessorInfo.dotNumber;
  if (lessorInfo.mcNumber) lessor.mcNumber = lessorInfo.mcNumber;
  if (lessorInfo.phone) lessor.phone = lessorInfo.phone;

  // Build lessee object - only include defined values
  const lessee: TLA['lessee'] = {
    ownerOperatorId: match.loadOwnerId,
    legalName: lesseeInfo.legalName || lesseeInfo.companyName || 'Unknown',
    contactEmail: lesseeInfo.contactEmail || '',
  };
  if (lesseeInfo.dotNumber) lessee.dotNumber = lesseeInfo.dotNumber;
  if (lesseeInfo.mcNumber) lessee.mcNumber = lesseeInfo.mcNumber;
  if (lesseeInfo.phone) lessee.phone = lesseeInfo.phone;

  // Build driver object - only include defined values
  const driver: TLA['driver'] = {
    id: match.driverId,
    name: driverInfo.name,
  };
  if (driverInfo.cdlLicense) driver.cdlNumber = driverInfo.cdlLicense;
  if (driverInfo.medicalCardExpiry) driver.medicalCardExpiry = driverInfo.medicalCardExpiry;

  // Build trip object - only include defined values
  const trip: TLA['trip'] = {
    origin: match.loadSnapshot.origin,
    destination: match.loadSnapshot.destination,
    cargo: match.loadSnapshot.cargo,
    weight: match.loadSnapshot.weight,
    startDate: finalTerms.pickupDate || new Date().toISOString(),
  };
  if (finalTerms.deliveryDate) trip.endDate = finalTerms.deliveryDate;

  // Build payment object - only include defined values
  const payment: TLA['payment'] = {
    amount: finalTerms.rate,
  };
  if (finalTerms.deliveryDate) payment.dueDate = finalTerms.deliveryDate;

  const tla: Omit<TLA, 'id'> = {
    matchId: match.id,
    lessor,
    lessee,
    driver,
    trip,
    payment,
    insurance: {},
    status: 'pending_lessor',
    createdAt: new Date().toISOString(),
    version: 1,
  };

  return tla;
}

/**
 * Format TLA as displayable text (for preview/PDF)
 */
export function formatTLAText(tla: TLA): string {
  return `
TRIP (Driver) LEASE AGREEMENT
(FMCSA-Compliant Short-Term Lease – Driver Only)

This Trip Lease Agreement ("Agreement") is made between:

- Fleet A (Lessor Carrier): ${tla.lessor.legalName}
- Fleet B (Lessee Carrier): ${tla.lessee.legalName}
- Driver: ${tla.driver.name}
- Effective Trip Period: ${formatDate(tla.trip.startDate)}${tla.trip.endDate ? ` – ${formatDate(tla.trip.endDate)}` : ' – Upon Delivery'}
- Payment Terms: $${tla.payment.amount.toLocaleString()} by ${tla.payment.dueDate ? formatDate(tla.payment.dueDate) : 'Trip Completion'}

1. Purpose
Fleet A agrees to supply the Driver to Fleet B for a single trip under Fleet B's authority, consistent with applicable FMCSA and state leasing rules.

2. Term
The lease begins when the Driver reports to Fleet B and ends upon trip completion or delivery.

3. Control and Responsibility
- Fleet B has exclusive possession, control, and responsibility for the Driver during the trip.
- Fleet B directs all dispatch, routes, and operational matters.
- Fleet A and the Driver must comply with Fleet B's instructions and safety protocols.

4. Compensation
- Fleet B shall pay Fleet A the agreed amount upon trip completion through XtraFleet's integrated payment system.
- XtraFleet does not handle, hold, or escrow payments.

5. Insurance and Liability
Prior to activation, Fleet B must complete one of the following:
${tla.insurance.option === 'existing_policy' ? '☑' : '☐'} I confirm that my active insurance policy includes leased or temporary drivers for this trip.
${tla.insurance.option === 'trip_coverage' ? '☑' : '☐'} I elect to obtain trip-based coverage through an approved third-party provider integrated with XtraFleet.

Fleet B assumes liability for all vehicle and driver operations.

Fleet A confirms that the Driver:
- Holds a valid CDL${tla.driver.cdlNumber ? ` (${tla.driver.cdlNumber})` : ''},
- Possesses a current medical certificate${tla.driver.medicalCardExpiry ? ` (expires ${formatDate(tla.driver.medicalCardExpiry)})` : ''}, and
- Has a compliant driver qualification file.

6. Indemnification
Each party agrees to indemnify and hold harmless the other, and XtraFleet, against claims, damages, or liabilities caused by its negligence or failure to comply with regulations.

- Fleet B agrees to indemnify, defend, and hold harmless Fleet A and XtraFleet Technologies, Inc. from any and all claims, losses, or liabilities (including bodily injury, property damage, workers' compensation, and occupational accident claims) arising out of or relating to operations conducted under Fleet B's authority during the term of this Trip Lease.
- Fleet A shall likewise indemnify Fleet B to the extent caused by negligent acts or omissions of Fleet A.

7. No Liability for Platform Provider
- The parties acknowledge that XtraFleet Technologies, Inc. is a neutral technology facilitator and not a motor carrier, broker, employer, or lessor.
- XtraFleet does not assume any responsibility or liability for the conduct of either party, the transportation of property, or compliance with applicable insurance or employment laws.

8. Proof and Retention
- Both parties agree to retain this Agreement and supporting documentation for the minimum time period, as required by FMCSA, if applicable, and applicable state law.
- Each party shall maintain proof of insurance coverage and compliance documentation for a minimum of three (3) years from the termination of this Driver Lease.
- XtraFleet may retain digital copies of certificates and trip records solely for compliance audit purposes.

9. Termination
This Agreement automatically terminates upon delivery completion or mutual consent.

10. Governing Law
This Agreement is governed by Delaware law and applicable FMCSA regulations.

11. Signatures

Lessor (Provider of Driver):
Name: ${tla.lessor.legalName}
${tla.lessorSignature ? `Signature: ${tla.lessorSignature.signedByName}
Date: ${formatDate(tla.lessorSignature.signedAt)}` : 'Signature: _________________________\nDate: _________________________'}

Lessee (Hiring Carrier):
Name: ${tla.lessee.legalName}
${tla.lesseeSignature ? `Signature: ${tla.lesseeSignature.signedByName}
Date: ${formatDate(tla.lesseeSignature.signedAt)}` : 'Signature: _________________________\nDate: _________________________'}
`.trim();
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}