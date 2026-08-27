/**
 * Identifiers for records these tests create.
 *
 * Registration is a write: completing either wizard leaves a real row in
 * whatever database the run points at. That database is a disposable local or
 * CI one - never production - but the names still say what they are, so anyone
 * who finds one in a queue knows immediately that a test put it there and that
 * it can be removed.
 *
 * Unique per call, because the suite runs fully parallel and two workers
 * submitting the same company name at the same moment is a flake waiting to
 * happen.
 */
function stamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function uniqueBuyer() {
  const id = stamp()
  return {
    companyName: `UI Audit Test Buyer ${id}`,
    legalName: `UI Audit Test Buyer ${id} LLC`,
    email: `ui-audit-buyer-${id}@example.com`,
  }
}

export function uniqueSupplier() {
  const id = stamp()
  return {
    companyName: `UI Audit Test Supplier ${id}`,
    legalName: `UI Audit Test Supplier ${id} Pvt Ltd`,
    email: `ui-audit-supplier-${id}@example.com`,
  }
}
