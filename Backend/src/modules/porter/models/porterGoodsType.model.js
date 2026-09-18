import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const porterGoodsTypeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        description: {
            type: String,
            default: '',
            trim: true,
            maxlength: 200,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
        },
        displayOrder: {
            type: Number,
            default: 0,
            min: 0,
        },
        isDeleted: { type: Boolean, default: false, index: true },
        createdBy: { type: actionPerformerSchema, default: null },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'porter_goods_types',
        timestamps: true,
    },
);

porterGoodsTypeSchema.index({ name: 1, isDeleted: 1 });

export const PorterGoodsType = mongoose.models.PorterGoodsType
    || mongoose.model('PorterGoodsType', porterGoodsTypeSchema, 'porter_goods_types');
