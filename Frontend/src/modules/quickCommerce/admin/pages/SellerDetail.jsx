import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineArrowLeft,
  HiOutlineArrowPath,
  HiOutlineBuildingOffice2,
  HiOutlineCalendarDays,
  HiOutlineCheckBadge,
  HiOutlineDocumentText,
  HiOutlineEnvelope,
  HiOutlineEye,
  HiOutlineMapPin,
  HiOutlinePhone,
} from 'react-icons/hi2';
import { toast } from 'sonner';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../services/adminApi';

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const infoValue = (value, fallback = 'Not provided') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && !value.trim()) return fallback;
  return value;
};

const FieldCard = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
    <p className="mt-1.5 break-words text-sm font-bold text-slate-800">{infoValue(value)}</p>
  </div>
);

const ImageCard = ({ label, src }) => {
  if (!src) return null;
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <div className="group relative aspect-square w-full overflow-hidden rounded-3xl border-2 border-slate-100 bg-slate-50 transition-all hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
        <img
          src={src}
          alt={label}
          className="h-full w-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
        />
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 backdrop-blur-0 transition-all duration-300 group-hover:bg-slate-900/40 group-hover:opacity-100 group-hover:backdrop-blur-sm"
        >
          <div className="rounded-2xl bg-white/20 p-4 text-white backdrop-blur-md">
            <HiOutlineEye className="h-8 w-8" />
          </div>
        </a>
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div>
    <h5 className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-primary">{title}</h5>
    {children}
  </div>
);

const SellerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [seller, setSeller] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSeller = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await adminApi.getSellerById(id);
      const data = response?.data?.result || response?.data?.data || null;
      setSeller(data);
      if (!data) toast.error('Seller not found');
    } catch (error) {
      setSeller(null);
      toast.error(error?.response?.data?.message || 'Failed to load seller details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSeller();
  }, [id]);

  const storeIdentityFields = useMemo(() => {
    if (!seller) return [];
    return [
      ['Owner name', seller.ownerName],
      ['Shop name', seller.shopName],
      ['Email', seller.email],
      ['Phone', seller.phone],
      ['Alternate phone', seller.shopInfo?.alternatePhone],
      ['Support email', seller.shopInfo?.supportEmail],
      [
        'Business type',
        seller.shopInfo?.businessType === 'Pharmacy'
          ? 'Quick Commerce'
          : seller.shopInfo?.businessType || seller.category,
      ],
      ['Service zone', seller.shopInfo?.zoneName || seller.zoneName],
      [
        'Zone type',
        seller.zoneTypeLabel ||
          (seller.zoneType === 'single_vendor'
            ? 'Single Vendor'
            : seller.zoneType === 'multi_vendor'
              ? 'Multi Vendor'
              : 'Not set'),
      ],
      ['Opening hours', seller.shopInfo?.openingHours],
      ['Store address', seller.location],
      ['Latitude', seller.lat],
      ['Longitude', seller.lng],
      ['Admin Hub', seller.isAdminHub ? 'Yes' : 'No'],
    ];
  }, [seller]);

  const bankFields = useMemo(() => {
    if (!seller) return [];
    return [
      ['Bank name', seller.bankInfo?.bankName],
      ['Account holder', seller.bankInfo?.accountHolderName],
      ['Account number', seller.bankInfo?.accountNumber],
      ['IFSC code', seller.bankInfo?.ifscCode],
      ['Account type', seller.bankInfo?.accountType],
      ['UPI ID', seller.bankInfo?.upiId],
    ];
  }, [seller]);

  const complianceFields = useMemo(() => {
    if (!seller) return [];
    const docs = seller.documents || {};
    return [
      ['PAN number', docs.panNumber],
      ['GST registered', docs.gstRegistered],
      ['GST number', docs.gstNumber],
      ['GST legal name', docs.gstLegalName],
      ['FSSAI number', docs.fssaiNumber],
      ['FSSAI expiry', formatDateOnly(docs.fssaiExpiry)],
      ['Shop license no.', docs.shopLicenseNumber],
      ['Shop license expiry', formatDateOnly(docs.shopLicenseExpiry)],
    ];
  }, [seller]);

  const documentImages = useMemo(() => {
    if (!seller) return [];
    const docs = seller.documents || {};
    return [
      { label: 'Shop photo', src: seller.shopInfo?.shopImage },
      { label: 'UPI QR', src: seller.bankInfo?.upiQrImage },
      { label: 'FSSAI image', src: docs.fssaiImage },
      { label: 'Shop license image', src: docs.shopLicenseImage },
    ].filter((item) => item.src);
  }, [seller]);

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-2 duration-700 pb-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/quick-commerce/sellers/active')}
            className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <HiOutlineArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="ds-h1">Seller Profile</h1>
            <p className="ds-description mt-0.5">
              Full onboarding details submitted by this seller.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadSeller}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-white"
        >
          <HiOutlineArrowPath className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <Card className="border-none p-10 text-center shadow-xl ring-1 ring-slate-100">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <HiOutlineArrowPath className="h-10 w-10 animate-spin" />
            <p className="text-sm font-semibold text-slate-500">Loading seller profile...</p>
          </div>
        </Card>
      ) : !seller ? (
        <Card className="border-none p-10 text-center shadow-xl ring-1 ring-slate-100">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <HiOutlineBuildingOffice2 className="h-10 w-10" />
            <p className="text-sm font-semibold text-slate-600">This seller could not be found.</p>
            <button
              type="button"
              onClick={() => navigate('/admin/quick-commerce/sellers/active')}
              className="mt-2 rounded-xl bg-primary px-4 py-2 text-[11px] font-bold text-white"
            >
              Back to active sellers
            </button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <Card className="border-none p-6 shadow-xl ring-1 ring-slate-100">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-slate-100 text-slate-500 ring-4 ring-white shadow-lg">
                    {seller.shopInfo?.shopImage ? (
                      <img
                        src={seller.shopInfo.shopImage}
                        alt={seller.shopName || 'Store'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <HiOutlineBuildingOffice2 className="h-8 w-8" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-black text-slate-900">
                        {seller.shopName || 'Unnamed store'}
                      </h2>
                      <Badge variant="success" className="text-[10px] font-bold uppercase">
                        {seller.approvalStatus || seller.status || 'approved'}
                      </Badge>
                      {seller.isAdminHub ? (
                        <Badge variant="warning" className="text-[10px] font-bold uppercase">
                          Admin Hub
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Owner: {infoValue(seller.ownerName)}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      {infoValue(seller.location, 'Store address not added yet')}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                    Approved on
                  </p>
                  <p className="mt-1 text-sm font-bold text-emerald-900">
                    {formatDate(seller.approvedAt || seller.applicationDate)}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-none p-6 shadow-xl ring-1 ring-slate-100">
              <div className="mb-6 flex items-center gap-2">
                <HiOutlineDocumentText className="h-5 w-5 text-slate-500" />
                <h3 className="text-lg font-black text-slate-900">Onboarding profile</h3>
              </div>

              <div className="space-y-8">
                <Section title="Store identity">
                  <div className="grid gap-3 md:grid-cols-2">
                    {storeIdentityFields.map(([label, value]) => (
                      <FieldCard key={label} label={label} value={value} />
                    ))}
                  </div>
                </Section>

                <Section title="Banking & UPI">
                  <div className="grid gap-3 md:grid-cols-2">
                    {bankFields.map(([label, value]) => (
                      <FieldCard key={label} label={label} value={value} />
                    ))}
                  </div>
                </Section>

                <Section title="Compliance & licenses">
                  <div className="grid gap-3 md:grid-cols-2">
                    {complianceFields.map(([label, value]) => (
                      <FieldCard key={label} label={label} value={value} />
                    ))}
                  </div>
                </Section>

                {documentImages.length > 0 && (
                  <Section title="Uploaded documents">
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      {documentImages.map((item) => (
                        <ImageCard key={item.label} label={item.label} src={item.src} />
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-none p-6 shadow-xl ring-1 ring-slate-100">
              <h3 className="text-lg font-black text-slate-900">Contact</h3>
              <div className="mt-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
                    <HiOutlineEnvelope className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="ds-label">Email</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{infoValue(seller.email)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
                    <HiOutlinePhone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="ds-label">Phone</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{infoValue(seller.phone)}</p>
                    {seller.shopInfo?.alternatePhone ? (
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Alt: {seller.shopInfo.alternatePhone}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
                    <HiOutlineMapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="ds-label">Store address</p>
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-900">
                      {infoValue(seller.location, 'Location not added')}
                    </p>
                    {(seller.lat || seller.lng) && (
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {seller.lat}, {seller.lng}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border-none p-6 shadow-xl ring-1 ring-slate-100">
              <h3 className="text-lg font-black text-slate-900">Approval summary</h3>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                  <div className="flex items-center gap-2">
                    <HiOutlineCheckBadge className="h-5 w-5 text-emerald-700" />
                    <p className="text-sm font-black text-emerald-900">
                      Status: {seller.approvalStatus || 'approved'}
                    </p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-emerald-800">
                    This store can access the quick seller dashboard.
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                  <div className="flex items-start gap-3">
                    <HiOutlineCalendarDays className="mt-0.5 h-5 w-5 text-slate-500" />
                    <div>
                      <p className="ds-label">Application date</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {formatDate(seller.applicationDate)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                  <p className="ds-label">Admin notes</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
                    {infoValue(seller.approvalNotes, 'No approval notes added.')}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerDetail;
