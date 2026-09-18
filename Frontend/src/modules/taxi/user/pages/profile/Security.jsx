import { useState } from "react";
import { toast } from "sonner";
import { Fingerprint, KeyRound, MonitorSmartphone, ShieldCheck } from "lucide-react";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
  ListTile,
} from "../../components/ui";
import ToggleRow from "../../components/ui/ToggleRow";
import { getTaxiProfilePath } from "../../utils/routes";
import { SECURITY_DEVICES } from "../../utils/mock/profile";

export default function SecurityPage() {
  const [biometric, setBiometric] = useState(true);
  const [twoFa, setTwoFa] = useState(false);

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Security"
        subtitle="Protect your account"
        backTo={getTaxiProfilePath()}
      />
      <main className="space-y-5 px-4 py-4">
        <section className="space-y-2">
          <ListTile
            icon={KeyRound}
            title="Change Password"
            subtitle="Update your login password"
            onClick={() => toast.message("Change password (placeholder)")}
          />
        </section>

        <section>
          <SectionLabel>Login options</SectionLabel>
          <div className="space-y-2">
            <ToggleRow
              icon={Fingerprint}
              title="Biometric Login"
              subtitle="Use fingerprint or face unlock"
              checked={biometric}
              onChange={setBiometric}
            />
            <ToggleRow
              icon={ShieldCheck}
              title="Two-Factor Authentication"
              subtitle="OTP on every new device"
              checked={twoFa}
              onChange={setTwoFa}
            />
          </div>
        </section>

        <section>
          <SectionLabel>Login devices</SectionLabel>
          <div className="space-y-2">
            {SECURITY_DEVICES.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
                  <MonitorSmartphone className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">{device.name}</p>
                  <p className="text-[11px] text-gray-500">{device.detail}</p>
                </div>
                {!device.current ? (
                  <button
                    type="button"
                    onClick={() => toast.message("Device signed out (placeholder)")}
                    className="text-[11px] font-bold text-red-600"
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-[10px] font-bold uppercase text-emerald-600">
                    Current
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </TaxiPageShell>
  );
}
