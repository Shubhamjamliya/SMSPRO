import {
  getQcDriverById,
  listQcDrivers,
} from '../admin/services/adminDrivers.service.js';

export const getAdminQcDrivers = async (req, res) => {
  try {
    const result = await listQcDrivers({
      page: req.query?.page,
      limit: req.query?.limit,
      search: req.query?.search,
      onlineStatus: req.query?.onlineStatus || req.query?.online,
    });
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load QC drivers',
    });
  }
};

export const getAdminQcDriverById = async (req, res) => {
  try {
    const driver = await getQcDriverById(req.params.driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }
    return res.json({ success: true, result: driver });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load driver',
    });
  }
};
