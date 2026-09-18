import DriverJoinRequestsPage from "@/modules/common/admin/pages/DriverJoinRequestsPage";

export default function DriverOnboardingRequests() {
  return (
    <DriverJoinRequestsPage
      moduleKey="quick-commerce"
      title="QC Driver Onboarding"
      description="Review drivers who selected Quick Commerce during onboarding. Approve to authorize them for QC delivery."
    />
  );
}
