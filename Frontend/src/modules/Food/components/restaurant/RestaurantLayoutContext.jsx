import { createContext, useContext } from "react"

export const RestaurantLayoutContext = createContext(false)

export const useRestaurantLayout = () => useContext(RestaurantLayoutContext)
