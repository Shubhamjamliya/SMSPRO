import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const registeredAddressSchema = new mongoose.Schema(
    {
        line1: { type: String, default: '', trim: true },
        line2: { type: String, default: '', trim: true },
        city: { type: String, default: '', trim: true },
        state: { type: String, default: '', trim: true },
        pincode: { type: String, default: '', trim: true },
    },
    { _id: false },
);

/**
 * The vendor's anytime-editable tax/billing identity — deliberately separate from
 * `BikeVendor.documents` (the onboarding-KYC snapshot, approval-gated). Invoices copy a
 * frozen snapshot of this at issue time, so edits here never retroactively change past invoices.
 */
const vendorTaxProfileSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            required: true,
            unique: true,
            index: true,
        },
        isGstRegistered: { type: Boolean, default: false },
        gstin: { type: String, default: '', trim: true, uppercase: true },
        legalBusinessName: { type: String, default: '', trim: true },
        registeredAddress: { type: registeredAddressSchema, default: () => ({}) },
        panNumber: { type: String, default: '', trim: true, uppercase: true },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'bike_rent_vendor_tax_profiles',
        timestamps: true,
    },
);

export const VendorTaxProfile = mongoose.models.VendorTaxProfile
    || mongoose.model('VendorTaxProfile', vendorTaxProfileSchema, 'bike_rent_vendor_tax_profiles');
