import { QuickSellerCommission } from '../admin/models/sellerCommission.model.js';
import { Seller } from '../seller/models/seller.model.js';
import {
  invalidateSellerCommissionCache,
} from '../admin/services/commission.service.js';
import mongoose from 'mongoose';

const approvedSellerFilter = {
  approvalStatus: 'approved',
  isDeleted: { $ne: true },
  accountStatus: { $ne: 'deleted' },
  isActive: { $ne: false },
};

const normalizeDefaultCommission = (raw = {}) => {
  const type = raw?.type === 'amount' ? 'amount' : 'percentage';
  const value = Math.max(0, Number(raw?.value ?? 0) || 0);
  if (type === 'percentage' && value > 100) {
    const err = new Error('Percentage commission must be between 0 and 100');
    err.status = 400;
    throw err;
  }
  return { type, value };
};

export const getSellerCommissionBootstrap = async (req, res) => {
  try {
    const [commissions, sellers] = await Promise.all([
      QuickSellerCommission.find({}).sort({ updatedAt: -1 }).lean(),
      Seller.find(approvedSellerFilter).select('_id name shopName isAdminHub').lean(),
    ]);

    const mappedCommissions = commissions.map((comm, index) => {
      const seller = sellers.find((s) => String(s._id) === String(comm.sellerId));
      return {
        ...comm,
        sl: index + 1,
        sellerName: seller?.shopName || seller?.name || 'Unknown Seller',
        sellerIdDisplay: String(comm.sellerId).slice(-6).toUpperCase(),
        isAdminHub: seller?.isAdminHub === true,
      };
    });

    const setupSellerIds = new Set(commissions.map((c) => String(c.sellerId)));
    const availableSellers = sellers.map((s) => ({
      ...s,
      hasCommissionSetup: setupSellerIds.has(String(s._id)),
    }));

    return res.json({
      success: true,
      data: {
        commissions: mappedCommissions,
        sellers: availableSellers,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSellerCommissions = async (req, res) => {
  try {
    const commissions = await QuickSellerCommission.find({}).lean();
    return res.json({ success: true, data: { commissions } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSellerCommissionById = async (req, res) => {
  try {
    const commission = await QuickSellerCommission.findById(req.params.id).lean();
    if (!commission) {
      return res.status(404).json({ success: false, message: 'Commission rule not found' });
    }

    const seller = await Seller.findById(commission.sellerId)
      .select('_id name shopName isAdminHub')
      .lean();
    return res.json({
      success: true,
      data: { commission: { ...commission, seller } },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createSellerCommission = async (req, res) => {
  try {
    const { sellerId, notes } = req.body || {};
    if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) {
      return res.status(400).json({ success: false, message: 'Valid sellerId is required' });
    }

    const seller = await Seller.findOne({ _id: sellerId, ...approvedSellerFilter })
      .select('_id')
      .lean();
    if (!seller) {
      return res.status(404).json({ success: false, message: 'Approved seller not found' });
    }

    const existing = await QuickSellerCommission.findOne({ sellerId });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: 'Commission rule already exists for this seller' });
    }

    const defaultCommission = normalizeDefaultCommission(req.body?.defaultCommission);
    const commission = await QuickSellerCommission.create({
      sellerId,
      defaultCommission,
      notes: String(notes || '').trim(),
      status: true,
    });

    invalidateSellerCommissionCache();
    return res.status(201).json({ success: true, data: { commission } });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

export const updateSellerCommission = async (req, res) => {
  try {
    const update = {};
    if (req.body?.defaultCommission !== undefined) {
      update.defaultCommission = normalizeDefaultCommission(req.body.defaultCommission);
    }
    if (req.body?.notes !== undefined) {
      update.notes = String(req.body.notes || '').trim();
    }
    if (req.body?.status !== undefined) {
      update.status = req.body.status !== false;
    }

    const commission = await QuickSellerCommission.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true },
    );
    if (!commission) {
      return res.status(404).json({ success: false, message: 'Commission rule not found' });
    }

    invalidateSellerCommissionCache();
    return res.json({ success: true, data: { commission } });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

export const deleteSellerCommission = async (req, res) => {
  try {
    const deleted = await QuickSellerCommission.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Commission rule not found' });
    }
    invalidateSellerCommissionCache();
    return res.json({ success: true, message: 'Commission rule deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const toggleSellerCommissionStatus = async (req, res) => {
  try {
    const commission = await QuickSellerCommission.findById(req.params.id);
    if (!commission) {
      return res.status(404).json({ success: false, message: 'Commission rule not found' });
    }

    commission.status = !commission.status;
    await commission.save();
    invalidateSellerCommissionCache();

    return res.json({ success: true, data: { status: commission.status } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
