import DriverJoinRequestsPage from "@/modules/common/admin/pages/DriverJoinRequestsPage";

/**
 * Food delivery join requests — same shared review UI as Taxi/Porter
 * (rejection reason, changed fields on resubmit, timeline, re-approve/reject).
 */
export default function FoodDriverOnboardingRequests() {
  return (
    <DriverJoinRequestsPage
      moduleKey="food"
      title="Food Delivery Join Requests"
      description="Review food module onboarding and resubmissions — see changed fields, then approve or reject again"
    />
  );
}
