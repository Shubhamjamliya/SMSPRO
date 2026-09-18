import { Plus, Minus } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { useCart } from "@food/context/CartContext"
import { isModuleAuthenticated } from "@food/utils/auth"
import { useNavigate, useLocation } from "react-router-dom"
import { toast } from "sonner"
import { navigateToLogin } from "@core/utils/postLoginRedirect"
import {
  getInitialQuantity,
  getMinQuantityLabel,
  getQuantityLimits,
} from "@food/utils/orderQuantity"

export default function AddToCartButton({ item, className = "" }) {
  const { addToCart, isInCart, getCartItem, updateQuantity } = useCart()
  const inCart = isInCart(item.id)
  const cartItem = getCartItem(item.id)
  const navigate = useNavigate()
  const location = useLocation()
  // Limits live on the menu item; fall back to the cart line once it's added.
  const limits = getQuantityLimits(cartItem || item)
  const minQuantityLabel = getMinQuantityLabel(cartItem || item)

  const handleAddToCart = async (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isModuleAuthenticated('user')) {
      toast.error("Please login to add items to cart")
      navigateToLogin(navigate, location)
      return
    }

    // Items with a minimum go into the cart at that minimum, not at 1.
    const result = await addToCart({ ...item, quantity: getInitialQuantity(item) })
    if (result?.ok === false) {
      toast.error(result.error || "Cannot add item to cart")
    } else if (limits.hasMin) {
      toast.info(`Minimum order quantity is ${limits.min} — added ${limits.min}`)
    }
  }

  const handleIncrease = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const current = cartItem?.quantity || 0
    if (current >= limits.max) {
      toast.error(`You can order at most ${limits.max} of this item`)
      return
    }
    const result = await updateQuantity(item.id, current + 1)
    if (result?.ok === false) toast.error(result.error)
  }

  const handleDecrease = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    // At the minimum there is no smaller valid quantity — CartContext turns this
    // into a removal.
    const result = await updateQuantity(item.id, (cartItem?.quantity || 0) - 1)
    if (result?.ok === false) toast.error(result.error)
  }

  if (inCart) {
    return (
      <div className={`flex items-center gap-2 ${className}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <div className="flex items-center gap-1 border border-primary-orange rounded-md">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-6 hover:bg-gray-100"
            onClick={handleDecrease}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="px-1 text-sm font-semibold min-w-[1rem] text-center">
            {cartItem?.quantity || 0}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={(cartItem?.quantity || 0) >= limits.max}
            className="h-8 w-6 hover:bg-gray-100 disabled:opacity-40"
            onClick={handleIncrease}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-end gap-0.5 ${className}`}>
      <Button
        size="sm"
        onClick={handleAddToCart}
        className="bg-primary-orange hover:opacity-90 text-white"
      >
        Add to Cart
      </Button>
      {minQuantityLabel ? (
        <span className="text-[10px] font-semibold text-gray-500">{minQuantityLabel}</span>
      ) : null}
    </div>
  )
}
