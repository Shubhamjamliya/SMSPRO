import React, { useState, useMemo, useEffect, useRef } from "react";
import Button from "@shared/components/ui/Button";
import Badge from "@shared/components/ui/Badge";
import {
  HiOutlineArrowLeft,
  HiOutlineCube,
  HiOutlineTag,
  HiOutlineCurrencyDollar,
  HiOutlineSwatch,
  HiOutlineFolderOpen,
  HiOutlinePhoto,
  HiOutlineScale,
  HiOutlineArrowPath,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineSquaresPlus,
  HiOutlineCurrencyRupee,
} from "react-icons/hi2";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import toast2 from "react-hot-toast";
import { sellerApi } from "../services/sellerApi";
import {
  buildAddProductDraftPayload,
  createBlankAddProductForm,
  fileToPersistedImage,
  hydrateAddProductForm,
  markAddProductJustSaved,
  readAddProductDraft,
  writeAddProductDraft,
} from "../utils/addProductDraft";
import {
  MAX_PRODUCT_VARIANTS,
  MAX_VARIANT_IMAGES,
  MIN_VARIANT_IMAGES,
  emptyVariant,
} from "@shared/utils/variantMedia";

const ADD_PRODUCT_TABS = [
  { id: "general", label: "General Info", icon: HiOutlineTag },
  { id: "variants", label: "Variants & Photos", icon: HiOutlineSwatch },
  { id: "category", label: "Groups", icon: HiOutlineFolderOpen },
];

const AddProduct = () => {
  const navigate = useNavigate();
  const draftSeed = useRef(null);
  if (draftSeed.current === null) {
    draftSeed.current = readAddProductDraft();
  }
  const restoredDraft = draftSeed.current;
  const restoredTab =
    restoredDraft?.modalTab && restoredDraft.modalTab !== "media"
      ? restoredDraft.modalTab
      : "general";

  const [modalTab, setModalTab] = useState(restoredTab);
  const [isSaving, setIsSaving] = useState(false);
  const skipNextDraftWrite = useRef(Boolean(restoredDraft));

  const [formData, setFormData] = useState(() =>
    restoredDraft?.formData
      ? hydrateAddProductForm(restoredDraft.formData)
      : createBlankAddProductForm(),
  );

  const [dbCategories, setDbCategories] = useState([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await sellerApi.getCategoryTree();
        if (res.data.success) {
          setDbCategories(res.data.results || res.data.result || []);
        }
      } catch (error) {
        toast.error("Failed to load categories");
      } finally {
        setIsLoadingCats(false);
      }
    };
    fetchCats();
  }, []);

  // Keep filled form across refresh while the seller is still drafting.
  useEffect(() => {
    if (skipNextDraftWrite.current) {
      skipNextDraftWrite.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      writeAddProductDraft(buildAddProductDraftPayload(formData, modalTab));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [formData, modalTab]);

  const categories = useMemo(() => dbCategories, [dbCategories]);

  const currentTabIndex = useMemo(
    () => Math.max(0, ADD_PRODUCT_TABS.findIndex((tab) => tab.id === modalTab)),
    [modalTab],
  );
  const isFirstTab = currentTabIndex <= 0;
  const isLastTab = currentTabIndex >= ADD_PRODUCT_TABS.length - 1;

  const sanitizeVariantImageCount = (variant) =>
    (Array.isArray(variant?.images) ? variant.images : []).filter(Boolean).length;

  const validateStep = (tabId = modalTab) => {
    if (tabId === "general") {
      if (!String(formData.name || "").trim()) {
        toast.error("Please fill in the Product Title");
        return false;
      }
      return true;
    }

    if (tabId === "variants") {
      const variants = Array.isArray(formData.variants) ? formData.variants : [];
      if (!variants.length) {
        toast.error("Add at least one variant with price, stock and photos");
        return false;
      }
      if (variants.length > MAX_PRODUCT_VARIANTS) {
        toast.error(`You can add at most ${MAX_PRODUCT_VARIANTS} variants`);
        return false;
      }
      const invalidVariant = variants.find(
        (v) =>
          !v.name ||
          !v.price ||
          Number(v.price) < 1 ||
          v.stock === "" ||
          Number(v.stock) < 0,
      );
      if (invalidVariant) {
        toast.error("Each variant needs a name, price (≥1), and stock (≥0)");
        return false;
      }
      if (variants.some((v) => v.salePrice && Number(v.salePrice) < 1)) {
        toast.error("Sale price must be at least 1");
        return false;
      }
      const badSale = variants.find(
        (v) =>
          v.salePrice !== "" &&
          v.salePrice != null &&
          Number(v.salePrice) > 0 &&
          Number(v.salePrice) > Number(v.price),
      );
      if (badSale) {
        toast.error(
          `${badSale.name || "Variant"}: Sale price cannot be greater than Price (MRP)`,
        );
        return false;
      }
      const missingPhotos = variants.find(
        (v) => sanitizeVariantImageCount(v) < MIN_VARIANT_IMAGES,
      );
      if (missingPhotos) {
        toast.error(
          `${missingPhotos.name || "Variant"}: add at least ${MIN_VARIANT_IMAGES} photo (max ${MAX_VARIANT_IMAGES})`,
        );
        return false;
      }
      return true;
    }

    if (tabId === "category") {
      if (!formData.header || !formData.category) {
        toast.error("Please select Main Group and Specific Category");
        return false;
      }
      const selectedHeader = categories.find(
        (h) => String(h._id || h.id) === String(formData.header),
      );
      const selectedMain = selectedHeader?.children?.find(
        (c) => String(c._id || c.id) === String(formData.category),
      );
      if (!selectedHeader || !selectedMain) {
        toast.error("Selected category is inactive. Please use another active category.");
        return false;
      }
      return true;
    }

    return true;
  };

  const handleBackStep = () => {
    if (isFirstTab) {
      setAddMethod(null);
      return;
    }
    setModalTab(ADD_PRODUCT_TABS[currentTabIndex - 1].id);
  };

  const handleContinueStep = async () => {
    if (!validateStep(modalTab)) return;
    if (isLastTab) {
      await handleSave();
      return;
    }
    setModalTab(ADD_PRODUCT_TABS[currentTabIndex + 1].id);
  };

  React.useEffect(() => {
    if (isLoadingCats || !categories.length) return;
    if (!formData.header && !formData.category) return;

    const header = categories.find((h) => String(h._id || h.id) === String(formData.header));
    const main = header?.children?.find((c) => String(c._id || c.id) === String(formData.category));

    if (formData.header && !header) {
      setFormData((prev) => ({ ...prev, header: "", category: "" }));
      toast.error("Previous category is inactive/deleted. Please select another active category.");
      return;
    }
    if (formData.category && header && !main) {
      setFormData((prev) => ({ ...prev, category: "" }));
      toast.error("Selected main category is inactive/deleted. Please choose another category.");
    }
  }, [categories, isLoadingCats, formData.header, formData.category]);

  const handleSave = async () => {
    // Full validation across steps before publish
    if (!validateStep("general")) {
      setModalTab("general");
      return;
    }
    if (!validateStep("variants")) {
      setModalTab("variants");
      return;
    }
    if (!validateStep("category")) {
      setModalTab("category");
      return;
    }

    const variants = Array.isArray(formData.variants) ? formData.variants : [];
    const firstVariant = variants[0] || {};
    const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

    setIsSaving(true);
    try {
      const data = new FormData();
      const clientRequestId = formData.clientRequestId || crypto.randomUUID?.() || `cr-${Date.now()}`;

      data.append("name", formData.name);
      data.append("slug", formData.slug);
      data.append("sku", formData.sku);
      data.append("description", formData.description);
      data.append("brand", formData.brand);
      data.append("weight", formData.weight);
      data.append("status", formData.status);
      data.append("clientRequestId", clientRequestId);
      data.append("price", firstVariant.price || 0);
      data.append("salePrice", firstVariant.salePrice || 0);
      data.append("stock", totalStock);
      data.append("packingAmount", formData.packingAmount || 0);
      data.append("lowStockAlert", formData.lowStockAlert || 5);
      data.append("headerId", formData.header);
      data.append("categoryId", formData.category);
      data.append("tags", formData.tags);

      const serializableVariants = variants.map((variant) => ({
        _id: variant._id,
        id: variant.id,
        name: variant.name,
        price: variant.price,
        salePrice: variant.salePrice,
        stock: variant.stock,
        sku: variant.sku,
        images: (Array.isArray(variant.images) ? variant.images : []).filter(
          (url) => url && !String(url).startsWith("data:"),
        ),
      }));
      data.append("variants", JSON.stringify(serializableVariants));

      variants.forEach((variant, index) => {
        const files = Array.isArray(variant.imageFiles) ? variant.imageFiles.filter(Boolean) : [];
        files.slice(0, MAX_VARIANT_IMAGES).forEach((file) => {
          data.append(`variantImages_${index}`, file);
        });
      });

      writeAddProductDraft(
        buildAddProductDraftPayload(
          { ...formData, clientRequestId },
          modalTab,
        ),
      );
      const existingId = formData.createdProductId;
      const response = existingId
        ? await sellerApi.updateProduct(existingId, data)
        : await sellerApi.createProduct(data);
      const savedId =
        response?.data?.result?._id ||
        response?.data?.result?.id ||
        existingId ||
        "";

      const savedForm = {
        ...formData,
        clientRequestId,
        createdProductId: savedId ? String(savedId) : formData.createdProductId,
      };
      setFormData(savedForm);
      writeAddProductDraft(buildAddProductDraftPayload(savedForm, modalTab));
      markAddProductJustSaved();
      toast.success(existingId ? "Product updated successfully!" : "Product saved successfully!");
      navigate("/seller/products");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save product");
    } finally {
      setIsSaving(false);
    }
  };

  const handleVariantImageUpload = async (variantIndex, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const variant = formData.variants?.[variantIndex];
    const currentCount = sanitizeVariantImageCount(variant);
    if (currentCount >= MAX_VARIANT_IMAGES) {
      toast.error(`Each variant can have at most ${MAX_VARIANT_IMAGES} photos`);
      return;
    }
    try {
      const persisted = await fileToPersistedImage(file);
      if (!persisted) return;
      setFormData((prev) => {
        const next = [...(prev.variants || [])];
        const current = next[variantIndex] || emptyVariant();
        next[variantIndex] = {
          ...current,
          images: [...(current.images || []), persisted.dataUrl].slice(0, MAX_VARIANT_IMAGES),
          imageFiles: [...(current.imageFiles || []), persisted.file].slice(0, MAX_VARIANT_IMAGES),
        };
        return { ...prev, variants: next };
      });
    } catch {
      toast.error("Could not read that photo. Try another image.");
    }
  };

  const handleRemoveVariantImage = (variantIndex, imageIndex) => {
    setFormData((prev) => {
      const next = [...(prev.variants || [])];
      const current = next[variantIndex];
      if (!current) return prev;
      next[variantIndex] = {
        ...current,
        images: (current.images || []).filter((_, idx) => idx !== imageIndex),
        imageFiles: (current.imageFiles || []).filter((_, idx) => idx !== imageIndex),
      };
      return { ...prev, variants: next };
    });
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const addMethod = searchParams.get("method");
  const setAddMethod = (method) => {
    if (method) {
      setSearchParams({ method });
    } else {
      setSearchParams({});
    }
  };
  const [csvFile, setCsvFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [criticalError, setCriticalError] = useState(null);

  const downloadTemplate = () => {
    let headers = [
      "name", "description", "brand", "price", "salePrice", "stock", "lowStockAlert", 
      "header", "category", "mainImage", "galleryImages", "status",
      "variantName", "variantPrice", "variantSalePrice", "variantStock"
    ];
    let sampleRow = [
      "Organic Baby Puree",
      "Delicious organic baby puree mix",
      "NutriBaby",
      "110",
      "89",
      "120",
      "10",
      "Kids",
      "Kids Food",
      "Baby Food",
      "https://images.unsplash.com/photo-1596263576925-d90d63691097",
      "https://images.unsplash.com/photo-1596263576925-d90d63691097",
      "active",
      "200g Pack",
      "110",
      "89",
      "120"
    ];

    // Escaping commas by quoting values
    const escapedRow = sampleRow.map(val => `"${String(val).replace(/"/g, '""')}"`);
    const csvContent = [headers.join(","), escapedRow.join(",")].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "product_bulk_upload_template.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error("Please select a CSV file first");
      return;
    }

    setIsUploading(true);
    setValidationErrors([]);
    setCriticalError(null);

    try {
      const data = new FormData();
      data.append("csvFile", csvFile);

      const res = await sellerApi.bulkUploadProducts(data);
      if (res.data.success) {
        toast.success(res.data.message || "Products imported successfully!");
        navigate("/seller/products");
      }
    } catch (error) {
      const resData = error.response?.data;
      if (resData?.errors && Array.isArray(resData.errors)) {
        setValidationErrors(resData.errors);
        toast.error("CSV Validation Failed. Please review the errors.");
      } else {
        setCriticalError(resData?.message || "Failed to upload and import products due to an unexpected server error.");
        toast.error("Failed to upload and import products.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  if (addMethod === null) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="pl-0 hover:bg-transparent hover:text-primary"
            onClick={() => navigate(-1)}>
            <HiOutlineArrowLeft className="mr-2 h-5 w-5" />
            Back to Products
          </Button>
        </div>

        <div className="text-center space-y-2 py-6">
          <h2 className="text-2xl font-black text-slate-800">Add New Product</h2>
          <p className="text-sm text-slate-500 font-medium">
            Choose how you want to add products to your store.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Single Add */}
          <div
            onClick={() => setAddMethod("single")}
            className="bg-white p-8 rounded-3xl border border-slate-100 shadow-lg hover:shadow-xl hover:border-primary/20 transition-all cursor-pointer group flex flex-col items-center text-center space-y-4"
          >
            <div className="p-4 bg-primary/5 text-primary rounded-2xl group-hover:bg-primary group-hover:text-white transition-all">
              <HiOutlineCube className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Single Product</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Add a single product manually. Perfect for entering rich descriptions, uploading custom cover photos, and configuring specific item variants.
            </p>
            <span className="text-xs font-black text-primary group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              PROCEED <HiOutlineArrowLeft className="h-4 w-4 rotate-180" />
            </span>
          </div>

          {/* Card 2: Bulk Upload */}
          <div
            onClick={() => setAddMethod("bulk")}
            className="bg-white p-8 rounded-3xl border border-slate-100 shadow-lg hover:shadow-xl hover:border-primary/20 transition-all cursor-pointer group flex flex-col items-center text-center space-y-4"
          >
            <div className="p-4 bg-primary/5 text-primary rounded-2xl group-hover:bg-primary group-hover:text-white transition-all">
              <HiOutlineSquaresPlus className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Bulk CSV Upload</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Upload a spreadsheet in CSV format. Ideal for importing dozens or hundreds of products at once with external image URLs.
            </p>
            <span className="text-xs font-black text-primary group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
              PROCEED <HiOutlineArrowLeft className="h-4 w-4 rotate-180" />
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (addMethod === "bulk") {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            className="pl-0 hover:bg-transparent hover:text-primary"
            onClick={() => setAddMethod(null)}>
            <HiOutlineArrowLeft className="mr-2 h-5 w-5" />
            Change Method
          </Button>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900">Bulk Product Upload</h3>
            <p className="text-sm text-slate-500 font-medium">
              Upload a CSV file to add products in bulk.
            </p>
          </div>

          <form onSubmit={handleBulkUpload} className="space-y-6">
            {/* Warning Alert */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-3 animate-in slide-in-from-top duration-300">
              <h4 className="text-sm font-bold text-amber-800 flex items-center gap-2">
                ⚠️ Upload Recommendation & SKU Guidelines
              </h4>
              <p className="text-xs text-amber-700 font-semibold leading-relaxed">
                <strong>Limit Upload Count:</strong> We recommend uploading at most <strong>100 products</strong> in a single CSV file. Uploading extremely large batches at once may cause processing timeouts or database performance issues.
              </p>
              <div className="border-t border-amber-200/60 pt-3 space-y-2 text-xs text-amber-700 font-medium">
                <p className="leading-relaxed font-semibold text-amber-800 bg-amber-100/50 p-3 rounded-lg flex flex-col gap-1.5">
                  <span>💡 <strong>Automatic SKU Generation:</strong></span>
                  <span>Unique product and variant SKUs will be automatically generated by the server based on the product name and variant name (e.g. <code>SKU-RICE-DAAWAT-[RANDOM-ID]</code> and <code>SKU-RICE-DAAWAT-[RANDOM-ID]-1KG</code>).</span>
                  <span><strong>Do not</strong> include <code>sku</code> or <code>variantSku</code> columns in your CSV.</span>
                </p>
              </div>
            </div>

            {/* Drag & Drop selector */}
            <div className="border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center hover:border-primary hover:bg-primary/5 transition-all relative">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setCsvFile(e.target.files[0]);
                    setValidationErrors([]);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <HiOutlineSquaresPlus className="h-12 w-12 text-slate-300 mb-3" />
              {csvFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800">{csvFile.name}</p>
                  <p className="text-xs text-slate-400 font-medium">
                    {(csvFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-700">
                    Click to browse or drag & drop CSV file
                  </p>
                  <p className="text-xs text-slate-400 font-medium">
                    Spreadsheet file (.csv) only
                  </p>
                </div>
              )}
            </div>

            {/* Template Download & Instructions */}
            <div className="bg-slate-50/80 rounded-2xl p-6 border border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    CSV Structure Template
                  </h4>
                  <p className="text-xs text-slate-500 font-medium">
                    Make sure your CSV contains all required headers and correct formatting.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary transition-all shadow-sm shrink-0 self-start sm:self-center"
                >
                  Download CSV Template
                </button>
              </div>

              <div className="border-t border-slate-200/60 pt-4 space-y-2">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Supported Fields & Formats:
                </p>
                <ul className="text-xs text-slate-500 font-medium space-y-1.5 list-disc list-inside">
                  <li><strong className="text-slate-700">General Info</strong>: <code>name</code> (required), <code>description</code>, <code>brand</code>.</li>
                  <li><strong className="text-slate-700">Pricing & Stock</strong>: <code>price</code> (required), <code>salePrice</code> (discounted price), <code>stock</code> (required), <code>lowStockAlert</code>.</li>
                  <li><strong className="text-slate-700">Groups / Categories</strong>: <code>header</code>, <code>category</code> (look up by names) OR <code>headerId</code>, <code>categoryId</code> (24-char IDs).</li>
                  <li><strong className="text-slate-700">Photos</strong>: <code>mainImage</code> (Cover photo URL starting with http/https), <code>galleryImages</code> (comma-separated URLs).</li>
                  <li><strong className="text-slate-700">Item Variants</strong>: <code>variantName</code> (defaults to Default/weight), <code>variantPrice</code>, <code>variantSalePrice</code>, <code>variantStock</code>. Multiple rows with same name automatically group into single product with variants.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-6">
              <Button
                variant="outline"
                type="button"
                onClick={() => setAddMethod(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!csvFile || isUploading}
                className="min-w-[150px]"
              >
                {isUploading ? "Importing..." : "Upload & Import"}
              </Button>
            </div>

            {/* Uploading loading overlay modal */}
            {isUploading && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl border border-slate-100 scale-in duration-200">
                  <div className="flex justify-center">
                    <div className="relative flex items-center justify-center animate-bounce">
                      <div className="w-16 h-16 border-4 border-primary/20 border-t-orange-500 rounded-full animate-spin"></div>
                      <HiOutlineArrowPath className="absolute h-6 w-6 text-primary animate-spin" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-black text-slate-800">Uploading & Processing</h3>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">
                      Please wait while we validate your CSV data, process categories, verify SKU integrity, and create your products in bulk.
                    </p>
                  </div>
                  <div className="bg-primary/5 rounded-xl py-2 px-4 inline-flex items-center gap-2 text-xs font-bold text-primary">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                    Do not close this page
                  </div>
                </div>
              </div>
            )}

            {/* Validation errors overlay modal */}
            {validationErrors.length > 0 && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl p-8 max-w-2xl w-full text-left space-y-6 shadow-2xl border border-slate-100 flex flex-col max-h-[85vh]">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-rose-50 text-rose-500 rounded-2xl text-xl">
                        ⚠️
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-800">CSV Validation Failed</h3>
                        <p className="text-xs text-slate-500 font-medium">
                          We found {validationErrors.length} errors in your CSV file.
                        </p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setValidationErrors([])}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-2 py-1">
                    {validationErrors.map((err, idx) => (
                      <div key={idx} className="p-3.5 bg-rose-50/50 border border-rose-100/50 rounded-xl flex items-start gap-2.5">
                        <span className="text-rose-500 font-bold mt-0.5 text-xs shrink-0">•</span>
                        <p className="text-xs text-rose-800 font-bold leading-relaxed">{err}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 shrink-0">
                    <button
                      type="button"
                      onClick={() => setValidationErrors([])}
                      className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all"
                    >
                      Go Back & Fix
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Critical server error overlay modal */}
            {criticalError && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl border border-slate-100">
                  <div className="flex justify-center">
                    <div className="p-4 bg-rose-50 text-rose-500 rounded-full">
                      <span className="text-3xl">🚫</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-black text-slate-800">Import Failed</h3>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">
                      {criticalError}
                    </p>
                  </div>
                  <div className="flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCriticalError(null)}
                      className="px-6 py-2.5 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-all shadow-md"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <Button
          variant="ghost"
          className="pl-0 hover:bg-transparent hover:text-primary-600"
          onClick={() => navigate(-1)}>
          <HiOutlineArrowLeft className="mr-2 h-5 w-5" />
          Back to Products
        </Button>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[600px] border border-slate-100">
        {/* Sidebar Tabs */}
        <div className="md:w-64 bg-slate-50/50 border-r border-slate-100 p-4 space-y-1 overflow-y-auto">
          {ADD_PRODUCT_TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setModalTab(tab.id)}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-md text-xs font-bold transition-all text-left",
                modalTab === tab.id
                  ? "bg-white text-primary shadow-sm ring-1 ring-slate-100"
                  : "text-slate-600 hover:bg-slate-100",
              )}>
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black",
                  index <= currentTabIndex
                    ? "bg-primary text-white"
                    : "bg-slate-200 text-slate-500",
                )}
              >
                {index + 1}
              </span>
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          ))}

          <div className="pt-8 px-4">
            <div className="p-4 bg-emerald-50 rounded-md border border-emerald-100">
              <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1">
                Status
              </p>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="w-full bg-transparent border-none text-xs font-bold text-emerald-700 outline-none p-0 cursor-pointer focus:ring-0">
                <option value="active">PUBLISHED</option>
                <option value="inactive">DRAFT</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto">
          {modalTab === "general" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">

              <div className="space-y-1.5 flex flex-col">
                <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  Product Title
                </label>
                <input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-semibold outline-none ring-primary/5 focus:ring-2 transition-all"
                  placeholder="e.g. Premium Basmati Rice"
                />
              </div>
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                  About this item
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  onWheel={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  className="w-full px-4 py-3 bg-slate-100 border-none rounded-2xl text-sm font-semibold min-h-[160px] max-h-[260px] outline-none transition-all focus:ring-2 focus:ring-primary/5 resize-none overflow-y-auto custom-scrollbar"
                  placeholder="Describe the item here..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Brand Name
                  </label>
                  <input
                    value={formData.brand}
                    onChange={(e) =>
                      setFormData({ ...formData, brand: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-semibold outline-none ring-primary/5 focus:ring-2 transition-all"
                    placeholder="e.g. Amul"
                  />
                </div>
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Product Code
                  </label>
                  <input
                    value={formData.sku}
                    readOnly
                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-mono font-bold outline-none text-slate-400 cursor-not-allowed"
                    placeholder="AUTO-GENERATED"
                  />
                </div>
              </div>
            </div>
          )}

          {modalTab === "variants" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl border border-amber-100 bg-amber-50/40">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[10px] sm:text-xs font-bold text-slate-700 uppercase tracking-widest ml-1">
                    Packing amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.packingAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, packingAmount: e.target.value })
                    }
                    placeholder="Per unit at checkout"
                    className="w-full px-4 py-2.5 bg-white border-none rounded-xl text-sm font-bold outline-none ring-1 ring-amber-100 focus:ring-2 focus:ring-amber-200"
                  />
                  <p className="text-[10px] font-medium text-slate-500 ml-1">
                    Shown at checkout and added to your earnings (not commissionable).
                  </p>
                </div>
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[9px] font-bold text-rose-500 uppercase tracking-widest ml-1">
                    Alert when total stock is below
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.lowStockAlert}
                    onChange={(e) =>
                      setFormData({ ...formData, lowStockAlert: e.target.value })
                    }
                    className="w-full px-4 py-2.5 bg-rose-50/30 border-none rounded-xl text-sm font-bold text-rose-600 outline-none ring-rose-100 focus:ring-2"
                  />
                  <p className="text-[10px] font-medium text-slate-500 ml-1">
                    Total stock = sum of variant stocks (
                    {(formData.variants || []).reduce(
                      (sum, v) => sum + (Number(v.stock) || 0),
                      0,
                    )}
                    ).
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Product Variants
                  </h4>
                  <p className="text-xs text-slate-600 font-medium">
                    Price, stock and 1–{MAX_VARIANT_IMAGES} photos per variant. Max {MAX_PRODUCT_VARIANTS} variants. First variant shows on the product card.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if ((formData.variants || []).length >= MAX_PRODUCT_VARIANTS) {
                      toast.error(`You can add at most ${MAX_PRODUCT_VARIANTS} variants`);
                      return;
                    }
                    setFormData({
                      ...formData,
                      variants: [
                        ...(formData.variants || []),
                        emptyVariant({ id: Date.now(), name: "" }),
                      ],
                    });
                  }}
                  disabled={(formData.variants || []).length >= MAX_PRODUCT_VARIANTS}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <HiOutlineSquaresPlus className="h-4 w-4" />
                  <span>ADD MANUAL VARIANT</span>
                </button>
              </div>

              <div className="space-y-3">
                  {(formData.variants || []).map((variant, index) => (
                  <div
                    key={variant.id}
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end group relative">
                    <div className="col-span-12 md:col-span-3 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Variant Name
                      </label>
                      <input
                        value={variant.name}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].name = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="e.g. 1kg Bag"
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Price / MRP
                      </label>
                      <input
                        type="number"
                        value={variant.price}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].price = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="500"
                        className="w-full px-3 py-2 bg-white ring-1 ring-slate-200 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <label className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest ml-1">
                        Sale
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={variant.salePrice}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].salePrice = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="450"
                        className={`w-full px-3 py-2 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 ${
                          variant.salePrice &&
                          (Number(variant.salePrice) < 1 ||
                            (variant.price &&
                              Number(variant.salePrice) > Number(variant.price)))
                            ? "bg-primary/5 ring-1 ring-red-300 text-primary focus:ring-primary/30"
                            : "bg-emerald-50 ring-1 ring-emerald-100 text-emerald-700 focus:ring-emerald-200"
                        }`}
                      />
                      {variant.salePrice && Number(variant.salePrice) < 1 && (
                        <p className="text-[9px] font-semibold text-primary ml-1">Min value is 1</p>
                      )}
                      {variant.salePrice &&
                        variant.price &&
                        Number(variant.salePrice) > Number(variant.price) && (
                          <p className="text-[9px] font-semibold text-primary ml-1">
                            Sale must be ≤ MRP
                          </p>
                        )}
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Stock
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={variant.stock}
                        onChange={(e) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].stock = e.target.value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="10"
                        className={`w-full px-3 py-2 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 ${variant.stock && Number(variant.stock) < 1 ? "bg-primary/5 ring-1 ring-red-300 text-primary focus:ring-primary/30" : "bg-white ring-1 ring-slate-200 focus:ring-primary/10"}`}
                      />
                      {variant.stock && Number(variant.stock) < 1 && (
                        <p className="text-[9px] font-semibold text-primary ml-1">Min value is 1</p>
                      )}
                    </div>
                    <div className="col-span-5 md:col-span-2 space-y-1">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Product Code
                      </label>
                      <input
                        value={variant.sku}
                        readOnly
                        placeholder="AUTO-GENERATED"
                        className="w-full px-3 py-2 bg-slate-100 ring-1 ring-slate-200 border-none rounded-xl text-xs font-mono font-bold text-slate-400 cursor-not-allowed outline-none"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end pb-1">
                      <button
                        onClick={() => {
                          if (formData.variants.length > 1) {
                            const newVariants = formData.variants.filter(
                              (_, i) => i !== index,
                            );
                            setFormData({ ...formData, variants: newVariants });
                          }
                        }}
                        className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                        <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="col-span-12 space-y-2 pt-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest ml-1">
                        Photos <span className="text-rose-500">*</span>{" "}
                        <span className="normal-case tracking-normal text-slate-400">
                          (min {MIN_VARIANT_IMAGES}, max {MAX_VARIANT_IMAGES})
                        </span>
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
                        {Array.from({ length: MAX_VARIANT_IMAGES }).map((_, imageIndex) => {
                          const preview = variant.images?.[imageIndex];
                          return (
                            <div
                              key={`${variant.id}-img-${imageIndex}`}
                              className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-white flex items-center justify-center relative overflow-hidden"
                            >
                              {preview ? (
                                <>
                                  <img src={preview} alt="" className="w-full h-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveVariantImage(index, imageIndex)}
                                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-white/90 text-rose-500 flex items-center justify-center shadow"
                                  >
                                    <HiOutlineTrash className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    onChange={(e) => handleVariantImageUpload(index, e)}
                                  />
                                  <div className="flex flex-col items-center">
                                    <HiOutlinePhoto className="h-5 w-5 text-slate-300" />
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                      Add
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
            </div>
          )}

          {modalTab === "category" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Main Group <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.header}
                    onChange={(e) =>
                      setFormData({ ...formData, header: e.target.value, category: "" })
                    }
                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-bold outline-none cursor-pointer focus:ring-2 focus:ring-primary/5 transition-all">
                    <option value="">Select Main Group</option>
                    {categories.map((h) => (
                      <option key={h._id || h.id} value={h._id || h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest ml-1">
                    Specific Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    disabled={!formData.header}
                    className="w-full px-4 py-2.5 bg-slate-100 border-none rounded-md text-sm font-bold outline-none cursor-pointer focus:ring-2 focus:ring-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    <option value="">Select Category</option>
                    {categories
                      .find((h) => (h._id || h.id) === formData.header)
                      ?.children?.map((c) => (
                        <option key={c._id || c.id} value={c._id || c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step navigation — Back / Continue on every tab */}
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleBackStep}
              disabled={isSaving}
              className="min-w-[120px]"
            >
              <HiOutlineArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              type="button"
              onClick={handleContinueStep}
              disabled={isSaving}
              className="min-w-[160px]"
            >
              {isSaving ? (
                <>
                  <HiOutlineArrowPath className="mr-2 h-5 w-5 animate-spin" />
                  Publishing...
                </>
              ) : isLastTab ? (
                "Save & Publish"
              ) : (
                <>
                  Continue
                  <HiOutlineArrowLeft className="ml-2 h-4 w-4 rotate-180" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddProduct;
