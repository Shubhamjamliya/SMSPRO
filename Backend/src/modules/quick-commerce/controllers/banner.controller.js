import { uploadImageBuffer } from '../../../services/cloudinary.service.js';
import {
  createBanner,
  deleteBanner,
  getVisibleBanners,
  listAdminBanners,
  setBannerEnabled,
  updateBanner,
} from '../services/banner.service.js';

const getErrorStatus = (error) => Number(error?.statusCode) || 500;

const sendError = (res, error, fallbackMessage) => {
  const status = getErrorStatus(error);
  return res.status(status).json({
    success: false,
    message: error?.message || fallbackMessage,
  });
};

const uploadBannerImage = async (file) => {
  if (!file?.buffer) return null;
  return uploadImageBuffer(file.buffer, 'quick-commerce/banners');
};

export const getPublicBanners = async (req, res) => {
  try {
    const headerId = req.query?.headerId || req.query?.headerCategoryId || null;
    const zoneId = req.query?.zoneId || null;
    const results = await getVisibleBanners({ headerId, zoneId });
    return res.json({ success: true, results });
  } catch (error) {
    return sendError(res, error, 'Failed to fetch banners');
  }
};

export const getAdminBanners = async (req, res) => {
  try {
    const data = await listAdminBanners({
      page: req.query?.page,
      limit: req.query?.limit,
    });
    return res.json({
      success: true,
      results: data.results,
      pagination: data.pagination,
    });
  } catch (error) {
    return sendError(res, error, 'Failed to fetch banners');
  }
};

export const createAdminBanner = async (req, res) => {
  try {
    const imageUrl = await uploadBannerImage(req.file);
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Banner image is required' });
    }
    const result = await createBanner(req.body || {}, imageUrl);
    return res.status(201).json({ success: true, result });
  } catch (error) {
    return sendError(res, error, 'Failed to create banner');
  }
};

export const updateAdminBanner = async (req, res) => {
  try {
    const imageUrl = await uploadBannerImage(req.file);
    const result = await updateBanner(req.params?.id, req.body || {}, imageUrl);
    return res.json({ success: true, result });
  } catch (error) {
    return sendError(res, error, 'Failed to update banner');
  }
};

export const deleteAdminBanner = async (req, res) => {
  try {
    const result = await deleteBanner(req.params?.id);
    return res.json({ success: true, result });
  } catch (error) {
    return sendError(res, error, 'Failed to delete banner');
  }
};

export const toggleAdminBanner = async (req, res) => {
  try {
    const isEnabled = req.body?.isEnabled;
    if (isEnabled === undefined) {
      return res.status(400).json({ success: false, message: 'isEnabled is required' });
    }
    const result = await setBannerEnabled(req.params?.id, isEnabled);
    return res.json({ success: true, result });
  } catch (error) {
    return sendError(res, error, 'Failed to update banner status');
  }
};
