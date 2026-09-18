import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  TaxiPageShell,
  TaxiPageHeader,
  PrimaryButton,
  SectionLabel,
} from "../../components/ui";
import { getTaxiProfilePath } from "../../utils/routes";
import { DELETE_REASONS } from "../../utils/mock/profile";

export default function DeleteAccountPage() {
  const navigate = useNavigate();
  const [reason, setReason] = useState("");

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Delete Account"
        subtitle="This cannot be undone"
        backTo={getTaxiProfilePath()}
      />
      <main className="space-y-5 px-4 py-4">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            <div>
              <h2 className="text-sm font-extrabold text-red-700">
                Warning
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-red-700/90">
                Deleting your account removes ride history, wallet balance, and
                saved addresses. This is a UI placeholder — no account will be
                deleted.
              </p>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel>Why are you leaving?</SectionLabel>
          <div className="space-y-2">
            {DELETE_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm font-semibold shadow-sm ${
                  reason === r
                    ? "border-[#FF6A00] bg-[#FFF4ED] text-gray-900"
                    : "border-gray-100 bg-white text-gray-700"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                    reason === r
                      ? "border-[#FF6A00] bg-[#FF6A00]"
                      : "border-gray-300"
                  }`}
                >
                  {reason === r ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  ) : null}
                </span>
                {r}
              </button>
            ))}
          </div>
        </section>

        <div className="space-y-2.5">
          <PrimaryButton
            variant="danger"
            disabled={!reason}
            onClick={() => {
              toast.message("Delete requested", {
                description: "Placeholder — account was not deleted.",
              });
              navigate(getTaxiProfilePath());
            }}
          >
            Delete Account
          </PrimaryButton>
          <PrimaryButton
            variant="outline"
            onClick={() => navigate(getTaxiProfilePath())}
          >
            Cancel
          </PrimaryButton>
        </div>
      </main>
    </TaxiPageShell>
  );
}
