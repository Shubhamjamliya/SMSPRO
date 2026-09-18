import { GlobalSettings } from "../models/settings.model.js";
import { sendResponse } from "../../../utils/response.js";
import {
  uploadImageBufferDetailed,
  invalidateImageStorageProviderCache,
} from "../../../services/cloudinary.service.js";
import { ValidationError } from "../../../core/auth/errors.js";
import {
  assertAtLeastOneModuleEnabled,
  cleanModulesForResponse,
  getAllowedModuleKeys,
  mergeModuleSettings,
  sanitizeIncomingModules,
} from "../utils/moduleSettings.js";

export async function getGlobalSettings(req, res, next) {
  try {
    let settings = await GlobalSettings.findOne();
    if (!settings) {
      // Create default settings if none exist
      settings = await GlobalSettings.create({
        companyName: "Appzeto",
        email: "admin@appzeto.com",
      });
    }

    // Cleanup any extra modules that might be in the DB (taxi, hotel, etc.)
    const rawSettings = settings.toObject();
    const allowedModules = getAllowedModuleKeys(GlobalSettings);
    rawSettings.modules = cleanModulesForResponse(
      rawSettings.modules,
      allowedModules,
    );

    try {
      const { getMinWalletToReceiveOrders } = await import(
        "../../../core/wallet/driverMinWallet.service.js"
      );
      rawSettings.minWalletToReceiveOrders = await getMinWalletToReceiveOrders();
    } catch {
      rawSettings.minWalletToReceiveOrders =
        Number(rawSettings.minWalletToReceiveOrders) || 0;
    }

    return sendResponse(
      res,
      200,
      "Global settings fetched successfully",
      rawSettings,
    );
  } catch (error) {
    next(error);
  }
}

export async function updateGlobalSettings(req, res, next) {
  try {
    let data = {};
    if (req.body.data) {
      try {
        data =
          typeof req.body.data === "string"
            ? JSON.parse(req.body.data)
            : req.body.data;
      } catch (e) {
        console.error("Error parsing settings data:", e);
        data = req.body;
      }
    } else {
      data = req.body;
    }

    const {
      companyName,
      email,
      phoneCountryCode,
      phoneNumber,
      address,
      state,
      pincode,
      region,
      adminLogoUrl,
      adminFaviconUrl,
      userLogoUrl,
      userFaviconUrl,
      deliveryLogoUrl,
      deliveryFaviconUrl,
      restaurantLogoUrl,
      restaurantFaviconUrl,
      sellerLogoUrl,
      sellerFaviconUrl,
      loginBannerUrl,
      sellerLoginBannerUrl,
      restaurantLoginBannerUrl,
      sellerLoginBannerActive,
      restaurantLoginBannerActive,
      themeColor,
      imageStorageProvider,
      modules,
      minWalletToReceiveOrders,
    } = data;

    console.log("Updating global settings with data:", data);

    // Validation
    if (
      companyName !== undefined &&
      (!companyName ||
        companyName.trim().length < 2 ||
        companyName.trim().length > 50)
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Company name must be between 2 and 50 characters",
        });
    }

    if (
      email &&
      (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email address" });
    }

    if (phoneNumber && !/^\d{7,15}$/.test(phoneNumber.trim())) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid phone number (7-15 digits required)",
        });
    }

    let settings = await GlobalSettings.findOne();
    if (!settings) {
      settings = new GlobalSettings();
    }

    if (companyName) settings.companyName = companyName;
    if (email) settings.email = email;
    if (phoneCountryCode || phoneNumber) {
      settings.phone = {
        countryCode: phoneCountryCode || settings.phone?.countryCode || "+91",
        number: phoneNumber || settings.phone?.number || "",
      };
    }
    if (address !== undefined) settings.address = address;
    if (state !== undefined) settings.state = state;
    if (pincode !== undefined) settings.pincode = pincode;
    if (region) settings.region = region;

    // Update URLs if provided
    const mediaFields = [
      "adminLogo",
      "adminFavicon",
      "userLogo",
      "userFavicon",
      "deliveryLogo",
      "deliveryFavicon",
      "restaurantLogo",
      "restaurantFavicon",
      "sellerLogo",
      "sellerFavicon",
      "loginBanner",
      "sellerLoginBanner",
      "restaurantLoginBanner",
    ];
    mediaFields.forEach((field) => {
      const urlKey = `${field}Url`;
      if (data[urlKey] !== undefined) {
        settings[field] = {
          url: String(data[urlKey] || "").trim(),
          publicId: settings[field]?.publicId || "",
          active:
            settings[field]?.active !== undefined
              ? settings[field].active
              : true,
        };
        settings.markModified(field);
      }
    });

    if (sellerLoginBannerActive !== undefined) {
      settings.sellerLoginBanner = {
        url: settings.sellerLoginBanner?.url || "",
        publicId: settings.sellerLoginBanner?.publicId || "",
        active: !!sellerLoginBannerActive,
      };
      settings.markModified("sellerLoginBanner");
    }
    if (restaurantLoginBannerActive !== undefined) {
      settings.restaurantLoginBanner = {
        url: settings.restaurantLoginBanner?.url || "",
        publicId: settings.restaurantLoginBanner?.publicId || "",
        active: !!restaurantLoginBannerActive,
      };
      settings.markModified("restaurantLoginBanner");
    }

    if (minWalletToReceiveOrders !== undefined) {
      const nextMinWallet = Math.max(0, Number(minWalletToReceiveOrders) || 0);
      if (!Number.isFinite(nextMinWallet) || nextMinWallet < 0) {
        return res.status(400).json({
          success: false,
          message: "Minimum wallet amount must be a number (>= 0)",
        });
      }
      settings.minWalletToReceiveOrders = nextMinWallet;
      try {
        const { syncMinWalletToReceiveOrders } = await import(
          "../../../core/wallet/driverMinWallet.service.js"
        );
        await syncMinWalletToReceiveOrders(nextMinWallet);
      } catch {
        /* cash-limit mirror is best-effort */
      }
    }

    if (themeColor !== undefined) {
      const normalizedThemeColor = String(themeColor || "").trim();
      if (
        normalizedThemeColor &&
        !/^#[0-9a-fA-F]{6}$/.test(normalizedThemeColor)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Theme color must be a valid hex value (e.g. #FF6A00)",
          });
      }
      settings.themeColor = normalizedThemeColor || "#0a0a0a";
    }

    if (imageStorageProvider !== undefined) {
      const normalizedProvider = String(imageStorageProvider).trim().toLowerCase();
      if (!['cloudinary', 'local'].includes(normalizedProvider)) {
        return res.status(400).json({
          success: false,
          message: "Image storage provider must be cloudinary or local",
        });
      }
      settings.imageStorageProvider = normalizedProvider;
    }

    const hasModuleUpdate = modules !== undefined || data.modules !== undefined;
    if (hasModuleUpdate) {
      const allowedModules = getAllowedModuleKeys(GlobalSettings);
      const incomingModules = sanitizeIncomingModules(
        modules ?? data.modules,
        allowedModules,
      );
      settings.modules = mergeModuleSettings({
        allowedKeys: allowedModules,
        currentModules: settings.modules || {},
        incomingModules,
      });

      try {
        assertAtLeastOneModuleEnabled(settings.modules, allowedModules);
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError.message || "Invalid module configuration",
        });
      }

      settings.markModified("modules");
    }

    // Handle file uploads
    if (req.files) {
      const mediaUploadFields = [
        { name: "adminLogo", folder: "business/logos/admin" },
        { name: "adminFavicon", folder: "business/favicons/admin" },
        { name: "userLogo", folder: "business/logos/user" },
        { name: "userFavicon", folder: "business/favicons/user" },
        { name: "deliveryLogo", folder: "business/logos/delivery" },
        { name: "deliveryFavicon", folder: "business/favicons/delivery" },
        { name: "restaurantLogo", folder: "business/logos/restaurant" },
        { name: "restaurantFavicon", folder: "business/favicons/restaurant" },
        { name: "sellerLogo", folder: "business/logos/seller" },
        { name: "sellerFavicon", folder: "business/favicons/seller" },
        { name: "loginBanner", folder: "business/banners/login" },
        { name: "sellerLoginBanner", folder: "business/banners/seller_login" },
        {
          name: "restaurantLoginBanner",
          folder: "business/banners/restaurant_login",
        },
      ];

      for (const field of mediaUploadFields) {
        if (req.files[field.name] && req.files[field.name][0]) {
          const result = await uploadImageBufferDetailed(
            req.files[field.name][0].buffer,
            field.folder,
          );
          settings[field.name] = {
            url: result.secure_url,
            publicId: result.public_id,
            active:
              settings[field.name]?.active !== undefined
                ? settings[field.name].active
                : true,
          };
          settings.markModified(field.name);
        }
      }
    }

    await settings.save();
    invalidateImageStorageProviderCache();

    try {
      const { invalidateModuleEnabledCache } = await import(
        "../../../core/modules/moduleEnabled.service.js"
      );
      invalidateModuleEnabledCache();
    } catch {
      /* optional during boot */
    }

    // /common/settings and /food/admin/business-settings/public are cached, so the
    // admin's own save would otherwise appear to do nothing until the TTL lapsed.
    try {
      const { invalidateCache } = await import("../../../middleware/cache.js");
      const { INVALIDATION_GROUPS } = await import("../../../config/cacheKeys.js");
      await invalidateCache(INVALIDATION_GROUPS.SETTINGS);
    } catch (err) {
      /* cache invalidation is best-effort; TTL is the backstop */
    }

    const responsePayload = settings.toObject();
    responsePayload.modules = cleanModulesForResponse(
      responsePayload.modules,
      getAllowedModuleKeys(GlobalSettings),
    );

    return sendResponse(
      res,
      200,
      "Global settings updated successfully",
      responsePayload,
    );
  } catch (error) {
    next(error);
  }
}
