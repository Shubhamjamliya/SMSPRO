import { Leaf, ExternalLink } from "lucide-react"
import { useCompanyName } from "@food/hooks/useCompanyName"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

export default function Hyperpure() {
  const companyName = useCompanyName()
  return (
    <RestaurantPageShell
      title="Hyperpure"
      subtitle="Fresh ingredients sourcing"
      maxWidth="lg"
      contentClassName="py-16 flex flex-col items-center text-center"
    >
        <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 rounded-3xl flex items-center justify-center mb-5">
          <Leaf className="w-10 h-10 text-green-500 dark:text-green-400" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Coming Soon</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
          Hyperpure sourcing integration is under development. Order fresh, high-quality ingredients directly through {companyName}.
        </p>
        <div className="mt-6 flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
          <ExternalLink className="w-3.5 h-3.5" />
          Integration coming soon
        </div>
    </RestaurantPageShell>
  )
}
