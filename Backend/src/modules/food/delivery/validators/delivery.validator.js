import { z } from "zod";
import { ValidationError } from "../../../../core/auth/errors.js";

const phoneSchema = z
  .string()
  .min(8, "Phone must be at least 8 digits")
  .max(15, "Phone must be at most 15 digits");

const aadharRegex = /^[0-9]{12}$/;
const drivingLicenseRegex = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/;
const vehicleNumberRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const normalizeAadhaarInput = (val) =>
  String(val ?? "")
    .replace(/\D/g, "")
    .slice(0, 12);

const aadharNumberSchema = z.preprocess(
  normalizeAadhaarInput,
  z.string().regex(aadharRegex, "Invalid Aadhaar format (12 digits)"),
);
const boolFromForm = z.preprocess((val) => {
  if (val === true || val === "true" || val === "1" || val === 1) return true;
  if (val === false || val === "false" || val === "0" || val === 0)
    return false;
  return val;
}, z.boolean());

const optionalDateString = z
  .string()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
    message: "Invalid date",
  });

const deliveryRegisterSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    phone: phoneSchema,
    email: z.string().email().optional().or(z.literal("")),
    countryCode: z.string().optional(),
    dateOfBirth: z.string().min(1, "Date of birth is required"),
    vehicleType: z.enum(["bike", "scooter", "bicycle"], {
      errorMap: () => ({
        message: "Vehicle type must be bike, scooter, or bicycle",
      }),
    }),
    vehicleNumber: z.string().optional().or(z.literal("")),
    vehicleBrand: z.string().optional().or(z.literal("")),
    vehicleModel: z.string().optional().or(z.literal("")),
    drivingLicenseNumber: z.string().optional().or(z.literal("")),
    drivingLicenseExpiry: optionalDateString,
    aadharNumber: aadharNumberSchema,
    bankAccountHolderName: z
      .string()
      .min(1, "Account holder name is required")
      .max(100),
    bankAccountNumber: z
      .string()
      .min(9, "Account number must be 9–18 digits")
      .max(18, "Account number must be 9–18 digits")
      .regex(/^[0-9]+$/, "Account number must be numeric"),
    bankIfscCode: z
      .string()
      .regex(ifscRegex, "Invalid IFSC code (e.g., SBIN0001234)"),
    emergencyContactName: z
      .string()
      .min(1, "Emergency contact name is required")
      .max(100),
    emergencyContactPhone: phoneSchema,
    partnerAgreement: boolFromForm,
    termsAccepted: boolFromForm,
    privacyAccepted: boolFromForm,
    // Legacy optional fields (ignored if sent)
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    vehicleName: z.string().optional(),
    panNumber: z.string().optional().or(z.literal("")),
    ref: z.string().trim().max(64).optional().or(z.literal("")),
    fcmToken: z.string().optional().nullable(),
    platform: z.enum(["web", "mobile"]).optional().default("web"),
    razorpayOrderId: z.string().optional(),
    razorpayPaymentId: z.string().optional(),
    razorpaySignature: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const dob = new Date(data.dateOfBirth);
    if (Number.isNaN(dob.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid date of birth",
        path: ["dateOfBirth"],
      });
    } else {
      const ageMs = Date.now() - dob.getTime();
      const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears < 18) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "You must be at least 18 years old",
          path: ["dateOfBirth"],
        });
      }
      if (ageYears > 80) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid date of birth",
          path: ["dateOfBirth"],
        });
      }
    }

    const isBicycle = data.vehicleType === "bicycle";

    if (!isBicycle) {
      if (!data.drivingLicenseNumber || !data.drivingLicenseNumber.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Driving license number is required",
          path: ["drivingLicenseNumber"],
        });
      } else if (
        !drivingLicenseRegex.test(
          data.drivingLicenseNumber.trim().toUpperCase(),
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid driving license format (e.g., MH1220110012345)",
          path: ["drivingLicenseNumber"],
        });
      }

      if (!data.drivingLicenseExpiry) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Driving license expiry date is required",
          path: ["drivingLicenseExpiry"],
        });
      } else {
        const expiry = new Date(data.drivingLicenseExpiry);
        if (Number.isNaN(expiry.getTime()) || expiry.getTime() < Date.now()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Driving license must not be expired",
            path: ["drivingLicenseExpiry"],
          });
        }
      }

      if (!data.vehicleNumber || !data.vehicleNumber.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Vehicle number is required",
          path: ["vehicleNumber"],
        });
      } else if (
        !vehicleNumberRegex.test(data.vehicleNumber.trim().toUpperCase())
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid Indian vehicle number format (e.g., MH12AB1234)",
          path: ["vehicleNumber"],
        });
      }

      if (!data.vehicleBrand || !data.vehicleBrand.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Vehicle brand is required",
          path: ["vehicleBrand"],
        });
      }

      if (!data.vehicleModel || !data.vehicleModel.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Vehicle model is required",
          path: ["vehicleModel"],
        });
      }
    } else if (data.drivingLicenseNumber && data.drivingLicenseNumber.trim()) {
      if (
        !drivingLicenseRegex.test(
          data.drivingLicenseNumber.trim().toUpperCase(),
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid driving license format",
          path: ["drivingLicenseNumber"],
        });
      }
    }

    if (
      String(data.emergencyContactPhone).replace(/\D/g, "").slice(-10) ===
      String(data.phone).replace(/\D/g, "").slice(-10)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Emergency contact must be different from your mobile number",
        path: ["emergencyContactPhone"],
      });
    }

    if (data.partnerAgreement !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Driver Partner Agreement must be accepted",
        path: ["partnerAgreement"],
      });
    }
    if (data.termsAccepted !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Terms & Conditions must be accepted",
        path: ["termsAccepted"],
      });
    }
    if (data.privacyAccepted !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Privacy Policy must be accepted",
        path: ["privacyAccepted"],
      });
    }
  });

export const validateDeliveryRegisterDto = (body) => {
  const result = deliveryRegisterSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }
  const data = result.data;
  return {
    ...data,
    // Already normalized by aadharNumberSchema preprocess; keep explicit for clarity
    aadharNumber: normalizeAadhaarInput(data.aadharNumber),
    drivingLicenseNumber: data.drivingLicenseNumber
      ? String(data.drivingLicenseNumber).trim().toUpperCase()
      : "",
    vehicleNumber: data.vehicleNumber
      ? String(data.vehicleNumber).trim().toUpperCase()
      : "",
    vehicleBrand: data.vehicleBrand ? String(data.vehicleBrand).trim() : "",
    vehicleModel: data.vehicleModel ? String(data.vehicleModel).trim() : "",
    bankIfscCode: String(data.bankIfscCode).trim().toUpperCase(),
    bankAccountNumber: String(data.bankAccountNumber).replace(/\s/g, ""),
    emergencyContactPhone: String(data.emergencyContactPhone)
      .replace(/\D/g, "")
      .slice(0, 15),
    phone: String(data.phone).replace(/\D/g, "").slice(0, 15),
  };
};

const deliveryProfileUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    countryCode: z.string().optional(),
    dateOfBirth: optionalDateString,
    email: z.string().email().optional().or(z.literal("")),
    vehicleType: z.enum(["bike", "scooter", "bicycle"]).optional(),
    vehicleName: z.string().optional(),
    vehicleBrand: z.string().optional().or(z.literal("")),
    vehicleModel: z.string().optional().or(z.literal("")),
    vehicleNumber: z.string().optional().or(z.literal("")),
    drivingLicenseNumber: z.string().optional().or(z.literal("")),
    drivingLicenseExpiry: optionalDateString,
    aadharNumber: z.string().optional().or(z.literal("")),
    bankAccountHolderName: z.string().optional().or(z.literal("")),
    bankAccountNumber: z.string().optional().or(z.literal("")),
    bankIfscCode: z.string().optional().or(z.literal("")),
    emergencyContactName: z.string().optional().or(z.literal("")),
    emergencyContactPhone: z.string().optional().or(z.literal("")),
    partnerAgreement: boolFromForm.optional(),
    termsAccepted: boolFromForm.optional(),
    privacyAccepted: boolFromForm.optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    fcmToken: z.string().optional().nullable(),
    platform: z.enum(["web", "mobile"]).optional().default("web"),
  })
  .superRefine((data, ctx) => {
    if (
      data.aadharNumber &&
      data.aadharNumber.trim() &&
      !aadharRegex.test(normalizeAadhaarInput(data.aadharNumber))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid Aadhaar format",
        path: ["aadharNumber"],
      });
    }
    if (
      data.drivingLicenseNumber &&
      data.drivingLicenseNumber.trim() &&
      !drivingLicenseRegex.test(data.drivingLicenseNumber.trim().toUpperCase())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid driving license format",
        path: ["drivingLicenseNumber"],
      });
    }
    if (
      data.vehicleNumber &&
      data.vehicleNumber.trim() &&
      data.vehicleType !== "bicycle"
    ) {
      if (!vehicleNumberRegex.test(data.vehicleNumber.trim().toUpperCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid Indian vehicle number format",
          path: ["vehicleNumber"],
        });
      }
    }
    if (
      data.bankIfscCode &&
      data.bankIfscCode.trim() &&
      !ifscRegex.test(data.bankIfscCode.trim().toUpperCase())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid IFSC code",
        path: ["bankIfscCode"],
      });
    }
  });

export const validateDeliveryProfileUpdateDto = (body) => {
  const result = deliveryProfileUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }
  return result.data;
};

const bankDetailsSchema = z.object({
  accountHolderName: z
    .string()
    .min(1, "Account holder name is required")
    .optional()
    .or(z.literal("")),
  accountNumber: z
    .string()
    .min(1, "Account number is required")
    .optional()
    .or(z.literal("")),
  ifscCode: z
    .string()
    .min(1, "IFSC code is required")
    .optional()
    .or(z.literal("")),
  bankName: z
    .string()
    .min(1, "Bank name is required")
    .optional()
    .or(z.literal("")),
  upiId: z.string().optional().or(z.literal("")),
  upiQrCode: z.string().optional().or(z.literal("")),
});

const bankDetailsUpdateSchema = z
  .object({
    documents: z
      .object({
        bankDetails: bankDetailsSchema.optional(),
        pan: z.object({ number: z.string().optional() }).optional(),
      })
      .optional(),
  })
  .optional();

export const validateDeliveryBankDetailsDto = (body) => {
  const processed = { ...body };
  if (
    body["documents[bankDetails][accountHolderName]"] ||
    body["documents[bankDetails][accountNumber]"]
  ) {
    processed.documents = {
      bankDetails: {
        accountHolderName: body["documents[bankDetails][accountHolderName]"],
        accountNumber: body["documents[bankDetails][accountNumber]"],
        ifscCode: body["documents[bankDetails][ifscCode]"],
        bankName: body["documents[bankDetails][bankName]"],
        upiId: body["documents[bankDetails][upiId]"],
      },
      pan: {
        number: body["documents[pan][number]"],
      },
    };
  }
  const result = bankDetailsUpdateSchema.safeParse(processed);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }
  return result.data || {};
};

export const FOOD_RIDER_REQUIRED_DOCS = {
  always: ["profilePhoto", "aadharFront", "aadharBack"],
  motorized: [
    "drivingLicenseFront",
    "drivingLicenseBack",
    "rcPhoto",
    "insurancePhoto",
  ],
};

export const validateDeliveryDocumentsRequired = (
  files,
  vehicleType,
  { allowPartial = false, requestedDocs = [] } = {},
) => {
  const isBicycle = vehicleType === "bicycle";
  const getFile = (name) => files?.[name]?.[0] || null;

  // Backward-compatible aliases
  const has = (primary, alias) =>
    Boolean(getFile(primary) || (alias ? getFile(alias) : null));

  if (
    allowPartial &&
    Array.isArray(requestedDocs) &&
    requestedDocs.length > 0
  ) {
    for (const doc of requestedDocs) {
      if (!has(doc)) {
        throw new ValidationError(`Document required for re-upload: ${doc}`);
      }
    }
    return;
  }

  if (!has("profilePhoto")) {
    throw new ValidationError("Profile photo is required");
  }
  if (!has("aadharFront", "aadharPhoto")) {
    throw new ValidationError("Aadhaar front photo is required");
  }
  if (!has("aadharBack")) {
    throw new ValidationError("Aadhaar back photo is required");
  }

  if (!isBicycle) {
    if (!has("drivingLicenseFront", "drivingLicensePhoto")) {
      throw new ValidationError("Driving license front photo is required");
    }
    if (!has("drivingLicenseBack")) {
      throw new ValidationError("Driving license back photo is required");
    }
    if (!has("rcPhoto")) {
      throw new ValidationError("RC document is required for bike/scooter");
    }
    if (!has("insurancePhoto")) {
      throw new ValidationError(
        "Insurance document is required for bike/scooter",
      );
    }
  }
};

const ALLOWED_REQUEST_DOCS = new Set([
  "profilePhoto",
  "aadharFront",
  "aadharBack",
  "drivingLicenseFront",
  "drivingLicenseBack",
  "rcPhoto",
  "insurancePhoto",
]);

const requestDocumentsSchema = z.object({
  documents: z
    .array(z.string().min(1))
    .min(1, "Select at least one document to re-upload")
    .refine((docs) => docs.every((d) => ALLOWED_REQUEST_DOCS.has(d)), {
      message: "One or more selected documents are invalid",
    }),
  reason: z.string().min(3, "Reason is required").max(500),
});

export const validateRequestDocumentsDto = (body) => {
  const result = requestDocumentsSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }
  return result.data;
};
