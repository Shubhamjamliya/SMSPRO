import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Briefcase, Home, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { userAPI } from "@food/api";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
  PrimaryButton,
  EmptyState,
} from "../../components/ui";
import useTaxiAuthUser from "../../hooks/useTaxiAuthUser";
import { getTaxiProfilePath } from "../../utils/routes";
import { redirectToTaxiLogin } from "../../utils/authUser";
import { buildAddressSelectorNavigation } from "@food/utils/addressSelectorNavigation";

const ICONS = { Home, Office: Briefcase, Work: Briefcase, Other: MapPin };

const formatAddressLine = (addr) => {
  if (!addr) return "";
  return (
    addr.formattedAddress ||
    addr.address ||
    [addr.addressLine1, addr.area, addr.city, addr.pincode]
      .filter(Boolean)
      .join(", ") ||
    "Saved address"
  );
};

export default function SavedAddresses() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, loading, addresses, refreshAddresses } = useTaxiAuthUser();
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!loading && !isLoggedIn) {
      redirectToTaxiLogin(navigate, location);
    }
  }, [loading, isLoggedIn, navigate, location]);

  const remove = async (addr) => {
    const id = addr.id || addr._id;
    if (!id) return;
    setBusyId(String(id));
    try {
      await userAPI.deleteAddress(id);
      await refreshAddresses?.();
      toast.success("Address removed");
    } catch {
      toast.error("Could not delete address");
    } finally {
      setBusyId(null);
    }
  };

  if (!isLoggedIn && !loading) return null;

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Saved Addresses"
        subtitle="Home, work & favourites"
        backTo={getTaxiProfilePath()}
      />
      <main className="space-y-4 px-4 py-4">
        <PrimaryButton
          onClick={() => {
            const target = buildAddressSelectorNavigation({
              module: "taxi",
              from: location.pathname,
              backTo: location.pathname,
              pathname: location.pathname,
            });
            navigate(
              { pathname: target.pathname, search: target.search },
              { state: target.state },
            );
          }}
        >
          <Plus className="h-4 w-4" />
          Add Address
        </PrimaryButton>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl bg-gray-100"
              />
            ))}
          </div>
        ) : addresses.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No saved addresses"
            subtitle="Add Home or Work for faster booking."
          />
        ) : (
          <div className="space-y-2.5">
            <SectionLabel>Your places</SectionLabel>
            {addresses.map((addr) => {
              const tag = addr.label || "Other";
              const Icon = ICONS[tag] || MapPin;
              const id = String(addr.id || addr._id);
              return (
                <div
                  key={id}
                  className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900">{tag}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                        {formatAddressLine(addr)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const target = buildAddressSelectorNavigation({
                          module: "taxi",
                          from: location.pathname,
                          backTo: location.pathname,
                          pathname: location.pathname,
                          extraState: { editAddressId: id },
                        });
                        navigate(
                          { pathname: target.pathname, search: target.search },
                          { state: target.state },
                        );
                      }}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-gray-50 text-[11px] font-bold text-gray-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === id}
                      onClick={() => remove(addr)}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-red-50 text-[11px] font-bold text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </TaxiPageShell>
  );
}
