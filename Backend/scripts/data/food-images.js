/**
 * Curated real food photos (Wikimedia Commons) for Indore seed data.
 * Every URL below has been verified to resolve (HTTP 200) before being added here.
 * Unsplash "photo-<id>" links were previously used but many ids were invalid (404s),
 * which is why menu/category images were showing broken. Wikimedia Commons thumbnails
 * are stable, freely licensed, and don't require guessing opaque photo ids.
 */

export const CATEGORY_IMAGES = {
  Starters: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Assorted_North_INDIAN_Platter.jpg/500px-Assorted_North_INDIAN_Platter.jpg',
  'Main Course': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Vegetarian_Curry.jpeg/500px-Vegetarian_Curry.jpeg',
  'Breads & Rice': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Annapurna_Naan.jpg/500px-Annapurna_Naan.jpg',
  'Snacks & Chaat': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Dahi_puri%2C_Doi_phuchka.jpg/500px-Dahi_puri%2C_Doi_phuchka.jpg',
  'Pizza & Pasta': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Pizza_Margherita_stu_spivack.jpg/500px-Pizza_Margherita_stu_spivack.jpg',
  'South Indian': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Rameshwaram_Cafe_Dosa.jpg/500px-Rameshwaram_Cafe_Dosa.jpg',
  Desserts: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Gulab-jamun-wallpaper-1.jpg/500px-Gulab-jamun-wallpaper-1.jpg',
  Beverages: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Chai_In_Sakora.jpg/500px-Chai_In_Sakora.jpg',
};

const CAPPUCCINO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Cappuccino_in_original.jpg/500px-Cappuccino_in_original.jpg';
const PIZZA_MARGHERITA = CATEGORY_IMAGES['Pizza & Pasta'];
const PIZZA_GENERIC = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Pizza-3007395.jpg/500px-Pizza-3007395.jpg';
const TARI_POHA_INDORE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Tari_Poha_at_Indore%2C_Madhya_Pradesh.jpg/500px-Tari_Poha_at_Indore%2C_Madhya_Pradesh.jpg';
const THALI = CATEGORY_IMAGES['Main Course'];
const BIRYANI_HYDERABADI = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/%22Hyderabadi_Dum_Biryani%22.jpg/500px-%22Hyderabadi_Dum_Biryani%22.jpg';
const MUTTON_BIRYANI = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Mutton_Biryani%2C_Singapore.jpg/500px-Mutton_Biryani%2C_Singapore.jpg';
const BUDDHA_BOWL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/BuddhaBowlLot.jpg/500px-BuddhaBowlLot.jpg';
const AVOCADO_TOAST = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Avocado_toast_at_Voyager_Espresso_%2833134505776%29.jpg/500px-Avocado_toast_at_Voyager_Espresso_%2833134505776%29.jpg';
const CHOW_MEIN = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Homemade_Chow_mein_with_shrimps_and_meat_with_a_choy_and_Choung.jpg/500px-Homemade_Chow_mein_with_shrimps_and_meat_with_a_choy_and_Choung.jpg';
const SHAHI_PANEER = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Shahi_panner.jpg/500px-Shahi_panner.jpg';
const DAL_MAKHANI = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Punjabi_style_Dal_Makhani.jpg/500px-Punjabi_style_Dal_Makhani.jpg';
const BUTTER_CHICKEN = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Butter_Chicken_%26_Butter_Naan_-_Home_-_Chandigarh_-_India_-_0006.jpg/500px-Butter_Chicken_%26_Butter_Naan_-_Home_-_Chandigarh_-_India_-_0006.jpg';
const MASALA_DOSA = CATEGORY_IMAGES['South Indian'];
const IDLI_SAMBAR = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Idli_Sambar.JPG/500px-Idli_Sambar.JPG';
const CHAAT_DAHI_PURI = CATEGORY_IMAGES['Snacks & Chaat'];
const SAMOSA = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Samosas%2C_snack_food_at_Wikipedia%27s_16th_Birthday_celebration_in_Chittagong_%2801%29.jpg/500px-Samosas%2C_snack_food_at_Wikipedia%27s_16th_Birthday_celebration_in_Chittagong_%2801%29.jpg';

export const RESTAURANT_IMAGES = {
  "Vipi's Caffe": {
    profile: CAPPUCCINO,
    cover: [CAPPUCCINO, PIZZA_MARGHERITA],
    menu: [CAPPUCCINO],
  },
  'Sarafa Night Kitchen': {
    profile: CHAAT_DAHI_PURI,
    cover: [CHAAT_DAHI_PURI, TARI_POHA_INDORE],
    menu: [TARI_POHA_INDORE],
  },
  'Rajwada Thali House': {
    profile: THALI,
    cover: [THALI, 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/DalBati.jpg/500px-DalBati.jpg'],
    menu: [THALI],
  },
  'Chappan Dukan Chaat Corner': {
    profile: TARI_POHA_INDORE,
    cover: [TARI_POHA_INDORE, SAMOSA],
    menu: [TARI_POHA_INDORE],
  },
  'Vijay Nagar Pizza Hub': {
    profile: PIZZA_MARGHERITA,
    cover: [PIZZA_MARGHERITA, PIZZA_GENERIC],
    menu: [PIZZA_MARGHERITA],
  },
  'Bhawarkua Biryani Point': {
    profile: BIRYANI_HYDERABADI,
    cover: [BIRYANI_HYDERABADI, MUTTON_BIRYANI],
    menu: [BIRYANI_HYDERABADI],
  },
  'Scheme 54 Healthy Bowls': {
    profile: BUDDHA_BOWL,
    cover: [BUDDHA_BOWL, AVOCADO_TOAST],
    menu: [BUDDHA_BOWL],
  },
  'MG Road Multicuisine': {
    profile: CHOW_MEIN,
    cover: [CHOW_MEIN, SHAHI_PANEER],
    menu: [CHOW_MEIN],
  },
  'Rau Highway Dhaba': {
    profile: DAL_MAKHANI,
    cover: [DAL_MAKHANI, BUTTER_CHICKEN],
    menu: [DAL_MAKHANI],
  },
  'Palasia South Indian Cafe': {
    profile: MASALA_DOSA,
    cover: [MASALA_DOSA, IDLI_SAMBAR],
    menu: [MASALA_DOSA],
  },
};

export const DISH_IMAGES = {
  Cappuccino: CAPPUCCINO,
  'Cold Coffee': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Affogato_al_Caffe.jpg/500px-Affogato_al_Caffe.jpg',
  'Margherita Pizza': PIZZA_MARGHERITA,
  'Penne Alfredo': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/The_Only_Original_Alfredo_Sauce_with_Butter_and_Parmesano-Reggiano_Cheese.png/500px-The_Only_Original_Alfredo_Sauce_with_Butter_and_Parmesano-Reggiano_Cheese.png',
  'Garlic Bread': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Garlicbread.jpg/500px-Garlicbread.jpg',
  'Chocolate Brownie': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Chocolatebrownie.JPG/500px-Chocolatebrownie.JPG',
  'Bhutte ka Kees': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/CookedCornOnTheCob.JPG/500px-CookedCornOnTheCob.JPG',
  'Poha Jalebi Combo': TARI_POHA_INDORE,
  'Garadu Chaat': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Arbi_fry.jpg/500px-Arbi_fry.jpg',
  'Sabudana Khichdi': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Sabudana_Khichdi.jpg/500px-Sabudana_Khichdi.jpg',
  Shikanji: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Shikanji-_served_with_pomegranate%2Cgrated_apple_and_mint.jpg/500px-Shikanji-_served_with_pomegranate%2Cgrated_apple_and_mint.jpg',
  'Rajwada Special Thali': THALI,
  'Dal Baati Churma': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/DalBati.jpg/500px-DalBati.jpg',
  'Paneer Lababdar': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Paneer_Makhani_Veggie.jpeg/500px-Paneer_Makhani_Veggie.jpeg',
  'Butter Naan': CATEGORY_IMAGES['Breads & Rice'],
  'Gulab Jamun': CATEGORY_IMAGES.Desserts,
  'Indori Poha': TARI_POHA_INDORE,
  'Samosa Chaat': SAMOSA,
  'Dahi Vada': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Dahi_bhalla_or_dahi_wada_or_dahi_bada.PNG/500px-Dahi_bhalla_or_dahi_wada_or_dahi_bada.PNG',
  Jalebi: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Jalebi_1.jpg/500px-Jalebi_1.jpg',
  'Masala Chai': CATEGORY_IMAGES.Beverages,
  'Farmhouse Pizza': PIZZA_GENERIC,
  'Chicken Tikka Pizza': PIZZA_GENERIC,
  'Cheese Burst Margherita': PIZZA_MARGHERITA,
  'Garlic Breadsticks': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Garlicbread.jpg/500px-Garlicbread.jpg',
  'Pepsi 750ml': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Pepsi_Bottle.jpg/500px-Pepsi_Bottle.jpg',
  'Chicken Dum Biryani': BIRYANI_HYDERABADI,
  'Mutton Biryani': MUTTON_BIRYANI,
  'Veg Handi Biryani': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Vegetable_Biryani_IMG_001.jpg/500px-Vegetable_Biryani_IMG_001.jpg',
  'Chicken Seekh Kebab': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Pakistani_Food_Beef_Kabobs.jpg/500px-Pakistani_Food_Beef_Kabobs.jpg',
  Phirni: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Firni_Or_Phirni.jpg/500px-Firni_Or_Phirni.jpg',
  'Quinoa Buddha Bowl': BUDDHA_BOWL,
  'Grilled Paneer Salad': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Liat_Portal_for_Foodie_Disorder_-_Israeli_avocado_salad_dinner.jpg/500px-Liat_Portal_for_Foodie_Disorder_-_Israeli_avocado_salad_dinner.jpg',
  'Avocado Toast': AVOCADO_TOAST,
  'Fresh Fruit Bowl': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Fruktsallad_%28Fruit_salad%29.jpg/500px-Fruktsallad_%28Fruit_salad%29.jpg',
  'Green Detox Juice': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Green_smoothie_%288222465502%29.jpg/500px-Green_smoothie_%288222465502%29.jpg',
  'Veg Hakka Noodles': CHOW_MEIN,
  'Chicken Manchurian': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Chicken_Manchurian_%28Hyderabad_Style%29_%2811960049916%29.jpg/500px-Chicken_Manchurian_%28Hyderabad_Style%29_%2811960049916%29.jpg',
  'Paneer Butter Masala': SHAHI_PANEER,
  'Veg Fried Rice': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Koh_Mak%2C_Thailand%2C_Fried_rice_with_seafood%2C_Thai_fried_rice.jpg/500px-Koh_Mak%2C_Thailand%2C_Fried_rice_with_seafood%2C_Thai_fried_rice.jpg',
  'Gobi Manchurian Dry': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Dry_Gobi_Manchurians.JPG/500px-Dry_Gobi_Manchurians.JPG',
  'Dal Makhani Combo': DAL_MAKHANI,
  'Butter Chicken': BUTTER_CHICKEN,
  'Tandoori Roti': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Az_Tandoor_e-citizen.jpg/500px-Az_Tandoor_e-citizen.jpg',
  Lassi: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Salt_lassi.jpg/500px-Salt_lassi.jpg',
  'Chicken Curry Thali': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Indian_Curry_Chicken.jpg/500px-Indian_Curry_Chicken.jpg',
  'Masala Dosa': MASALA_DOSA,
  'Idli Sambar (2 pcs)': IDLI_SAMBAR,
  'Medu Vada': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Medu_Vadas.JPG/500px-Medu_Vadas.JPG',
  'Filter Coffee': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Indian_filter_coffee_in_Dabarah.jpg/500px-Indian_filter_coffee_in_Dabarah.jpg',
  Uttapam: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Mini_Uttappam.jpg/500px-Mini_Uttappam.jpg',
};

export const dishImage = (name) => DISH_IMAGES[name] || CATEGORY_IMAGES['Main Course'];
