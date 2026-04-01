// routes/callbacks/registry.js
import { buildOfficerExact } from "./officer.js";
import { buildPartnerToolsExact } from "./partnerTools.js";
import { buildPartnerDatabaseHandlers } from "./partnerDatabase.js";
import { buildPartnerModerationHandlers } from "./partnerModeration.js";
import { buildPartnerClassHandlers } from "./partnerClass.js";
import { buildSuperadminHandlers } from "./superadmin.js";
import { buildVerificationHandlers } from "./verification.js";
import { buildCatalogHandlers } from "./catalog.js";
import { buildBookingHandlers } from "./booking.js";

function mergeHandlers(...parts) {
  const EXACT = {};
  const PREFIX = [];
  for (const p of parts) {
    if (p?.EXACT) Object.assign(EXACT, p.EXACT);
    if (p?.PREFIX?.length) PREFIX.push(...p.PREFIX);
  }
  return { EXACT, PREFIX };
}

export function createHandlers() {
  return mergeHandlers(
    buildOfficerExact(),
    buildPartnerToolsExact(),
    buildPartnerDatabaseHandlers(),
    buildPartnerModerationHandlers(),
    buildPartnerClassHandlers(),
    buildSuperadminHandlers(),
    buildVerificationHandlers(),
    buildCatalogHandlers(),
    buildBookingHandlers()
  );
}
