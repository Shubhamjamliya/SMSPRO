import { sendResponse } from "../../../utils/response.js";
import {
  createVehicleConfiguration,
  getVehicleConfiguration,
  saveModuleVehicleMappings,
  updateVehicleConfiguration,
  updateVehicleStatus,
  deleteVehicleConfiguration,
} from "../services/vehicleConfiguration.service.js";

export const getConfiguration = async (req, res, next) => {
  try {
    const result = await getVehicleConfiguration();
    return sendResponse(res, 200, "Vehicle configuration fetched", result);
  } catch (error) {
    next(error);
  }
};

export const createVehicle = async (req, res, next) => {
  try {
    const result = await createVehicleConfiguration({
      body: req.body,
      file: req.file,
    });
    return sendResponse(res, 201, "Vehicle created successfully", result);
  } catch (error) {
    next(error);
  }
};

export const updateVehicle = async (req, res, next) => {
  try {
    const result = await updateVehicleConfiguration({
      id: req.params.id,
      body: req.body,
      file: req.file,
    });
    return sendResponse(res, 200, "Vehicle updated successfully", result);
  } catch (error) {
    next(error);
  }
};

export const setVehicleStatus = async (req, res, next) => {
  try {
    const result = await updateVehicleStatus({
      id: req.params.id,
      status: String(req.body?.status || "").toLowerCase(),
    });
    return sendResponse(res, 200, "Vehicle status updated", result);
  } catch (error) {
    next(error);
  }
};

export const deleteVehicle = async (req, res, next) => {
  try {
    const result = await deleteVehicleConfiguration(req.params.id);
    return sendResponse(res, 200, "Vehicle deleted successfully", result);
  } catch (error) {
    next(error);
  }
};

export const updateMappings = async (req, res, next) => {
  try {
    const result = await saveModuleVehicleMappings(req.body?.mappings);
    return sendResponse(res, 200, "Module vehicle mappings saved", result);
  } catch (error) {
    next(error);
  }
};
