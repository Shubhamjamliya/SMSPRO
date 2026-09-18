import { VendorTaxProfile } from '../models/vendorTaxProfile.model.js';
import { BikeVendor } from '../models/bikeVendor.model.js';
import { BikeAuditLog } from '../models/bikeAuditLog.model.js';
import { NotFoundError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { validateVendorTaxProfileDto } from '../validators/vendorTaxProfile.validator.js';

function mapProfile(doc, vendorId) {
    if (!doc) {
        return {
            vendorId: String(vendorId),
            isGstRegistered: false,
            gstin: '',
            legalBusinessName: '',
            registeredAddress: { line1: '', line2: '', city: '', state: '', pincode: '' },
            panNumber: '',
            updatedAt: null,
        };
    }
    return {
        vendorId: String(doc.vendorId),
        isGstRegistered: Boolean(doc.isGstRegistered),
        gstin: doc.gstin || '',
        legalBusinessName: doc.legalBusinessName || '',
        registeredAddress: {
            line1: doc.registeredAddress?.line1 || '',
            line2: doc.registeredAddress?.line2 || '',
            city: doc.registeredAddress?.city || '',
            state: doc.registeredAddress?.state || '',
            pincode: doc.registeredAddress?.pincode || '',
        },
        panNumber: doc.panNumber || '',
        updatedAt: doc.updatedAt || null,
    };
}

export async function getVendorTaxProfile(vendorId) {
    const doc = await VendorTaxProfile.findOne({ vendorId }).lean();
    return mapProfile(doc, vendorId);
}

export async function updateVendorTaxProfile(vendorId, body, reqUser) {
    const vendor = await BikeVendor.findById(vendorId).select('_id').lean();
    if (!vendor) throw new NotFoundError('Vendor not found');

    const payload = validateVendorTaxProfileDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    let doc = await VendorTaxProfile.findOne({ vendorId });
    const before = mapProfile(doc?.toObject?.(), vendorId);

    if (!doc) {
        doc = new VendorTaxProfile({ vendorId });
    }
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();

    const after = mapProfile(doc.toObject(), vendorId);
    try {
        await BikeAuditLog.create({
            entityType: 'vendor_tax_profile',
            entityId: doc._id,
            action: 'vendor_tax_profile.updated',
            before,
            after,
            performedBy: performer,
            meta: { vendorId: String(vendorId), changedKeys: Object.keys(payload || {}) },
        });
    } catch {
        /* non-blocking */
    }

    return after;
}
