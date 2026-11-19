const SiteContent = require('../models/SiteContent');
const AuditLog = require('../models/AuditLog');

/**
 * Default placeholder content for each page.
 * These are inserted on first-run if the DB has no record for that key.
 *
 * ⚠️ PLACEHOLDERS: Any value wrapped in [SQUARE BRACKETS] must be confirmed
 * and replaced by the business before publication. Do not treat placeholder
 * text as legal advice or accurate business information.
 */
const DEFAULTS = {
  'cancellation-policy': {
    title: 'Cancellation & Refund Policy',
    body: `⚠️ DRAFT — This policy requires review and approval by the business before publication.

## Cancellation & Refund Policy

**Effective Date:** [DATE — to be confirmed by the business]
**Business Name:** [LEGAL BUSINESS NAME — as on GST registration]

---

### 1. Order Cancellation

[PLACEHOLDER — Describe under what conditions and within what time window a customer may cancel an order. Example: "Orders may be cancelled within X minutes of placement if preparation has not yet begun."]

### 2. Non-Cancellable Orders

[PLACEHOLDER — List any orders that cannot be cancelled once placed, e.g. orders already being prepared, special/bulk orders, etc.]

### 3. Refund Eligibility

[PLACEHOLDER — Describe which situations qualify for a refund (wrong item delivered, quality issue, etc.) and which do not.]

### 4. Refund Process

[PLACEHOLDER — Describe how refunds are processed: online reversal, credit, or cash at counter. Specify the timeline in business days.]

### 5. Refund Timeline

[PLACEHOLDER — e.g. "Refunds will be processed within X–Y business days to the original payment method."]

### 6. Contact for Disputes

For cancellation or refund queries, contact us at:
[PLACEHOLDER — email address and phone number]

---

*This policy is subject to change. The version currently published on the website is the operative version.*`,
    meta: {},
  },

  'terms-and-conditions': {
    title: 'Terms & Conditions',
    body: `⚠️ DRAFT — This document requires review and approval by the business before publication.

## Terms & Conditions

**Effective Date:** [DATE — to be confirmed by the business]
**Business Name:** [LEGAL BUSINESS NAME — as on GST registration]

---

### 1. Acceptance of Terms

By accessing or using the AFC ordering platform ("Service"), you agree to be bound by these Terms & Conditions. If you do not agree, you must discontinue use of the Service immediately.

### 2. Eligibility

Use of this Service is intended for students and staff of [INSTITUTION NAME — to be confirmed]. You must provide accurate registration credentials to create an account.

### 3. Account Responsibility

You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Report unauthorised access immediately.

### 4. Orders and Pricing

All prices shown are in Indian Rupees (₹) and are inclusive of applicable taxes unless stated otherwise. AFC reserves the right to change prices, availability, and menu items without prior notice.

### 5. Payment

Payments are processed through authorised payment gateways. AFC does not store payment card details. [PLACEHOLDER — Add any payment-specific terms relevant to your payment provider.]

### 6. Pickup Policy

Orders placed on this platform are for [pickup / delivery — confirm applicable options] from [LOCATION — to be confirmed]. AFC is not responsible for orders left uncollected beyond [PLACEHOLDER — time window].

### 7. Food Safety & Allergens

[PLACEHOLDER — Add allergen disclosure statement. Example: "Our products may contain nuts, gluten, dairy, and other allergens. Please inform staff of any dietary requirements before ordering."]

### 8. Intellectual Property

All content on this platform, including logos, images, and text, is the property of AFC or its licensors and may not be reproduced without written permission.

### 9. Limitation of Liability

[PLACEHOLDER — Standard limitation of liability clause for review by legal adviser.]

### 10. Changes to Terms

AFC reserves the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the revised terms.

### 11. Governing Law

See our Governing Law & Dispute Resolution page.

---

*These Terms & Conditions are a draft. Have them reviewed by a qualified legal adviser before publication.*`,
    meta: {},
  },

  'contact-us': {
    title: 'Contact Us',
    body: `## Contact Us

Have a question, a complaint, or a bulk order enquiry? We'd love to hear from you.

---

### Customer Support

**Email:** [PLACEHOLDER — support email address]
**Phone / WhatsApp:** [PLACEHOLDER — phone number]
**Support Hours:** [PLACEHOLDER — e.g. Monday–Saturday, 10:00 AM – 8:00 PM]

---

### Order Pickup Location

**Address:**
[PLACEHOLDER — Full postal address of the outlet]
[PLACEHOLDER — City, State — PIN Code]

**Operating Hours:** 11:00 AM – 11:30 PM (Daily)

---

### Bulk / Campus Orders

For bulk orders, event catering, or campus partnership enquiries:
**Email:** [PLACEHOLDER — bulk orders email]
**Phone:** [PLACEHOLDER — phone number]

---

### Social Media

[PLACEHOLDER — Add Instagram / Facebook / other links if applicable]

---

*For urgent order issues, please call the number above during operating hours.*`,
    meta: {
      email: '[PLACEHOLDER]',
      phone: '[PLACEHOLDER]',
      address: '[PLACEHOLDER]',
    },
  },

  'about-us': {
    title: 'About AFC',
    body: `## About AFC — American Fried Chicken

[PLACEHOLDER — Write a 2–4 sentence description of the business: when it was founded, what makes AFC special, and who it serves. Do not publish this placeholder text.]

---

### Our Story

[PLACEHOLDER — Tell the story of how AFC was started. Focus on what makes the food and service unique to the campus community.]

### Our Food Philosophy

Double-marinated in secret spices, pressure-cooked for unbeatable golden crunchiness and succulent juiciness. We believe great fried chicken starts with quality ingredients and consistent technique.

### Our Commitment

- **100% Halal Certified** — All our chicken is sourced from certified halal suppliers.
- **FSSAI Hygiene Standards** — We operate in compliance with FSSAI food safety standards.
- **Fresh Every Day** — [PLACEHOLDER — Add any freshness / sourcing commitment specific to AFC.]

### Where to Find Us

[PLACEHOLDER — Campus location details and operating hours.]

---

*About Us content must be reviewed and approved by management before publication.*`,
    meta: {},
  },

  'governing-law': {
    title: 'Governing Law & Dispute Resolution',
    body: `⚠️ DRAFT — This clause must be reviewed by the business's legal adviser before publication. The jurisdiction placeholder must be replaced with the correct state and city.

## Governing Law & Dispute Resolution

---

### Governing Law

These terms shall be governed by the laws of India. Any disputes shall be subject to the jurisdiction of the courts located in **[STATE/CITY — to be confirmed by legal adviser]**, India.

### Dispute Resolution

[PLACEHOLDER — Describe the preferred dispute resolution mechanism. Example: "The parties shall first attempt to resolve any dispute through good-faith negotiation. If unresolved within 30 days, the matter shall be referred to arbitration under the Arbitration and Conciliation Act, 1996, or to the courts specified above."]

### Consumer Complaints

Consumers may also approach the relevant Consumer Disputes Redressal Forum/Commission under the Consumer Protection Act, 2019.

---

⚠️ **Important Notice:** The jurisdiction and dispute resolution mechanism above are placeholders. This clause must be reviewed and confirmed by the business's legal adviser before this policy is published or shared with customers. AFC does not warrant that this draft meets any specific legal, regulatory, or payment-provider requirement.`,
    meta: {
      jurisdiction: '[STATE/CITY — PLACEHOLDER]',
    },
  },

  'gst-business-info': {
    title: 'Business & GST Information',
    body: `## Business & GST Information

The following details are provided for statutory disclosure and invoicing purposes.

---

### Registered Business Name

[PLACEHOLDER — Enter the exact legal name as it appears on the GST registration certificate. Do not use the AFC brand name unless that is the registered legal entity name.]

### Registered Business Address

[PLACEHOLDER — Enter the full registered address as shown on the GST registration certificate, including PIN code.]

### GSTIN

[PLACEHOLDER — Enter the 15-digit Goods and Services Tax Identification Number (GSTIN) if GST registration is applicable and required for display.]

### PAN

[PLACEHOLDER — Enter the Permanent Account Number (PAN) if required for display.]

### Nature of Business

[PLACEHOLDER — e.g. "Food Service / Quick Service Restaurant (QSR)"]

---

⚠️ **Important:** The details above are placeholders. The actual GST-registered legal name, address, and GSTIN must be obtained from the business's GST registration certificate and entered here before publication. Do not invent or approximate these details — incorrect GST information may have legal and tax implications.`,
    meta: {
      legalName: '[PLACEHOLDER]',
      registeredAddress: '[PLACEHOLDER]',
      gstin: '[PLACEHOLDER]',
      pan: '[PLACEHOLDER]',
    },
  },
};

/**
 * Upsert defaults into the DB on first run.
 * Called once at app startup.
 */
async function seedDefaults() {
  for (const [key, data] of Object.entries(DEFAULTS)) {
    const existing = await SiteContent.findOne({ key });
    if (!existing) {
      await SiteContent.create({ key, ...data });
      console.log(`[SiteContent] Seeded default for key: ${key}`);
    }
  }
}

// ─── Public Controllers ────────────────────────────────────────────────────

/**
 * GET /api/site-content/:key
 * Returns a single published page by key. Public.
 */
async function getPage(req, res) {
  try {
    const { key } = req.params;
    const page = await SiteContent.findOne({ key, isPublished: true }).select(
      '-lastEditedBy -__v'
    );
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    return res.json({ success: true, page });
  } catch (err) {
    console.error('[SiteContent] getPage error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * GET /api/site-content
 * Returns all published pages (title + key only, no body). Public.
 */
async function listPages(req, res) {
  try {
    const pages = await SiteContent.find({ isPublished: true })
      .select('key title updatedAt')
      .sort({ key: 1 });
    return res.json({ success: true, pages });
  } catch (err) {
    console.error('[SiteContent] listPages error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ─── Admin Controllers ─────────────────────────────────────────────────────

/**
 * GET /api/admin/site-content
 * Returns all pages (including unpublished) with full body. Admin only.
 */
async function adminListPages(req, res) {
  try {
    const pages = await SiteContent.find()
      .select('-__v')
      .populate('lastEditedBy', 'name email')
      .sort({ key: 1 });
    return res.json({ success: true, pages });
  } catch (err) {
    console.error('[SiteContent] adminListPages error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * PATCH /api/admin/site-content/:key
 * Update title, body, meta, isPublished for a page. Admin only.
 */
async function adminUpdatePage(req, res) {
  try {
    const { key } = req.params;
    const { title, body, meta, isPublished } = req.body;

    const page = await SiteContent.findOne({ key });
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }

    if (title !== undefined) page.title = title;
    if (body !== undefined) page.body = body;
    if (meta !== undefined) page.meta = meta;
    if (isPublished !== undefined) page.isPublished = isPublished;
    page.lastEditedBy = req.user._id;

    await page.save();

    // Audit log
    try {
      await AuditLog.create({
        actor: req.user._id,
        actorEmail: req.user.email,
        action: 'UPDATE_SITE_CONTENT',
        targetModel: 'SiteContent',
        targetRecord: key,
        details: { title: page.title, isPublished: page.isPublished },
        ipAddress: req.ip,
      });
    } catch (_) {
      // Audit log failure must not block the response
    }

    return res.json({ success: true, message: 'Page updated successfully', page });
  } catch (err) {
    console.error('[SiteContent] adminUpdatePage error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { getPage, listPages, adminListPages, adminUpdatePage, seedDefaults };
