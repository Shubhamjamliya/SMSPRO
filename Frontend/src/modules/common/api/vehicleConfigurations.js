import apiClient from "@/services/api";

const BASE_PATH = "/common/settings";

const unwrap = (response) => response?.data?.data || response?.data || {};

export const getVehicleConfiguration = async () =>
  unwrap(
    await apiClient.get(`${BASE_PATH}/vehicle-configurations`, {
      contextModule: "admin",
    }),
  );

const buildVehicleFormData = (vehicle, iconFile) => {
  const formData = new FormData();
  formData.append(
    "data",
    JSON.stringify({
      name: vehicle.name,
      category: vehicle.category,
      displayOrder: vehicle.displayOrder,
      status: vehicle.status,
      documents: vehicle.documents,
    }),
  );
  if (iconFile) formData.append("icon", iconFile);
  return formData;
};

export const createVehicleConfiguration = async (vehicle, iconFile) =>
  unwrap(
    await apiClient.post(
      `${BASE_PATH}/vehicle-configurations`,
      buildVehicleFormData(vehicle, iconFile),
      { contextModule: "admin" },
    ),
  );

export const updateVehicleConfiguration = async (id, vehicle, iconFile) =>
  unwrap(
    await apiClient.patch(
      `${BASE_PATH}/vehicle-configurations/${id}`,
      buildVehicleFormData(vehicle, iconFile),
      { contextModule: "admin" },
    ),
  );

export const updateVehicleConfigurationStatus = async (id, status) =>
  unwrap(
    await apiClient.patch(
      `${BASE_PATH}/vehicle-configurations/${id}/status`,
      { status },
      { contextModule: "admin" },
    ),
  );

export const saveModuleVehicleMappings = async (mappings) =>
  unwrap(
    await apiClient.put(
      `${BASE_PATH}/module-vehicle-mappings`,
      { mappings },
      { contextModule: "admin" },
    ),
  );

export const deleteVehicleConfiguration = async (id) =>
  unwrap(
    await apiClient.delete(`${BASE_PATH}/vehicle-configurations/${id}`, {
      contextModule: "admin",
    }),
  );
