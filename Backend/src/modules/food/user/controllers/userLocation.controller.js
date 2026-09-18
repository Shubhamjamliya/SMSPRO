import { z } from 'zod';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

// Clients send null for unknown optional fields (e.g. accuracy: null), so
// every optional field is nullish-tolerant instead of strictly optional.
const updateLocationSchema = z.object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().nonnegative().nullish(),
    street: z.string().max(300).nullish(),
    area: z.string().max(200).nullish(),
    landmark: z.string().max(200).nullish(),
    city: z.string().max(100).nullish(),
    state: z.string().max(100).nullish(),
    zipCode: z.string().max(20).nullish(),
    pincode: z.string().max(20).nullish(),
    postalCode: z.string().max(20).nullish(),
    country: z.string().max(100).nullish(),
    address: z.string().max(500).nullish(),
    formattedAddress: z.string().max(500).nullish()
});

const clean = (v) => String(v ?? '').trim();

const toClientLocation = (live) => {
    const coords = live?.location?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return null;
    return {
        latitude: coords[1],
        longitude: coords[0],
        accuracy: live.accuracy ?? null,
        street: live.street || '',
        area: live.area || '',
        landmark: live.landmark || '',
        city: live.city || '',
        state: live.state || '',
        zipCode: live.zipCode || '',
        postalCode: live.zipCode || '',
        country: live.country || '',
        address: live.formattedAddress || '',
        formattedAddress: live.formattedAddress || '',
        updatedAt: live.updatedAt || null
    };
};

/** GET /food/user/location — last saved live location for the logged-in user. */
export const getUserLocationController = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const user = await FoodUser.findById(userId).select('liveLocation').lean();
        if (!user) return sendError(res, 404, 'User not found');
        const location = toClientLocation(user.liveLocation);
        return sendResponse(res, 200, 'Location retrieved', { location });
    } catch (err) {
        next(err);
    }
};

/** PATCH /food/user/location — save the user's current live location. */
export const updateUserLocationController = async (req, res, next) => {
    try {
        const { userId } = req.user;
        const parsed = updateLocationSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ValidationError(parsed.error.errors[0].message);
        }
        const dto = parsed.data;

        const liveLocation = {
            location: { type: 'Point', coordinates: [dto.longitude, dto.latitude] },
            accuracy: dto.accuracy ?? null,
            street: clean(dto.street),
            area: clean(dto.area),
            landmark: clean(dto.landmark),
            city: clean(dto.city),
            state: clean(dto.state),
            zipCode: clean(dto.zipCode || dto.pincode || dto.postalCode),
            country: clean(dto.country),
            formattedAddress: clean(dto.formattedAddress || dto.address),
            updatedAt: new Date()
        };

        const user = await FoodUser.findByIdAndUpdate(
            userId,
            { $set: { liveLocation } },
            { new: true, select: 'liveLocation' }
        ).lean();
        if (!user) return sendError(res, 404, 'User not found');

        return sendResponse(res, 200, 'Location updated', {
            location: toClientLocation(user.liveLocation)
        });
    } catch (err) {
        next(err);
    }
};
