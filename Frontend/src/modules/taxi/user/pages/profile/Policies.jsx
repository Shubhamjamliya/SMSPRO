import PolicyPage from "./PolicyPage";
import {
  POLICY_PRIVACY,
  POLICY_REFUND,
  POLICY_TERMS,
} from "../../utils/mock/profile";

export function PrivacyPolicyPage() {
  return <PolicyPage policy={POLICY_PRIVACY} />;
}

export function TermsPage() {
  return <PolicyPage policy={POLICY_TERMS} />;
}

export function RefundPolicyPage() {
  return <PolicyPage policy={POLICY_REFUND} />;
}
