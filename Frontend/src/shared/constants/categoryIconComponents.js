/**
 * MUI icon components keyed by categoryIcons.js ids.
 * Keep in sync with @shared/constants/categoryIcons so admin + user see the same icons.
 */
import HomeIcon from "@mui/icons-material/Home";
import DevicesIcon from "@mui/icons-material/Devices";
import LocalGroceryStoreIcon from "@mui/icons-material/LocalGroceryStore";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import PetsIcon from "@mui/icons-material/Pets";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SpaIcon from "@mui/icons-material/Spa";
import ToysIcon from "@mui/icons-material/Toys";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import YardIcon from "@mui/icons-material/Yard";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import DiamondIcon from "@mui/icons-material/Diamond";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import BuildIcon from "@mui/icons-material/Build";
import LuggageIcon from "@mui/icons-material/Luggage";
import LocalPharmacyIcon from "@mui/icons-material/LocalPharmacy";
import BakeryDiningIcon from "@mui/icons-material/BakeryDining";
import SetMealIcon from "@mui/icons-material/SetMeal";
import AcUnitIcon from "@mui/icons-material/AcUnit";
import EditIcon from "@mui/icons-material/Edit";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import LiquorIcon from "@mui/icons-material/Liquor";
import LocalDrinkIcon from "@mui/icons-material/LocalDrink";
import FastfoodIcon from "@mui/icons-material/Fastfood";
import EggIcon from "@mui/icons-material/Egg";

export const CATEGORY_ICON_COMPONENTS = {
  electronics: DevicesIcon,
  fashion: CheckroomIcon,
  home: HomeIcon,
  food: LocalCafeIcon,
  sports: SportsSoccerIcon,
  books: MenuBookIcon,
  beauty: SpaIcon,
  toys: ToysIcon,
  automotive: DirectionsCarIcon,
  pets: PetsIcon,
  health: LocalHospitalIcon,
  garden: YardIcon,
  office: BusinessCenterIcon,
  music: MusicNoteIcon,
  jewelry: DiamondIcon,
  baby: ChildCareIcon,
  tools: BuildIcon,
  luggage: LuggageIcon,
  art: ColorLensIcon,
  grocery: LocalGroceryStoreIcon,
  pharmacy: LocalPharmacyIcon,
  bakery: BakeryDiningIcon,
  meat: SetMealIcon,
  frozen: AcUnitIcon,
  gifts: CardGiftcardIcon,
  stationery: EditIcon,
  cleaning: CleaningServicesIcon,
  alcohol: LiquorIcon,
  beverages: LocalDrinkIcon,
  snacks: FastfoodIcon,
  dairy: EggIcon,
};

export const getCategoryIconComponent = (iconId) => {
  if (!iconId) return null;
  return CATEGORY_ICON_COMPONENTS[String(iconId).trim()] || null;
};
