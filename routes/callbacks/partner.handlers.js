// routes/callbacks/partner.handlers.js

import { buildPartnerClassDomainHandlers } from "./partner.class.handlers.js";
import { buildPartnerVerificatorDomainHandlers } from "./partner.verificator.handlers.js";
import { buildPartnerPhotoDomainHandlers } from "./partner.photo.handlers.js";
import { buildPartnerEditDomainHandlers } from "./partner.edit.handlers.js";
import { buildPartnerCategoryDomainHandlers } from "./partner.category.handlers.js";
import { buildPartnerPreviewDomainHandlers } from "./partner.preview.handlers.js";

/**
 * mergeHandlers
 * Utility untuk merge EXACT dan PREFIX dari beberapa domain handler
 */
function mergeHandlers(...parts) {
  const EXACT = {};
  const PREFIX = [];

  for (const p of parts) {
    if (p?.EXACT) Object.assign(EXACT, p.EXACT);
    if (p?.PREFIX?.length) PREFIX.push(...p.PREFIX);
  }

  return { EXACT, PREFIX };
}

/**
 * buildPartnerClassHandlers
 *
 * NOTE:
 * Nama fungsi dipertahankan karena dipanggil oleh
 * routes/callbacks/partnerClass.js
 */
export function buildPartnerClassHandlers() {
  return mergeHandlers(
    buildPartnerClassDomainHandlers(),
    buildPartnerVerificatorDomainHandlers(),
    buildPartnerPhotoDomainHandlers(),
    buildPartnerEditDomainHandlers(),
    buildPartnerCategoryDomainHandlers(),
    buildPartnerPreviewDomainHandlers()
  );
}
