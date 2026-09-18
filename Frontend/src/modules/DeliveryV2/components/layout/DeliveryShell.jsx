import "../../styles/deliveryTheme.css"
import { DeliveryRealtimeGate } from "@/modules/DeliveryV2/context/DeliveryRealtimeContext"

/**
 * Mobile-first shell for all /food/delivery/* routes.
 * On desktop: centered phone-width frame (webview). On mobile: full width.
 * Authenticated sessions mount a portal-wide delivery offer popup + socket.
 */
export default function DeliveryShell({ children }) {
  return (
    <div className="delivery-theme-scope min-h-screen bg-slate-100 lg:bg-slate-200">
      <div className="min-h-screen lg:mx-auto lg:w-full lg:max-w-[430px] lg:min-h-screen lg:overflow-x-hidden lg:border-x lg:border-slate-300 lg:bg-white lg:shadow-2xl lg:relative">
        <DeliveryRealtimeGate>{children}</DeliveryRealtimeGate>
      </div>
    </div>
  )
}
