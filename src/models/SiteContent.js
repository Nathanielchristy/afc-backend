const mongoose = require('mongoose');

/**
 * SiteContent — stores editable policy and business information pages.
 *
 * Each document is keyed by `key` (a short slug like "cancellation-policy").
 * Admins edit these through the admin panel; they are served publicly via GET.
 *
 * PLACEHOLDERS: Fields marked [PLACEHOLDER] must be filled in by the business
 * before publishing. Do NOT invent values for legal name, address, GSTIN, etc.
 */
const siteContentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      enum: [
        'cancellation-policy',
        'terms-and-conditions',
        'contact-us',
        'about-us',
        'governing-law',
        'gst-business-info',
      ],
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    // Rich text / markdown body. Stored as plain text; rendered in the frontend.
    body: {
      type: String,
      required: true,
      maxlength: 50000,
    },
    // Structured fields used by specific pages (optional, key-specific)
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'site_contents',
  }
);

siteContentSchema.index({ key: 1 });

module.exports = mongoose.model('SiteContent', siteContentSchema);
