import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { HardHat, ArrowLeft } from "lucide-react";
import contractorApi from "../services/contractorApi";
import { registerWebPushForCurrentModule } from "@/modules/Food/utils/firebaseMessaging";
import {
  setContractorAuth,
  setContractorPendingPhone,
  getContractorPendingPhone,
  hasContractorSession,
  getContractorUser,
} from "../utils/authContractor";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/** Where a contractor belongs based on how far their registration has got. */
export const landingPathForContractor = (contractor) => {
  const status = String(contractor?.status || "").toLowerCase();
  if (status === "approved") return "/contractor/dashboard";
  if (status === "pending_approval") return "/contractor/status";
  return "/contractor/register";
};

export default function ContractorLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState(getContractorPendingPhone() || "");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [devOtp, setDevOtp] = useState("");
  const otpRef = useRef(null);

  useEffect(() => {
    if (hasContractorSession()) {
      navigate(landingPathForContractor(getContractorUser()), { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  const digits = phone.replace(/\D/g, "").slice(-10);

  const sendOtp = async (e) => {
    e?.preventDefault();
    if (digits.length !== 10) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setBusy(true);
    try {
      const result = await contractorApi.requestOtp(digits);
      setContractorPendingPhone(digits);
      // The API returns the OTP outside production so testing does not depend
      // on SMS delivery. It is simply absent in production.
      if (result?.otp) setDevOtp(String(result.otp));
      setStep("otp");
      toast.success("OTP sent to your phone");
    } catch (error) {
      toast.error(errorMessage(error, "Could not send OTP"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (otp.trim().length < 4) {
      toast.error("Enter the OTP you received");
      return;
    }
    setBusy(true);
    try {
      const result = await contractorApi.verifyOtp({ phone: digits, otp: otp.trim() });
      setContractorAuth(result.accessToken, result.contractor, result.refreshToken);
      setContractorPendingPhone("");

      // Register for push now that a contractor token exists. Best-effort: a
      // contractor who declines the browser prompt, or whose browser cannot do
      // push at all, must still get all the way to their dashboard.
      registerWebPushForCurrentModule("/contractor").catch(() => {});

      toast.success(result.needsRegistration ? "Let's finish your registration" : "Welcome back");
      navigate(landingPathForContractor(result.contractor), { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, "Could not verify OTP"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="px-4 pt-5">
        {step === "otp" ? (
          <button
            type="button"
            onClick={() => { setStep("phone"); setOtp(""); }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Change number
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col justify-center px-6 pb-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
              <HardHat className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              Contractor sign in
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              {step === "phone"
                ? "Get genuine construction enquiries, quote for them, and get paid on time."
                : `Enter the 6-digit code sent to ${digits}`}
            </p>
          </div>

          {step === "phone" ? (
            <form onSubmit={sendOtp} className="space-y-3.5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Mobile number
                </span>
                <div className="flex items-center overflow-hidden rounded-xl border border-gray-300 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20">
                  <span className="border-r border-gray-200 bg-gray-50 px-3 py-3 text-sm font-medium text-gray-600">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit number"
                    className="w-full px-3 py-3 text-[15px] outline-none"
                    disabled={busy}
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={busy || digits.length !== 10}
                className="w-full rounded-xl bg-orange-500 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {busy ? "Sending…" : "Send OTP"}
              </button>

              <p className="pt-1 text-center text-xs leading-relaxed text-gray-400">
                We verify every contractor's licences before you receive work.
              </p>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-3.5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Verification code
                </span>
                <input
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="······"
                  className="w-full rounded-xl border border-gray-300 px-3 py-3 text-center text-lg tracking-[0.4em] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  disabled={busy}
                />
              </label>

              {devOtp ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
                  Test mode — your code is <strong>{devOtp}</strong>
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy || otp.length < 4}
                className="w-full rounded-xl bg-orange-500 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {busy ? "Verifying…" : "Verify and continue"}
              </button>

              <button
                type="button"
                onClick={sendOtp}
                disabled={busy}
                className="w-full py-1 text-center text-sm font-medium text-orange-600 hover:text-orange-700 disabled:text-gray-400"
              >
                Resend code
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
