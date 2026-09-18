import DriverJoinRequestsPage from "@/modules/common/admin/pages/DriverJoinRequestsPage";

export default function DriverOnboardingRequests() {
  return (
    <DriverJoinRequestsPage
      moduleKey="taxi"
      title="Taxi Driver Onboarding"
      description="Review taxi module onboarding requests only"
    />
  );
}
