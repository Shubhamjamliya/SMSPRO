import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ChevronRight,
  Save,
  Loader2,
  Image as ImageIcon,
  Upload,
  X,
  ArrowLeft
} from 'lucide-react';
import { toast } from "sonner";
import { adminAPI } from "@/services/api";
import { setCachedSettings } from "@/modules/common/utils/businessSettings";
import { cn } from "@/lib/utils";
import { compressImage } from "@/shared/utils/imageCompression";

const SectionCard = ({ title, children, id, className = '' }) => (
  <div className={cn("bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-8", className)} id={id}>
    {title && (
      <div className="px-8 py-4 border-b border-gray-100 bg-gray-50/30">
        <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">{title}</h3>
      </div>
    )}
    <div className="p-8">
      {children}
    </div>
  </div>
);

const InputField = ({ label, name, value, onChange, placeholder, info, maxLength }) => {
  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors shadow-sm";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";

  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          type="text"
          name={name}
          value={value || ''}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={cn(inputClass, name === 'themeColor' && "pl-10")}
        />
        {name === 'themeColor' && (
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-gray-200 shadow-sm"
            style={{ backgroundColor: value || '#0a0a0a' }}
          />
        )}
      </div>
      {info && (
        <div className="mt-2 bg-[#FFF8F0] border border-red-100 rounded-lg px-4 py-2 flex items-center gap-2">
          <span className="text-[11px] text-gray-500 italic">Example: {info.prefix}</span>
          <span className="text-[11px] bg-[#00BFA5] text-white px-2 py-0.5 rounded font-bold">{value || info.default}</span>
        </div>
      )}
    </div>
  );
};

const ImageUploadBox = ({ title, size, preview, onUpload, onClear, compact = false }) => {
  const fileInputRef = useRef(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <label className="text-xs font-bold text-gray-500">{title}({size})</label>
      </div>
      <div className={cn(
        "w-full rounded-xl border border-dashed border-gray-300 bg-gray-50/50 relative overflow-hidden group hover:border-indigo-300 transition-colors cursor-pointer flex items-center justify-center",
        compact ? "aspect-[2.4/1]" : "aspect-[2/1]"
      )} onClick={() => fileInputRef.current?.click()}>
        {preview ? (
          <img src={preview} alt={title} className={cn("w-full h-full object-contain", compact ? "p-4" : "p-6")} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
            <p className="text-[11px] font-bold uppercase tracking-widest">Upload Image</p>
            <Upload size={24} strokeWidth={1.5} />
          </div>
        )}

        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="w-8 h-8 rounded-lg bg-[#E6F8F6] text-[#00BFA5] shadow-sm border border-[#C2EFE9] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Upload size={14} />
          </button>
          {preview && (
            <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="w-8 h-8 rounded-lg bg-[#FFF1F1] text-[#FF4D4D] shadow-sm border border-[#FEDADA] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X size={14} />
            </button>
          )}
        </div>
        <input type="file" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files[0]) onUpload(e.target.files[0]); }} />
      </div>
    </div>
  );
};

const GlobalApplicationSettings = ({ logoOnly = false }) => {
  const location = useLocation();
  const isLogoPage = logoOnly || location.pathname.endsWith('/global-settings/logo');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Logos & Favicons state
  const [adminLogoPreview, setAdminLogoPreview] = useState(null);
  const [adminLogoFile, setAdminLogoFile] = useState(null);
  const [adminFaviconPreview, setAdminFaviconPreview] = useState(null);
  const [adminFaviconFile, setAdminFaviconFile] = useState(null);

  const [userLogoPreview, setUserLogoPreview] = useState(null);
  const [userLogoFile, setUserLogoFile] = useState(null);
  const [userFaviconPreview, setUserFaviconPreview] = useState(null);
  const [userFaviconFile, setUserFaviconFile] = useState(null);

  const [deliveryLogoPreview, setDeliveryLogoPreview] = useState(null);
  const [deliveryLogoFile, setDeliveryLogoFile] = useState(null);
  const [deliveryFaviconPreview, setDeliveryFaviconPreview] = useState(null);
  const [deliveryFaviconFile, setDeliveryFaviconFile] = useState(null);

  const [restaurantLogoPreview, setRestaurantLogoPreview] = useState(null);
  const [restaurantLogoFile, setRestaurantLogoFile] = useState(null);
  const [restaurantFaviconPreview, setRestaurantFaviconPreview] = useState(null);
  const [restaurantFaviconFile, setRestaurantFaviconFile] = useState(null);

  const [sellerLogoPreview, setSellerLogoPreview] = useState(null);
  const [sellerLogoFile, setSellerLogoFile] = useState(null);
  const [sellerFaviconPreview, setSellerFaviconPreview] = useState(null);
  const [sellerFaviconFile, setSellerFaviconFile] = useState(null);

  const [sellerLoginBannerPreview, setSellerLoginBannerPreview] = useState(null);
  const [sellerLoginBannerFile, setSellerLoginBannerFile] = useState(null);
  const [sellerLoginBannerActive, setSellerLoginBannerActive] = useState(true);

  const [restaurantLoginBannerPreview, setRestaurantLoginBannerPreview] = useState(null);
  const [restaurantLoginBannerFile, setRestaurantLoginBannerFile] = useState(null);
  const [restaurantLoginBannerActive, setRestaurantLoginBannerActive] = useState(true);

  const [formData, setFormData] = useState({
    companyName: "",
    themeColor: "#0a0a0a",
    email: "",
    phoneNumber: "",
    address: "",
    minWalletToReceiveOrders: "0",
  });

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getBusinessSettings();
      const settings = response?.data?.data || response?.data;

      if (settings) {
        setFormData({
          companyName: settings.companyName || "",
          themeColor: settings.themeColor || "#0a0a0a",
          email: settings.email || "",
          phoneNumber: settings.phone?.number || "",
          address: settings.address || "",
          minWalletToReceiveOrders:
            settings.minWalletToReceiveOrders !== undefined &&
            settings.minWalletToReceiveOrders !== null
              ? String(settings.minWalletToReceiveOrders)
              : "0",
        });

        if (settings.adminLogo?.url) setAdminLogoPreview(settings.adminLogo.url);
        if (settings.adminFavicon?.url) setAdminFaviconPreview(settings.adminFavicon.url);

        if (settings.userLogo?.url) setUserLogoPreview(settings.userLogo.url);
        if (settings.userFavicon?.url) setUserFaviconPreview(settings.userFavicon.url);

        if (settings.deliveryLogo?.url) setDeliveryLogoPreview(settings.deliveryLogo.url);
        if (settings.deliveryFavicon?.url) setDeliveryFaviconPreview(settings.deliveryFavicon.url);

        if (settings.restaurantLogo?.url) setRestaurantLogoPreview(settings.restaurantLogo.url);
        if (settings.restaurantFavicon?.url) setRestaurantFaviconPreview(settings.restaurantFavicon.url);

        if (settings.sellerLogo?.url) setSellerLogoPreview(settings.sellerLogo.url);
        if (settings.sellerFavicon?.url) setSellerFaviconPreview(settings.sellerFavicon.url);

        if (settings.sellerLoginBanner?.url) setSellerLoginBannerPreview(settings.sellerLoginBanner.url);
        setSellerLoginBannerActive(settings.sellerLoginBanner?.active !== false);

        if (settings.restaurantLoginBanner?.url) setRestaurantLoginBannerPreview(settings.restaurantLoginBanner.url);
        setRestaurantLoginBannerActive(settings.restaurantLoginBanner?.active !== false);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleUpdate = async () => {
    try {
      if (!formData.companyName?.trim() || formData.companyName.trim().length < 2 || formData.companyName.trim().length > 20) {
        toast.error("Application name must be between 2 and 20 characters");
        return;
      }
      if (!formData.email?.trim() || formData.email.trim().length < 5 || formData.email.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        toast.error("A valid Support Email is required (5-255 characters)");
        return;
      }
      if (!formData.phoneNumber?.trim() || !/^\d{10,15}$/.test(formData.phoneNumber.replace(/\D/g, ''))) {
        toast.error("A valid Support Phone is required (10-15 digits)");
        return;
      }
      if (!formData.address?.trim() || formData.address.trim().length < 5 || formData.address.trim().length > 500) {
        toast.error("Office Address must be between 5 and 500 characters");
        return;
      }
      const minWalletValue = Number(formData.minWalletToReceiveOrders);
      if (!Number.isFinite(minWalletValue) || minWalletValue < 0) {
        toast.error("Minimum wallet balance must be a number (>= 0)");
        return;
      }
      
      setSaving(true);
      const dataToSend = {
        companyName: formData.companyName.trim(),
        themeColor: formData.themeColor,
        email: formData.email.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        address: formData.address.trim(),
        sellerLoginBannerUrl: sellerLoginBannerPreview ? undefined : "",
        sellerLoginBannerActive: sellerLoginBannerActive,
        restaurantLoginBannerUrl: restaurantLoginBannerPreview ? undefined : "",
        restaurantLoginBannerActive: restaurantLoginBannerActive,
        minWalletToReceiveOrders: minWalletValue,
      };

      const files = {};

      if (adminLogoFile) files.adminLogo = adminLogoFile;
      if (adminFaviconFile) files.adminFavicon = adminFaviconFile;

      if (userLogoFile) files.userLogo = userLogoFile;
      if (userFaviconFile) files.userFavicon = userFaviconFile;

      if (deliveryLogoFile) files.deliveryLogo = deliveryLogoFile;
      if (deliveryFaviconFile) files.deliveryFavicon = deliveryFaviconFile;

      if (restaurantLogoFile) files.restaurantLogo = restaurantLogoFile;
      if (restaurantFaviconFile) files.restaurantFavicon = restaurantFaviconFile;

      if (sellerLogoFile) files.sellerLogo = sellerLogoFile;
      if (sellerFaviconFile) files.sellerFavicon = sellerFaviconFile;

      if (sellerLoginBannerFile) files.sellerLoginBanner = sellerLoginBannerFile;
      if (restaurantLoginBannerFile) files.restaurantLoginBanner = restaurantLoginBannerFile;

      const response = await adminAPI.updateBusinessSettings(dataToSend, files);
      const updatedSettings = response?.data?.data || response?.data;

      if (updatedSettings) {
        setCachedSettings(updatedSettings);
      }
      toast.success('Configuration saved successfully!');
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (file, setFile, setPreview) => {
    const compressed = await compressImage(file);
    setFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result || ''));
    reader.readAsDataURL(compressed);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn(
      "min-h-screen font-sans",
      isLogoPage ? "bg-[#f6f8fc] p-4 sm:p-6 lg:p-10" : "bg-gray-50 p-6 lg:p-10"
    )}>

      {/* Header */}
      <div className={cn("mb-10 flex items-center justify-between", isLogoPage && "mb-7") }>
        <div>
          <h1 className="text-[15px] font-black text-gray-800 uppercase tracking-widest">
            {isLogoPage ? 'LOGO SETTINGS' : 'GLOBAL SETTINGS'}
          </h1>
          {isLogoPage && (
            <p className="mt-2 max-w-xl text-sm text-gray-500">
              Manage the brand identity used across the admin, customer, delivery, restaurant, and seller portals.
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
          <span>Common</span>
          <ChevronRight size={12} strokeWidth={3} />
          <span className="text-gray-600">{isLogoPage ? 'Logo' : 'Global Settings'}</span>
        </div>
      </div>

      <div className={cn("max-w-[1600px] mx-auto space-y-10 pb-32", isLogoPage && "space-y-6")}>

        {isLogoPage && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-white px-5 py-4 shadow-sm sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                <ImageIcon size={19} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">Portal brand assets</p>
                <p className="mt-0.5 text-xs text-gray-500">Upload clear PNG, JPG, or WebP files for the best result.</p>
              </div>
            </div>
            <span className="hidden rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 shadow-sm sm:inline-flex">
              5 portals
            </span>
          </div>
        )}

        {!isLogoPage && (<>
        {/* Basic Identification */}
        <SectionCard title="Application Identification">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            <InputField label="App Name" name="companyName" value={formData.companyName} onChange={handleChange} placeholder="DukaanWallah" maxLength={20} />
            <InputField label="Admin Theme Color" name="themeColor" value={formData.themeColor} onChange={handleChange} placeholder="#0a0a0a" maxLength={7} />
            <InputField label="Support Email" name="email" value={formData.email} onChange={handleChange} placeholder="[EMAIL_ADDRESS]" maxLength={255} />
            <InputField label="Support Phone" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} placeholder="0000000000" maxLength={15} />
            <InputField label="Office Address" name="address" value={formData.address} onChange={handleChange} placeholder="Main Street, NY" maxLength={500} />
          </div>
        </SectionCard>

        <SectionCard title="Delivery Partner Wallet" id="driver-min-wallet">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Minimum wallet balance to receive orders
              </label>
              <input
                type="number"
                min="0"
                step="1"
                name="minWalletToReceiveOrders"
                value={formData.minWalletToReceiveOrders}
                onChange={(e) => handleChange("minWalletToReceiveOrders", e.target.value)}
                placeholder="e.g. 500"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors shadow-sm"
              />
              <p className="text-[12px] text-gray-500 leading-relaxed">
                Every delivery partner must keep this amount in their pocket wallet.
                If the balance is lower, they will not receive food, taxi, or porter jobs.
                Set <strong>0</strong> to turn this off. New drivers can deposit this amount to start taking orders.
              </p>
            </div>
          </div>
        </SectionCard>
        </>)}

        {isLogoPage && <>
        {/* Logo and favicon management */}
        <SectionCard title="Admin Application" className={isLogoPage ? "logo-section-card mb-0" : ''}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <ImageUploadBox compact={isLogoPage} title="Admin Logo" size="200px x 50px" preview={adminLogoPreview} onUpload={(file) => handleFileUpload(file, setAdminLogoFile, setAdminLogoPreview)} onClear={() => { setAdminLogoPreview(null); setAdminLogoFile(null); }} />
            <ImageUploadBox compact={isLogoPage} title="Admin Favicon" size="80px x 80px" preview={adminFaviconPreview} onUpload={(file) => handleFileUpload(file, setAdminFaviconFile, setAdminFaviconPreview)} onClear={() => { setAdminFaviconPreview(null); setAdminFaviconFile(null); }} />
          </div>
        </SectionCard>

        <SectionCard title="User Application" className={isLogoPage ? "logo-section-card mb-0" : ''}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <ImageUploadBox compact={isLogoPage} title="User Logo" size="200px x 50px" preview={userLogoPreview} onUpload={(file) => handleFileUpload(file, setUserLogoFile, setUserLogoPreview)} onClear={() => { setUserLogoPreview(null); setUserLogoFile(null); }} />
            <ImageUploadBox compact={isLogoPage} title="User Favicon" size="80px x 80px" preview={userFaviconPreview} onUpload={(file) => handleFileUpload(file, setUserFaviconFile, setUserFaviconPreview)} onClear={() => { setUserFaviconPreview(null); setUserFaviconFile(null); }} />
          </div>
        </SectionCard>

        <SectionCard title="Delivery Application" className={isLogoPage ? "logo-section-card mb-0" : ''}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <ImageUploadBox compact={isLogoPage} title="Delivery Logo" size="200px x 50px" preview={deliveryLogoPreview} onUpload={(file) => handleFileUpload(file, setDeliveryLogoFile, setDeliveryLogoPreview)} onClear={() => { setDeliveryLogoPreview(null); setDeliveryLogoFile(null); }} />
            <ImageUploadBox compact={isLogoPage} title="Delivery Favicon" size="80px x 80px" preview={deliveryFaviconPreview} onUpload={(file) => handleFileUpload(file, setDeliveryFaviconFile, setDeliveryFaviconPreview)} onClear={() => { setDeliveryFaviconPreview(null); setDeliveryFaviconFile(null); }} />
          </div>
        </SectionCard>

        <SectionCard title="Restaurant Application" className={isLogoPage ? "logo-section-card mb-0" : ''}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <ImageUploadBox compact={isLogoPage} title="Restaurant Logo" size="200px x 50px" preview={restaurantLogoPreview} onUpload={(file) => handleFileUpload(file, setRestaurantLogoFile, setRestaurantLogoPreview)} onClear={() => { setRestaurantLogoPreview(null); setRestaurantLogoFile(null); }} />
            <ImageUploadBox compact={isLogoPage} title="Restaurant Favicon" size="80px x 80px" preview={restaurantFaviconPreview} onUpload={(file) => handleFileUpload(file, setRestaurantFaviconFile, setRestaurantFaviconPreview)} onClear={() => { setRestaurantFaviconPreview(null); setRestaurantFaviconFile(null); }} />
          </div>
        </SectionCard>

        <SectionCard title="Seller Application" className={isLogoPage ? "logo-section-card mb-0" : ''}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <ImageUploadBox compact={isLogoPage} title="Seller Logo" size="200px x 50px" preview={sellerLogoPreview} onUpload={(file) => handleFileUpload(file, setSellerLogoFile, setSellerLogoPreview)} onClear={() => { setSellerLogoPreview(null); setSellerLogoFile(null); }} />
            <ImageUploadBox compact={isLogoPage} title="Seller Favicon" size="80px x 80px" preview={sellerFaviconPreview} onUpload={(file) => handleFileUpload(file, setSellerFaviconFile, setSellerFaviconPreview)} onClear={() => { setSellerFaviconPreview(null); setSellerFaviconFile(null); }} />
          </div>
        </SectionCard>
        </>}

        {!isLogoPage && <SectionCard title="Portal Login Banners">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-4">
              <ImageUploadBox 
                title="Seller Login Banner" 
                size="1920px x 1080px (Landscape)" 
                preview={sellerLoginBannerPreview} 
                onUpload={(file) => handleFileUpload(file, setSellerLoginBannerFile, setSellerLoginBannerPreview)} 
                onClear={() => { setSellerLoginBannerPreview(null); setSellerLoginBannerFile(null); }} 
              />
              <div className="flex items-center gap-3 mt-4">
                <input 
                  type="checkbox" 
                  id="sellerLoginBannerActive" 
                  checked={sellerLoginBannerActive}
                  onChange={(e) => setSellerLoginBannerActive(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-200 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="sellerLoginBannerActive" className="text-xs font-semibold text-gray-700 cursor-pointer select-none">
                  Activate Seller Login Banner
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <ImageUploadBox 
                title="Restaurant Login Banner" 
                size="1920px x 1080px (Landscape)" 
                preview={restaurantLoginBannerPreview} 
                onUpload={(file) => handleFileUpload(file, setRestaurantLoginBannerFile, setRestaurantLoginBannerPreview)} 
                onClear={() => { setRestaurantLoginBannerPreview(null); setRestaurantLoginBannerFile(null); }} 
              />
              <div className="flex items-center gap-3 mt-4">
                <input 
                  type="checkbox" 
                  id="restaurantLoginBannerActive" 
                  checked={restaurantLoginBannerActive}
                  onChange={(e) => setRestaurantLoginBannerActive(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-200 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="restaurantLoginBannerActive" className="text-xs font-semibold text-gray-700 cursor-pointer select-none">
                  Activate Restaurant Login Banner
                </label>
              </div>
            </div>
          </div>
        </SectionCard>}

      </div>

      {/* Persistence Controls */}
      <div className="fixed bottom-10 right-10">
        <button onClick={handleUpdate} disabled={saving} className="bg-[#00BFA5] text-white w-16 h-16 rounded-full flex items-center justify-center shadow-[0_15px_40px_rgba(0,191,165,0.4)] hover:bg-[#00AC95] active:scale-90 transition-all disabled:opacity-50">
          {saving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
        </button>
      </div>

    </div>
  );
};

export default GlobalApplicationSettings;
