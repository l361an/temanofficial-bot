// routes/callbacks/superadmin.js

import { buildSuperadminConfigHandlers } from "./superadmin.config.js";
import { buildSuperadminCategoryHandlers } from "./superadmin.category.js";
import { buildSuperadminFinanceHandlers } from "./superadmin.finance.js";
import { buildSuperadminPaymentReviewHandlers } from "./superadmin.paymentReview.js";
import { buildSuperadminAdminManagerHandlers } from "./superadmin.adminManager.js";
import { buildSuperadminPartnerClassHandlers } from "./superadmin.partnerClass.js";

function mergeHandlers(...parts) {
  const EXACT = {};
  const PREFIX = [];

  for (const p of parts) {
    if (p?.EXACT) Object.assign(EXACT, p.EXACT);
    if (p?.PREFIX?.length) PREFIX.push(...p.PREFIX);
  }

  return { EXACT, PREFIX };
}

export function buildSuperadminHandlers() {
  return mergeHandlers(
    buildSuperadminConfigHandlers(),
    buildSuperadminPartnerClassHandlers(),
    buildSuperadminCategoryHandlers(),
    buildSuperadminFinanceHandlers(),
    buildSuperadminPaymentReviewHandlers(),
    buildSuperadminAdminManagerHandlers()
  );
}
