import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { IndianRupee } from "lucide-react";
import { PageHeader, SectionCard } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import { BIKE_RENT_ADMIN_PAGE_CLASS } from "../utils/adminTheme";

/**
 * Pricing rules were a separate admin screen, but customer quotes use the
 * prices saved on each bike. Keep this route as a clear redirect/help page.
 */
export default function Pricing() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/admin/bike-rent/bikes", { replace: true });
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Rental prices"
        description="Set prices on each bike — that is what customers pay"
      />
      <SectionCard>
        <div className="flex flex-col items-start gap-4 p-2 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[#FF6A00]">
            <IndianRupee size={22} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold text-slate-900">
              Prices are managed on Bike Management
            </p>
            <p className="text-sm text-slate-600">
              When you add or edit a bike, fill hourly, daily, weekly, and deposit there.
              Those values are used for customer booking quotes. A separate pricing-rules
              page is no longer needed.
            </p>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => navigate("/admin/bike-rent/bikes")}
          >
            Go to bikes
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
