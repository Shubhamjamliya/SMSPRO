import { FaqCategory } from '../models/faqCategory.model.js';
import { Faq } from '../models/faq.model.js';

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findFaqCategoryByName = (name) => {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return null;

  return FaqCategory.findOne({
    name: new RegExp(`^${escapeRegex(normalizedName)}$`, 'i'),
  });
};

const formatAdminFaq = (item) => {
  const id = String(item?._id || '');
  return {
    ...item,
    _id: item._id,
    id,
    category: item.categoryId?.name || 'Uncategorized',
    views: Number(item.views || 0),
    lastUpdated: item.updatedAt
      ? new Date(item.updatedAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '',
    createdAt: item.createdAt ? new Date(item.createdAt).getTime() : 0,
  };
};

// --- Categories ---

export const getFaqCategories = async (req, res) => {
  try {
    const categories = await FaqCategory.find().sort({ createdAt: -1 });
    res.json({ success: true, result: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createFaqCategory = async (req, res) => {
  try {
    const { name, color } = req.body;
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const category = await FaqCategory.create({
      name: normalizedName,
      color: color || 'sky',
    });
    res.status(201).json({ success: true, result: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteFaqCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const faqCount = await Faq.countDocuments({ categoryId: id });
    if (faqCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with existing FAQs. Delete FAQs first.',
      });
    }
    await FaqCategory.findByIdAndDelete(id);
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Admin FAQs ---

export const getAdminFaqs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Faq.find()
        .populate('categoryId', 'name color')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Faq.countDocuments(),
    ]);

    res.json({
      success: true,
      result: {
        items: items.map(formatAdminFaq),
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createFaq = async (req, res) => {
  try {
    const { category, audience, question, answer, status } = req.body;

    const categoryDoc = await findFaqCategoryByName(category);
    if (!categoryDoc) {
      return res.status(400).json({ success: false, message: 'Category not found' });
    }

    const normalizedAudience = audience === 'seller' ? 'seller' : 'customer';
    const normalizedQuestion = String(question || '').trim();
    const normalizedAnswer = String(answer || '').trim();

    if (!normalizedQuestion || !normalizedAnswer) {
      return res.status(400).json({
        success: false,
        message: 'Question and answer are required',
      });
    }

    const faq = await Faq.create({
      categoryId: categoryDoc._id,
      audience: normalizedAudience,
      question: normalizedQuestion,
      answer: normalizedAnswer,
      status: status === 'draft' ? 'draft' : 'published',
    });

    res.status(201).json({ success: true, result: faq });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, audience, question, answer, status } = req.body;

    const updateData = {};

    if (audience !== undefined) {
      updateData.audience = audience === 'seller' ? 'seller' : 'customer';
    }
    if (question !== undefined) {
      const normalizedQuestion = String(question || '').trim();
      if (!normalizedQuestion) {
        return res.status(400).json({ success: false, message: 'Question is required' });
      }
      updateData.question = normalizedQuestion;
    }
    if (answer !== undefined) {
      const normalizedAnswer = String(answer || '').trim();
      if (!normalizedAnswer) {
        return res.status(400).json({ success: false, message: 'Answer is required' });
      }
      updateData.answer = normalizedAnswer;
    }
    if (status !== undefined) {
      updateData.status = status === 'draft' ? 'draft' : 'published';
    }
    if (category) {
      const categoryDoc = await findFaqCategoryByName(category);
      if (!categoryDoc) {
        return res.status(400).json({ success: false, message: 'Category not found' });
      }
      updateData.categoryId = categoryDoc._id;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    const faq = await Faq.findByIdAndUpdate(id, updateData, { new: true });
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    res.json({ success: true, result: faq });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteFaq = async (req, res) => {
  try {
    const deleted = await Faq.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'FAQ not found' });
    }
    res.json({ success: true, message: 'FAQ deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// --- Public FAQs ---

export const getPublicFaqs = async (req, res) => {
  try {
    const { audience } = req.query;
    if (!audience || !['customer', 'seller'].includes(String(audience))) {
      return res.status(400).json({ success: false, message: 'Audience is required' });
    }

    const items = await Faq.find({ audience, status: 'published' })
      .populate('categoryId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const faqIds = items.map((i) => i._id);
    if (faqIds.length > 0) {
      Faq.updateMany({ _id: { $in: faqIds } }, { $inc: { views: 1 } }).catch(console.error);
    }

    const formattedItems = items.map((item) => ({
      _id: item._id,
      id: String(item._id),
      question: item.question,
      answer: item.answer,
      category: item.categoryId?.name || 'Uncategorized',
    }));

    res.json({ success: true, result: { items: formattedItems } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
