import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import serviceProviderApi from "../services/providerApi";
import { clearServiceProviderAuth, setServiceProviderAuth } from "../utils/authServiceProvider";

const COUNTRY = "+91";

const normalizeStatus = (provider) => String(provider?.status || "").toLowerCase();

export default function ServiceProviderLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [debugOtp, setDebugOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);

  const maskedPhone = useMemo(() => {
    if (phone.length < 4) return `${COUNTRY} ${phone}`;
    return `${COUNTRY} ${phone.slice(0, 2)}******${phone.slice(-2)}`;
  }, [phone]);

  const requestOtp = async () => {
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    try {
      const data = await serviceProviderApi.requestOtp(digits);
      setPhone(digits);
      setDebugOtp(data?.otp || "");
      setStep("otp");
      toast.success("OTP sent");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const onOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 3) inputRefs.current[index + 1]?.focus();
  };

  const verifyOtp = async () => {
    const code = otp.join("");
    if (code.length !== 4) {
      toast.error("Enter the 4-digit OTP");
      return;
    }
    setLoading(true);
    try {
      const result = await serviceProviderApi.verifyOtp({ phone, otp: code });

      // Defensive: guarantee no stale session/data survives if a different
      // provider had previously logged in on this same browser.
      clearServiceProviderAuth();
      setServiceProviderAuth(result.accessToken, result.provider, result.refreshToken);

      const status = normalizeStatus(result.provider);
      if (result.needsRegistration || status === "onboarding") {
        navigate("/service-provider/onboarding", {
          state: { phone, resumeStep: result.resumeStep || 1, provider: result.provider || null },
        });
      } else if (status === "pending_approval") {
        navigate("/service-provider/pending");
      } else if (status === "approved") {
        navigate("/service-provider/dashboard");
      } else {
        // Rejected (or any other non-terminal status) — send the freshly-verified
        // provider along so the onboarding form can hydrate without a round trip.
        navigate("/service-provider/onboarding", {
          state: { phone, provider: result.provider || null },
        });
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff4ec,_#f7f7f8_45%)] px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/services"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home Services
        </Link>

        <div className="rounded-3xl border border-orange-100/80 bg-white p-6 shadow-xl shadow-orange-500/5 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6A00]/15 text-[#FF6A00]">
              <Wrench className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-gray-900">Service Provider</h1>
              <p className="text-sm text-gray-500">Login with your mobile number</p>
            </div>
          </div>

          {step === "phone" ? (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-gray-700">Mobile number</label>
              <div className="flex overflow-hidden rounded-2xl border border-gray-200 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/20">
                <span className="bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-600">{COUNTRY}</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="w-full px-3 py-3 text-base outline-none"
                  placeholder="10-digit number"
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={requestOtp}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-bold text-white hover:bg-[#e55f00] disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Continue
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-2xl bg-orange-50 px-3 py-3 text-sm text-orange-800">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Enter the OTP sent to <span className="font-bold">{maskedPhone}</span>
                </p>
              </div>
              {debugOtp ? <p className="text-center text-xs text-gray-400">Dev OTP: {debugOtp}</p> : null}
              <div className="flex justify-between gap-2">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => onOtpChange(index, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !otp[index] && index > 0) {
                        inputRefs.current[index - 1]?.focus();
                      }
                    }}
                    className="h-14 w-14 rounded-2xl border border-gray-200 text-center text-xl font-bold outline-none focus:border-[#FF6A00]"
                  />
                ))}
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={verifyOtp}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-bold text-white hover:bg-[#e55f00] disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Verify & continue
              </button>
              <button
                type="button"
                className="w-full text-sm font-semibold text-gray-500"
                onClick={() => {
                  setStep("phone");
                  setOtp(["", "", "", ""]);
                }}
              >
                Change number
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Looking to book a service instead?{" "}
          <Link to="/services" className="font-semibold text-[#FF6A00]">
            Go to Home Services
          </Link>
        </p>
      </div>
    </div>
  );
}
