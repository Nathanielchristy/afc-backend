const fs = require("fs");
const path = require("path");

const frontendDir = path.resolve(__dirname, "../../../Ecom V1");

if (!fs.existsSync(frontendDir)) {
    console.error("Frontend directory not found at:", frontendDir);
    process.exit(1);
}

console.log("Found frontend directory at:", frontendDir);

// 1. Update src/types.ts
const typesPath = path.join(frontendDir, "src/types.ts");
const typesContent = `export type Category =
  | 'campus-menu'
  | 'mojito'
  | 'pizza'
  | 'wraps-sides'
  | 'campus-gang-feast'
  | 'salad'
  | 'grilled-chicken'
  | 'burgers-combos'
  | 'combo-addon'
  | 'bucket-meal'
  | 'addons'
  | 'snacks'
  | 'fried-rice'
  | 'noodles'
  | 'ice-creams'
  // Legacy aliases
  | 'buckets'
  | 'chicken'
  | 'burgers'
  | 'wings'
  | 'sides'
  | 'drinks'
  | 'desserts';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  image: string;
  category: Category | string;
  includes?: string[];
  ingredients?: string[];
  sizes?: Record<string, number> | string[];
  pizza_choices?: string[];
  minimum_order?: number;
  note?: string;
  featured?: boolean;
  popular?: boolean;
  spicy?: boolean;
  isVeg?: boolean;
  calories?: number;
  serves?: string;
  badge?: string;
}

export interface MenuCategory {
  name: string;
  items: Array<{
    name?: string;
    price?: number;
    includes?: string[];
    ingredients?: string[];
    sizes?: Record<string, number> | string[];
    pizza_choices?: string[];
    minimum_order?: number;
    note?: string;
  }>;
  extra_toppings?: Array<{ name: string; price: number }>;
  meal_addons?: Array<{ price: number; includes: string[] }>;
}

export interface RestaurantMenuData {
  restaurant: string;
  currency: 'INR' | string;
  categories: MenuCategory[];
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  specialInstructions?: string;
}

export interface OrderSummary {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  email?: string;
  address: string;
  landmark?: string;
  city: string;
  postalCode: string;
  orderType: 'delivery' | 'takeaway' | 'dine-in';
  paymentMethod: 'upi' | 'card' | 'cod';
  specialInstructions?: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  customer: CustomerInfo;
  summary: OrderSummary;
  status: 'pending' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered';
  createdAt: Date;
}

export interface CategoryOption {
  id: Category;
  label: string;
  iconName: string;
  emoji: string;
  description: string;
}

export const CATEGORIES: CategoryOption[] = [
  { id: 'campus-menu', label: 'Campus Menu', iconName: 'GraduationCap', emoji: '🎓', description: 'Student combos & meal boxes' },
  { id: 'mojito', label: 'Mojitos', iconName: 'Wine', emoji: '🍹', description: 'Refreshing iced mint coolers' },
  { id: 'pizza', label: 'Pizzas', iconName: 'Pizza', emoji: '🍕', description: 'Freshly baked handcrafted pizzas' },
  { id: 'wraps-sides', label: 'Wraps & Sides', iconName: 'Sandwich', emoji: '🌯', description: 'Shawarmas, wraps & hot fries' },
  { id: 'campus-gang-feast', label: 'Gang Feast', iconName: 'Users', emoji: '🎉', description: '24-person mega squad banquet' },
  { id: 'salad', label: 'Salads', iconName: 'Salad', emoji: '🥗', description: 'Crisp, fresh & hearty salads' },
  { id: 'grilled-chicken', label: 'Grilled Chicken', iconName: 'Flame', emoji: '🍗', description: 'Char-grilled succulent chicken' },
  { id: 'burgers-combos', label: 'Burgers & Combos', iconName: 'UtensilsCrossed', emoji: '🍔', description: 'Juicy burgers & meal combos' },
  { id: 'combo-addon', label: 'Combo Add-Ons', iconName: 'PlusCircle', emoji: '🍟', description: 'Value fries, drinks & bun packs' },
  { id: 'bucket-meal', label: 'Bucket Meals', iconName: 'Package', emoji: '🪣', description: 'Family & group sharing buckets' },
  { id: 'addons', label: 'Add-Ons', iconName: 'Plus', emoji: '➕', description: 'Buns, dips, sauces & upgrades' },
  { id: 'snacks', label: 'Snacks & Bites', iconName: 'Cookie', emoji: '🥟', description: 'Crispy finger foods & hot momos' },
  { id: 'fried-rice', label: 'Fried Rice', iconName: 'Soup', emoji: '🍚', description: 'Wok-tossed seasoned fried rice' },
  { id: 'noodles', label: 'Noodles', iconName: 'Utensils', emoji: '🍜', description: 'Savory stir-fried noodles' },
  { id: 'ice-creams', label: 'Ice Creams', iconName: 'IceCream', emoji: '🍨', description: 'Chilled creamy dessert scoops' },
];
`;

fs.writeFileSync(typesPath, typesContent, "utf8");
console.log("[1/5] Updated src/types.ts successfully");

// 2. Generate and write src/menuData.ts
const menuJsonPath = path.resolve(__dirname, "../data/restaurantMenu.json");
const rawMenu = JSON.parse(fs.readFileSync(menuJsonPath, "utf8"));

const menuDataTsPath = path.join(frontendDir, "src/menuData.ts");

const IMAGES = {
    campus: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80",
    mojito: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80",
    pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80",
    wraps: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=600&auto=format&fit=crop&q=80",
    feast: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80",
    salad: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80",
    grilled: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&auto=format&fit=crop&q=80",
    burger: "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80",
    comboAddon: "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80",
    bucket: "https://images.unsplash.com/photo-1513639776629-7b61b0ac49cb?w=600&auto=format&fit=crop&q=80",
    addon: "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=600&auto=format&fit=crop&q=80",
    snacks: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80",
    rice: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80",
    noodles: "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80",
    icecream: "https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=600&auto=format&fit=crop&q=80"
};

const pizzaImages = {
    "Tandoori Veg": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80",
    "Margherita": "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop&q=80",
    "BBQ Chicken": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80",
    "Neapolitan": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop&q=80",
    "Crispy Chicken": "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=600&auto=format&fit=crop&q=80",
    "Farm Topping": "https://images.unsplash.com/photo-1588315029754-2dd089d39a1a?w=600&auto=format&fit=crop&q=80",
    "Tandoori Chicken": "https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=600&auto=format&fit=crop&q=80"
};

const burgerImages = {
    "Spicy Crispy Burger Combo": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80",
    "Crispy Double Burger Combo": "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80",
    "Veg Burger Combo": "https://images.unsplash.com/photo-1525059696034-4967a8e1dca2?w=600&auto=format&fit=crop&q=80",
    "Veg Double Burger Combo": "https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80",
    "Crispy Beef Burger Combo": "https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80",
    "Chicken Cheese Burger Combo": "https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=600&auto=format&fit=crop&q=80",
    "Kids Burger": "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=600&auto=format&fit=crop&q=80",
    "Kids Pop Burger": "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=600&auto=format&fit=crop&q=80",
    "AFC Crispy Burger Combo": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80",
    "Chilli Chicken Burger Combo": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80",
    "Chicken Momos Burger Combo": "https://images.unsplash.com/photo-1626803775151-61d756612f97?w=600&auto=format&fit=crop&q=80",
    "Chicken Strip Meal": "https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80",
    "AFC Prawns (Crispy Golden)": "https://images.unsplash.com/photo-1565680314946-a33f383e20e8?w=600&auto=format&fit=crop&q=80",
    "Strips (6 PC)": "https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80"
};

const iceCreamImages = {
    "Alphonso Mango": "https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=600&auto=format&fit=crop&q=80",
    "Strawberry": "https://images.unsplash.com/photo-1488900128373-2c6b09753211?w=600&auto=format&fit=crop&q=80",
    "Kulfi": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80",
    "Vanilla": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&auto=format&fit=crop&q=80",
    "Chocolate": "https://images.unsplash.com/photo-1580915411954-282cb1b0d780?w=600&auto=format&fit=crop&q=80",
    "Pista": "https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=600&auto=format&fit=crop&q=80",
    "Tender Coconut": "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=600&auto=format&fit=crop&q=80"
};

const riceImages = {
    "Veg Fried Rice": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80",
    "Egg Fried Rice": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600&auto=format&fit=crop&q=80",
    "Chicken Fried Rice": "https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=600&auto=format&fit=crop&q=80"
};

const noodleImages = {
    "Veg Noodles": "https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80",
    "Egg Noodles": "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&auto=format&fit=crop&q=80",
    "Chicken Noodles": "https://images.unsplash.com/photo-1552611052-33e04de081de?w=600&auto=format&fit=crop&q=80"
};

// Build flat MENU_ITEMS array for the app
const flatMenuItems = [];

// 1. Campus Menu
const campusItems = [
    {
        id: "cm-1",
        name: "AFC Campus Choice",
        price: 249,
        includes: ["Crispy Burger", "1 PC Chicken", "French Fries", "Ketchup"],
        description: "Crispy chicken burger served with 1 piece hot chicken, golden salted fries, and ketchup.",
        image: IMAGES.campus,
        category: "campus-menu",
        featured: true,
        popular: true,
        serves: "1 Person",
        badge: "Best Seller",
        calories: 820
    },
    {
        id: "cm-2",
        name: "Besties Meal",
        price: 499,
        includes: ["Crispy Burger", "1 PC Chicken", "6 Strip PC", "French Fries", "Ketchup"],
        description: "Ultimate duo feast: crispy chicken burger, juicy chicken piece, 6 crunchy strips, fries and dip.",
        image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=600&auto=format&fit=crop&q=80",
        category: "campus-menu",
        popular: true,
        serves: "2 People",
        badge: "Popular Combo",
        calories: 1280
    },
    {
        id: "cm-3",
        name: "Darling Meal",
        price: 229,
        includes: ["2 PC Chicken", "Bun 2 PC", "French Fries", "Ketchup", "Garlic Paste"],
        description: "2 pieces of secret-spiced fried chicken with 2 soft butter buns, fries, and authentic garlic sauce.",
        image: "https://images.unsplash.com/photo-1527477321055-436158a2b00d?w=600&auto=format&fit=crop&q=80",
        category: "campus-menu",
        popular: true,
        serves: "1 Person",
        calories: 790
    },
    {
        id: "cm-4",
        name: "Campus Dinner Meal",
        price: 389,
        includes: ["4 PC Chicken", "French Fries", "Garlic Paste", "2 Bun", "Ketchup"],
        description: "4 pieces of golden crispy fried chicken with french fries, signature garlic paste, 2 warm buns and ketchup.",
        image: "https://images.unsplash.com/photo-1513639776629-7b61b0ac49cb?w=600&auto=format&fit=crop&q=80",
        category: "campus-menu",
        serves: "2 People",
        calories: 1150
    },
    {
        id: "cm-5",
        name: "Campus Crunch",
        price: 110,
        includes: ["1 PC Chicken", "2 Bun", "French Fries", "Ketchup"],
        description: "Student saver: 1 piece golden fried chicken, 2 soft buns, crispy fries, and ketchup.",
        image: "https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600&auto=format&fit=crop&q=80",
        category: "campus-menu",
        popular: true,
        serves: "1 Person",
        badge: "Student Saver",
        calories: 540
    },
    {
        id: "cm-6",
        name: "Dinner Special Meal",
        price: 549,
        includes: ["6 PC Chicken", "3 Bun", "French Fries", "Garlic Paste", "Ketchup"],
        description: "6 big pieces of crispy fried chicken paired with 3 fluffy buns, seasoned fries, garlic dip, and ketchup.",
        image: "https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=600&auto=format&fit=crop&q=80",
        category: "campus-menu",
        featured: true,
        serves: "3 People",
        badge: "Squad Feast",
        calories: 1650
    },
    {
        id: "cm-7",
        name: "Campus Gang Meal",
        price: 1099,
        includes: ["14 PC Chicken", "French Fries", "5 Bun", "Garlic Paste", "Ketchup"],
        description: "Giant squad feast: 14 pieces of freshly fried chicken, jumbo french fries, 5 dinner buns, garlic paste & dips.",
        image: "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=600&auto=format&fit=crop&q=80",
        category: "campus-menu",
        featured: true,
        serves: "5-6 People",
        badge: "Party King",
        calories: 3400
    },
    {
        id: "cm-8",
        name: "Campus Gang Meal (Mini)",
        price: 899,
        includes: ["12 PC Chicken", "French Fries", "5 Bun", "Garlic Paste", "Ketchup"],
        description: "12 pieces of savory spiced fried chicken with crunchy fries, 5 buns, and delicious garlic sauce.",
        image: "https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=600&auto=format&fit=crop&q=80",
        category: "campus-menu",
        serves: "4 People",
        calories: 2850
    },
    {
        id: "cm-9",
        name: "Campus Family Meal",
        price: 699,
        includes: ["8 PC Chicken", "4 Bun", "French Fries", "Garlic Paste", "Ketchup"],
        description: "8 pieces of crispy juicy fried chicken, 4 buns, large fries, garlic paste, and ketchup for the whole family.",
        image: "https://images.unsplash.com/photo-1513639776629-7b61b0ac49cb?w=600&auto=format&fit=crop&q=80",
        category: "campus-menu",
        featured: true,
        popular: true,
        serves: "3-4 People",
        calories: 2100
    },
    {
        id: "cm-10",
        name: "Campus Family Meal Mini",
        price: 799,
        includes: ["10 PC Chicken", "French Fries", "4 Bun", "Garlic Paste", "Ketchup"],
        description: "10 pieces of seasoned fried chicken, 4 buns, large french fries, garlic paste and ketchup.",
        image: "https://images.unsplash.com/photo-1527477321055-436158a2b00d?w=600&auto=format&fit=crop&q=80",
        category: "campus-menu",
        serves: "4 People",
        calories: 2450
    }
];
flatMenuItems.push(...campusItems);

// 2. Mojito
const mojitoItems = [
    {
        id: "moj-1",
        name: "Mint Mojito",
        price: 80,
        description: "Crushed fresh garden mint, tangy lemon lime juice and chilled bubbling soda.",
        image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80",
        category: "mojito",
        isVeg: true,
        popular: true,
        badge: "Refreshing",
        calories: 140
    },
    {
        id: "moj-2",
        name: "Blue Mint Mojito",
        price: 80,
        description: "Vibrant curacao blue cooler infused with mint, crushed ice, and citrus fizz.",
        image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
        category: "mojito",
        isVeg: true,
        popular: true,
        calories: 155
    },
    {
        id: "moj-3",
        name: "Passion Fruit Mojito",
        price: 80,
        description: "Tropical aromatic passion fruit nectar muddled with mint leaves and sparkling soda.",
        image: "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&auto=format&fit=crop&q=80",
        category: "mojito",
        isVeg: true,
        calories: 160
    },
    {
        id: "moj-4",
        name: "Green Apple Mojito",
        price: 80,
        description: "Crisp green apple blend with fresh mint sprigs, lime and ice cold carbonation.",
        image: "https://images.unsplash.com/photo-1560512823-829485b8bf24?w=600&auto=format&fit=crop&q=80",
        category: "mojito",
        isVeg: true,
        calories: 150
    }
];
flatMenuItems.push(...mojitoItems);

// 3. Pizza
const pizzaCatalog = [
    { name: "Tandoori Veg", sizes: { S: 269, M: 385, L: 490 }, ingredients: ["Paneer", "Onion", "Capsicum", "Tomato", "Sauce", "Cheese"], isVeg: true },
    { name: "Margherita", sizes: { S: 199, M: 285, L: 389 }, ingredients: ["Cheese", "Sauce"], isVeg: true, popular: true },
    { name: "BBQ Chicken", sizes: { S: 290, M: 390, L: 498 }, ingredients: ["BBQ Chicken", "Onion", "Capsicum", "Sauce", "Cheese"], isVeg: false, popular: true },
    { name: "Neapolitan", sizes: { S: 258, M: 387, L: 480 }, ingredients: ["Capsicum", "Black Olives", "Baby Corn", "Sauce", "Cheese"], isVeg: true },
    { name: "Crispy Chicken", sizes: { S: 270, M: 360, L: 460 }, ingredients: ["BBQ Chicken", "Onion", "Capsicum", "Sauce", "Cheese"], isVeg: false },
    { name: "Farm Topping", sizes: { S: 259, M: 388, L: 489 }, ingredients: ["Onion", "Capsicum", "Mushroom", "Tomato", "Sauce", "Cheese"], isVeg: true },
    { name: "Tandoori Chicken", sizes: { S: 280, M: 380, L: 480 }, ingredients: ["BBQ Chicken", "Onion", "Capsicum", "Sauce", "Cheese"], isVeg: false, popular: true }
];

let pzId = 1;
for (const p of pizzaCatalog) {
    const sizeKeys = [
        { code: "s", label: "Small (7\")", key: "S" },
        { code: "m", label: "Medium (9\")", key: "M" },
        { code: "l", label: "Large (11\")", key: "L" }
    ];
    for (const sz of sizeKeys) {
        flatMenuItems.push({
            id: `pz-${pzId}-${sz.code}`,
            name: `${p.name} Pizza (${sz.label})`,
            price: p.sizes[sz.key],
            description: `Fresh hand-tossed dough topped with ${p.ingredients.join(", ")}. Baked to golden perfection.`,
            image: pizzaImages[p.name] || IMAGES.pizza,
            category: "pizza",
            isVeg: p.isVeg,
            popular: p.popular && sz.key === "M",
            includes: p.ingredients,
            badge: sz.key === "M" && p.popular ? "Popular Size" : undefined,
            serves: sz.key === "S" ? "1 Person" : sz.key === "M" ? "2-3 People" : "3-4 People",
            calories: sz.key === "S" ? 650 : sz.key === "M" ? 1100 : 1600
        });
    }
    pzId++;
}

// Pizza Toppings
flatMenuItems.push(
    {
        id: "pz-top-1",
        name: "Extra Cheese (Pizza Add-On)",
        price: 69,
        description: "Generous extra layer of melted creamy 100% mozzarella cheese.",
        image: "https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=600&auto=format&fit=crop&q=80",
        category: "pizza",
        isVeg: true,
        calories: 180
    },
    {
        id: "pz-top-2",
        name: "Veg. Toppings (Pizza Add-On)",
        price: 60,
        description: "Extra fresh vegetables: olives, capsicum, onions, mushrooms & sweet corn.",
        image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80",
        category: "pizza",
        isVeg: true,
        calories: 60
    },
    {
        id: "pz-top-3",
        name: "Non Veg. Toppings (Pizza Add-On)",
        price: 80,
        description: "Extra seasoned BBQ chicken chunks and savory meat toppings.",
        image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80",
        category: "pizza",
        isVeg: false,
        calories: 140
    }
);

// 4. Wraps & Sides
flatMenuItems.push(
    {
        id: "ws-1",
        name: "AFC Shawarma",
        price: 100,
        description: "Authentic rolled shawarma with spiced roasted chicken, garlic mayo and pickled crunch.",
        image: IMAGES.wraps,
        category: "wraps-sides",
        popular: true,
        badge: "Street Fav",
        calories: 420
    },
    {
        id: "ws-2",
        name: "AFC Shawarma Meal",
        price: 120,
        description: "AFC chicken shawarma combo served with salted crispy fries and garlic dip.",
        image: IMAGES.wraps,
        category: "wraps-sides",
        popular: true,
        calories: 620
    },
    {
        id: "ws-3",
        name: "Veg Wrap",
        price: 120,
        description: "Crisp seasoned veggie patty rolled with shredded lettuce, onions, and spicy mayo sauce.",
        image: "https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600&auto=format&fit=crop&q=80",
        category: "wraps-sides",
        isVeg: true,
        calories: 380
    },
    {
        id: "ws-4",
        name: "Veg Wrap Meal",
        price: 148,
        description: "Fresh veggie roll paired with crispy salted french fries and tomato dip.",
        image: "https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600&auto=format&fit=crop&q=80",
        category: "wraps-sides",
        isVeg: true,
        calories: 580
    },
    {
        id: "ws-5",
        name: "Chicken Wrap",
        price: 149,
        description: "Crispy fried chicken tenders wrapped with garden lettuce, tomatoes and chipotle garlic dressing.",
        image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=600&auto=format&fit=crop&q=80",
        category: "wraps-sides",
        popular: true,
        calories: 490
    },
    {
        id: "ws-6",
        name: "Chicken Wrap Meal",
        price: 177,
        description: "Crispy chicken wrap served alongside seasoned fries and dipping ketchup.",
        image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=600&auto=format&fit=crop&q=80",
        category: "wraps-sides",
        calories: 690
    },
    {
        id: "ws-7",
        name: "Chicken Nuggets (12 PC Combo)",
        price: 239,
        includes: ["12 PC Nuggets", "Pepsi (250ML)", "French Fries"],
        description: "12 golden bite-sized chicken nuggets with crunchy fries and a chilled Pepsi 250ml.",
        image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80",
        category: "wraps-sides",
        popular: true,
        badge: "Kids & Teens",
        calories: 740
    },
    {
        id: "ws-8",
        name: "French Fries",
        price: 69,
        description: "Golden crinkle-cut potatoes fried crispy, salted and served piping hot.",
        image: "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80",
        category: "wraps-sides",
        isVeg: true,
        popular: true,
        calories: 320
    },
    {
        id: "ws-9",
        name: "Popy Chick - Small",
        price: 99,
        description: "Crunchy bite-sized popcorn chicken seasoned with AFC secret spiced salt.",
        image: "https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=600&auto=format&fit=crop&q=80",
        category: "wraps-sides",
        calories: 310
    },
    {
        id: "ws-10",
        name: "Popy Chick - Large",
        price: 129,
        description: "Jumbo portion of seasoned popcorn chicken bites served hot and crunchy.",
        image: "https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=600&auto=format&fit=crop&q=80",
        category: "wraps-sides",
        popular: true,
        calories: 490
    }
);

// 5. Campus Gang Feast
flatMenuItems.push({
    id: "cgf-1",
    name: "Campus Gang Feast - 24 Person",
    price: 3599,
    includes: [
        "4 Pizza Small (Choice)",
        "24 Chicken",
        "24 Chicken Strips",
        "French Fries",
        "Ketchup",
        "Garlic Paste",
        "1 Liter Soft Drink (Choice)"
    ],
    pizza_choices: ["Tandoori Veg", "Margherita", "BBQ Chicken", "Neapolitan", "Crispy Chicken", "Farm Fresh", "Tandoori Chicken"],
    description: "The ultimate 24-person banquet: 4 small handcrafted pizzas, 24 pieces crispy chicken, 24 crunchy chicken strips, jumbo fries, dips & 1L soft drink.",
    image: IMAGES.feast,
    category: "campus-gang-feast",
    featured: true,
    badge: "Ultimate Banquet",
    serves: "24 People",
    calories: 14500
});

// 6. Salad
flatMenuItems.push(
    {
        id: "sld-1",
        name: "Salad Without Chicken",
        price: 149,
        description: "Crisp iceberg lettuce, cucumber, diced tomatoes, bell peppers and light herb vinaigrette.",
        image: IMAGES.salad,
        category: "salad",
        isVeg: true,
        calories: 160
    },
    {
        id: "sld-2",
        name: "Salad With Chicken",
        price: 189,
        description: "Fresh garden greens tossed with tender spiced chicken breast slices and creamy garlic dressing.",
        image: IMAGES.salad,
        category: "salad",
        popular: true,
        calories: 320
    },
    {
        id: "sld-3",
        name: "Overloaded Fried Salad",
        price: 250,
        description: "Hearty crunchy salad loaded with crispy chicken strips, cheese shavings, olives and spicy mayo.",
        image: IMAGES.salad,
        category: "salad",
        featured: true,
        badge: "Chef Special",
        calories: 520
    }
);

// 7. Grilled Chicken
flatMenuItems.push(
    {
        id: "gc-1",
        name: "Full Grilled Chicken",
        price: 500,
        description: "Whole tender chicken fire-grilled to smoky perfection, basted in AFC spice blend.",
        image: IMAGES.grilled,
        category: "grilled-chicken",
        featured: true,
        popular: true,
        badge: "Charcoal Grilled",
        serves: "4 People",
        calories: 1450
    },
    {
        id: "gc-2",
        name: "Half Grilled Chicken",
        price: 299,
        description: "Half charcoal grilled chicken with juicy succulent meat, served with garlic paste dip.",
        image: IMAGES.grilled,
        category: "grilled-chicken",
        popular: true,
        serves: "2 People",
        calories: 780
    },
    {
        id: "gc-3",
        name: "Quarter Grilled Chicken",
        price: 169,
        description: "Quarter leg & thigh piece flame-grilled with aromatic herbs and smoky seasoning.",
        image: IMAGES.grilled,
        category: "grilled-chicken",
        serves: "1 Person",
        calories: 410
    },
    {
        id: "gc-4",
        name: "Quarter Chest Grilled Chicken",
        price: 199,
        description: "Quarter breast piece rich in tender lean protein, grilled juicy over coals.",
        image: IMAGES.grilled,
        category: "grilled-chicken",
        serves: "1 Person",
        calories: 440
    },
    {
        id: "gc-5",
        name: "1 PC Chicken",
        price: 99,
        description: "Single piece of juicy flame-grilled spiced chicken.",
        image: IMAGES.grilled,
        category: "grilled-chicken",
        calories: 220
    },
    {
        id: "gc-6",
        name: "Party Box (1 PC Chicken + Bun + Dip)",
        price: 90,
        minimum_order: 150,
        includes: ["1 PC Chicken", "Ketchup", "Bun 1 PC", "Garlic Paste"],
        note: "Minimum order 150 boxes",
        description: "Special event box: 1 piece spiced chicken, 1 soft dinner bun, garlic dip, and ketchup. (Min. 150 boxes).",
        image: IMAGES.grilled,
        category: "grilled-chicken",
        badge: "Event Special",
        calories: 360
    }
);

// 8. Burgers & Combos
const burgerList = [
    { name: "Spicy Crispy Burger Combo", price: 189, spicy: true, popular: true, desc: "Crispy chicken fillet tossed in fiery chili oil with garlic mayo & fries." },
    { name: "Crispy Double Burger Combo", price: 259, popular: true, badge: "Double Patty", desc: "Two crunchy fried chicken patties with melted cheddar cheese and seasoned fries." },
    { name: "Veg Burger Combo", price: 159, isVeg: true, desc: "Crisp golden potato-veggie patty with lettuce, tomatoes, creamy mayo and fries." },
    { name: "Veg Double Burger Combo", price: 199, isVeg: true, desc: "Double crisp vegetable patties stacked with cheese, fresh salad and fries." },
    { name: "Crispy Beef Burger Combo", price: 180, desc: "Savory beef patty grilled succulent with caramelised onions, pickles and fries." },
    { name: "Chicken Cheese Burger Combo", price: 149, popular: true, desc: "Classic golden fried chicken fillet layered with rich melted cheese and fries." },
    { name: "Kids Burger", price: 99, desc: "Mild, tender mini chicken burger designed especially for kids with soft bun." },
    { name: "Kids Pop Burger", price: 99, desc: "Crispy popcorn chicken pieces nestled in a toasted bun with sweet ketchup." },
    { name: "AFC Crispy Burger Combo", price: 155, desc: "Our signature original recipe crispy burger paired with salted hot fries." },
    { name: "Chilli Chicken Burger Combo", price: 169, spicy: true, desc: "Tender chicken cooked with green chilies, peppers and zesty spicy sauce." },
    { name: "Chicken Momos Burger Combo", price: 178, desc: "Fusion delight: spiced chicken momo fillings inside a soft burger with fries." },
    { name: "Chicken Strip Meal", price: 485, includes: ["10 Strip PC", "French Fries", "Garlic Paste", "Ketchup"], desc: "10 pieces of whole boneless crunchy tenders with large fries, garlic sauce & ketchup." },
    { name: "AFC Prawns (Crispy Golden)", price: 178, note: "Price may vary according to availability (250G, 500G, 1KG)", sizes: ["1KG", "500G", "250G"], desc: "Crispy hand-breaded spiced prawns fried golden brown. Available in 250G, 500G, 1KG." },
    { name: "Strips (6 PC)", price: 299, popular: true, desc: "6 pieces of 100% white-meat boneless chicken tenders, fried extra crispy." }
];

let bgId = 1;
for (const b of burgerList) {
    flatMenuItems.push({
        id: `bc-${bgId}`,
        name: b.name,
        price: b.price,
        description: b.desc,
        image: burgerImages[b.name] || IMAGES.burger,
        category: "burgers-combos",
        isVeg: b.isVeg || false,
        spicy: b.spicy || false,
        popular: b.popular || false,
        badge: b.badge,
        includes: b.includes,
        note: b.note,
        sizes: b.sizes,
        calories: b.price > 250 ? 890 : 540
    });
    bgId++;
}

// 9. Combo Add On
const comboAddonList = [
    { name: "Combo Add-On: Fries + Pepsi (250ML)", price: 89, includes: ["French Fries", "Pepsi (250ML)", "Ketchup", "Mayonnaise"] },
    { name: "Combo Add-On: Kubhoos + Fries + Drink", price: 110, includes: ["Kubhoos", "French Fries", "Mayonnaise", "Choice Drinks (250ML)"] },
    { name: "Combo Add-On: Fries + 3 Buns + Pepsi", price: 99, includes: ["French Fries", "Pepsi (250ML)", "3 Bun", "Mayonnaise"] },
    { name: "Combo Add-On: Pepsi 1.25L + Fries + 6 Buns", price: 137, includes: ["Pepsi (1.25 LTR)", "French Fries", "6 Bun"] }
];
let cadId = 1;
for (const cad of comboAddonList) {
    flatMenuItems.push({
        id: `cad-${cadId}`,
        name: cad.name,
        price: cad.price,
        description: `Upgrade your order with ${cad.includes.join(", ")}.`,
        image: IMAGES.comboAddon,
        category: "combo-addon",
        includes: cad.includes,
        calories: 450
    });
    cadId++;
}

// 10. Bucket Meal
const bucketList = [
    {
        name: "Jumbo Family Meal",
        price: 1549,
        includes: ["14 PC Chicken", "French Fries", "5 Bun", "2 Garlic Paste", "Ketchup", "1 Coleslaw"],
        serves: "6-8 People",
        badge: "Jumbo Feast",
        featured: true,
        desc: "Massive feast: 14 pieces crispy fried chicken, jumbo french fries, 5 buns, 2 garlic dips, ketchup & fresh coleslaw."
    },
    {
        name: "Mini Jumbo Family",
        price: 1359,
        includes: ["12 PC Chicken", "French Fries", "4 Bun", "1 Garlic Paste", "Ketchup", "1 Coleslaw"],
        serves: "5-6 People",
        desc: "12 crispy pieces of chicken, large fries, 4 warm buns, garlic dip, ketchup and 1 coleslaw."
    },
    {
        name: "Family Special Meal",
        price: 1159,
        includes: ["10 PC Chicken", "French Fries", "4 Bun", "1 Garlic Paste", "Ketchup", "1 Coleslaw"],
        serves: "4-5 People",
        popular: true,
        desc: "10 pieces of seasoned fried chicken with french fries, 4 soft buns, garlic paste and coleslaw."
    },
    {
        name: "Small Family Meal",
        price: 999,
        includes: ["8 PC Chicken", "French Fries", "4 Bun", "1 Garlic Paste", "Ketchup", "1 Coleslaw"],
        serves: "3-4 People",
        desc: "8 pieces of crunchy golden chicken, 4 buns, large fries, garlic paste, ketchup and coleslaw."
    }
];
let bmId = 1;
for (const bm of bucketList) {
    flatMenuItems.push({
        id: `bm-${bmId}`,
        name: bm.name,
        price: bm.price,
        description: bm.desc,
        image: IMAGES.bucket,
        category: "bucket-meal",
        includes: bm.includes,
        serves: bm.serves,
        badge: bm.badge,
        featured: bm.featured || false,
        popular: bm.popular || false,
        calories: 3200
    });
    bmId++;
}

// 11. Add On (Base + Meal Addons)
const baseAddons = [
    { name: "Bun (1 PC)", price: 10, isVeg: true, desc: "Fresh soft warm dinner roll bun." },
    { name: "Mayonnaise Dip", price: 20, isVeg: true, desc: "Smooth and creamy signature eggless mayo." },
    { name: "Ketchup Sachet", price: 2, isVeg: true, desc: "Classic tangy tomato ketchup." },
    { name: "Garlic Paste Dip", price: 20, isVeg: true, desc: "Authentic Lebanese style creamy toum garlic sauce." },
    { name: "Kubhoos (1 PC)", price: 10, isVeg: true, desc: "Traditional soft Middle-Eastern flatbread." },
    { name: "Extra Cheese Slice", price: 20, isVeg: true, desc: "Rich melted cheddar cheese slice." },
    { name: "Chicken Piece of Your Choice", price: 120, desc: "1 single piece of signature fried chicken." },
    { name: "Pepsi / 7UP / Dew / Mirinda (750 ML)", price: 40, isVeg: true, desc: "Chilled 750ml bottle of your favorite carbonated drink." }
];
let addId = 1;
for (const a of baseAddons) {
    flatMenuItems.push({
        id: `add-${addId}`,
        name: a.name,
        price: a.price,
        description: a.desc,
        image: IMAGES.addon,
        category: "addons",
        isVeg: a.isVeg || false,
        calories: 80
    });
    addId++;
}

const mealAddons = [
    { name: "Meal Upgrade: Pepsi 1.25L + 7 Buns + Fries", price: 163, includes: ["Pepsi (1.25 LTR)", "French Fries", "7 Bun", "Coleslaw"] },
    { name: "Meal Upgrade: Pepsi 1.25L + 5 Buns + Fries", price: 149, includes: ["Pepsi (1.25 LTR)", "French Fries", "5 Bun", "Coleslaw"] },
    { name: "Meal Upgrade: Pepsi 750ML + 6 Buns + Fries", price: 137, includes: ["Pepsi (750ML)", "French Fries", "6 Bun", "Coleslaw"] },
    { name: "Meal Upgrade: Pepsi 750ML + Bun + Fries", price: 129, includes: ["Pepsi (750ML)", "French Fries", "Bun", "Coleslaw"] }
];
let madId = 1;
for (const mad of mealAddons) {
    flatMenuItems.push({
        id: `mad-${madId}`,
        name: mad.name,
        price: mad.price,
        description: `Complete party upgrade including ${mad.includes.join(", ")}.`,
        image: IMAGES.addon,
        category: "addons",
        includes: mad.includes,
        calories: 620
    });
    madId++;
}

// 12. Snacks
const snackList = [
    { name: "Sea Food Spring Roll", price: 25, desc: "Crispy pastry wrapper filled with minced seafood & spices." },
    { name: "Fish Finger", price: 30, desc: "Tender fish fillet encased in golden crunchy breadcrumbs." },
    { name: "Fish Cutlet", price: 13, desc: "Spiced minced fish and herb croquette fried golden brown." },
    { name: "Fish Samosa", price: 15, desc: "Flaky triangle samosa stuffed with spicy savory fish filling." },
    { name: "Chicken Ball", price: 12, desc: "Bite-sized chicken meatball spiced with garlic and pepper." },
    { name: "Chicken Fillet", price: 15, desc: "Mini crispy boneless chicken tender fillet." },
    { name: "Chicken Nuggets", price: 20, desc: "Crunchy breaded chicken nuggets served fresh." },
    { name: "Chicken Samosa", price: 15, desc: "Crisp triangle pastry with spiced chicken keema filling." },
    { name: "Chicken Spring Roll", price: 20, desc: "Golden fried rolled crepe stuffed with seasoned chicken and vegetables." },
    { name: "Chicken Rings", price: 15, desc: "Fun crunchy chicken rings spiced with aromatic seasoning." },
    { name: "Chicken Fingers", price: 12, desc: "Crispy chicken strips coated in light golden crumb." },
    { name: "Chicken Momos", price: 15, popular: true, desc: "Steamed or fried dumplings filled with juicy chicken and scallions." },
    { name: "Meat Cutlet", price: 13, desc: "Savory minced meat and potato cutlet shallow fried crispy." },
    { name: "Meat Momos", price: 15, desc: "Delicious savory dumplings stuffed with spiced minced meat." },
    { name: "Meat Samosa", price: 15, desc: "Golden flaky samosa pocket stuffed with fragrant spiced minced meat." }
];
let snkId = 1;
for (const s of snackList) {
    flatMenuItems.push({
        id: `snk-${snkId}`,
        name: s.name,
        price: s.price,
        description: s.desc,
        image: IMAGES.snacks,
        category: "snacks",
        popular: s.popular || false,
        calories: 120
    });
    snkId++;
}

// 13. Fried Rices
const riceList = [
    { name: "Veg Fried Rice", price: 169, isVeg: true, desc: "Aromatic basmati rice tossed with carrots, beans, bell peppers and scallions." },
    { name: "Egg Fried Rice", price: 189, isVeg: false, desc: "Fluffy wok-tossed rice with scrambled eggs, vegetables and savory soy sauce." },
    { name: "Chicken Fried Rice", price: 199, isVeg: false, popular: true, desc: "Wok-fried rice with tender chicken chunks, scrambled eggs, and Asian herbs." }
];
let frId = 1;
for (const r of riceList) {
    flatMenuItems.push({
        id: `fr-${frId}`,
        name: r.name,
        price: r.price,
        description: r.desc,
        image: riceImages[r.name] || IMAGES.rice,
        category: "fried-rice",
        isVeg: r.isVeg,
        popular: r.popular || false,
        serves: "1 Person",
        calories: 520
    });
    frId++;
}

// 14. Noodles
const noodleList = [
    { name: "Veg Noodles", price: 189, isVeg: true, desc: "Stir-fried noodles with crisp cabbage, capsicum, carrots and spring onions." },
    { name: "Egg Noodles", price: 199, isVeg: false, desc: "Savory tossed noodles with fried egg ribbons and crunchy vegetables." },
    { name: "Chicken Noodles", price: 219, isVeg: false, popular: true, desc: "Tender shredded chicken, veggies, and noodles tossed in high heat with savory sauces." }
];
let ndlId = 1;
for (const n of noodleList) {
    flatMenuItems.push({
        id: `ndl-${ndlId}`,
        name: n.name,
        price: n.price,
        description: n.desc,
        image: noodleImages[n.name] || IMAGES.noodles,
        category: "noodles",
        isVeg: n.isVeg,
        popular: n.popular || false,
        serves: "1 Person",
        calories: 560
    });
    ndlId++;
}

// 15. Ice Creams
const icecreamList = [
    { name: "Alphonso Mango", price: 60, popular: true, desc: "Rich and luscious scoop made with sweet sun-ripened Alphonso mangoes." },
    { name: "Strawberry", price: 60, desc: "Sweet and creamy strawberry scoop with real berry essence." },
    { name: "Kulfi", price: 80, popular: true, badge: "Traditional", desc: "Authentic dense royal Indian kulfi ice cream with cardamom and pistachios." },
    { name: "Vanilla", price: 60, desc: "Classic rich vanilla bean scoop with pure bourbon vanilla flavor." },
    { name: "Chocolate", price: 70, popular: true, desc: "Deep velvety Dutch chocolate scoop for true cocoa lovers." },
    { name: "Pista", price: 70, desc: "Nutty and fragrant pistachio scoop with crunchy roasted pista bits." },
    { name: "Tender Coconut", price: 80, popular: true, badge: "Signature", desc: "Refreshing exotic scoop crafted with fresh tender coconut cream and malai." }
];
let icId = 1;
for (const ic of icecreamList) {
    flatMenuItems.push({
        id: `ic-${icId}`,
        name: `${ic.name} Ice Cream`,
        price: ic.price,
        description: ic.desc,
        image: iceCreamImages[ic.name] || IMAGES.icecream,
        category: "ice-creams",
        isVeg: true,
        popular: ic.popular || false,
        badge: ic.badge,
        calories: 190
    });
    icId++;
}

console.log(`Generated ${flatMenuItems.length} items for MENU_ITEMS.`);

const menuDataContent = `import type { MenuItem, RestaurantMenuData } from './types';

export const RESTAURANT_DATA: RestaurantMenuData = ${JSON.stringify(rawMenu, null, 2)};

export const MENU_ITEMS: MenuItem[] = ${JSON.stringify(flatMenuItems, null, 2)};
`;

fs.writeFileSync(menuDataTsPath, menuDataContent, "utf8");
console.log("[2/5] Updated src/menuData.ts successfully");

// 3. Update CategoryNav.tsx with icons
const categoryNavPath = path.join(frontendDir, "src/components/CategoryNav.tsx");
const categoryNavContent = `import React, { useRef } from 'react';
import {
  GraduationCap,
  Wine,
  Pizza,
  Sandwich,
  Users,
  Salad,
  Flame,
  UtensilsCrossed,
  PlusCircle,
  Package,
  Plus,
  Cookie,
  Soup,
  Utensils,
  IceCream,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { CATEGORIES, type Category } from '../types';

interface CategoryNavProps {
  activeCategory: Category | 'all';
  onSelectCategory: (category: Category | 'all') => void;
  itemCounts?: Record<string, number>;
}

const CATEGORY_ICON_MAP: Record<string, React.ReactNode> = {
  'campus-menu': <GraduationCap className="w-4 h-4" />,
  'mojito': <Wine className="w-4 h-4" />,
  'pizza': <Pizza className="w-4 h-4" />,
  'wraps-sides': <Sandwich className="w-4 h-4" />,
  'campus-gang-feast': <Users className="w-4 h-4" />,
  'salad': <Salad className="w-4 h-4" />,
  'grilled-chicken': <Flame className="w-4 h-4" />,
  'burgers-combos': <UtensilsCrossed className="w-4 h-4" />,
  'combo-addon': <PlusCircle className="w-4 h-4" />,
  'bucket-meal': <Package className="w-4 h-4" />,
  'addons': <Plus className="w-4 h-4" />,
  'snacks': <Cookie className="w-4 h-4" />,
  'fried-rice': <Soup className="w-4 h-4" />,
  'noodles': <Utensils className="w-4 h-4" />,
  'ice-creams': <IceCream className="w-4 h-4" />,
};

export const CategoryNav: React.FC<CategoryNavProps> = ({
  activeCategory,
  onSelectCategory,
  itemCounts = {},
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -260 : 260;
      scrollContainerRef.current.scrollBy({
        left: scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="relative w-full max-w-7xl mx-auto px-2 sm:px-4 my-6">
      {/* Scroll Left Button */}
      <button
        onClick={() => scroll('left')}
        aria-label="Scroll left"
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-white shadow-md border border-gray-100 text-gray-700 hover:text-afc-red hover:bg-red-50 transition-all -ml-3"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Scrollable Container */}
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar py-2 px-1 scroll-smooth"
      >
        {/* All Items Pill */}
        <button
          onClick={() => onSelectCategory('all')}
          className={\`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm whitespace-nowrap transition-all duration-200 cursor-pointer \${
            activeCategory === 'all'
              ? 'bg-afc-red text-white shadow-md shadow-red-500/20 scale-[1.02]'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200/80 hover:border-gray-300'
          }\`}
        >
          <span>🍽️</span>
          <span>All Menu</span>
          {itemCounts['all'] !== undefined && (
            <span
              className={\`text-xs px-2 py-0.5 rounded-full font-bold \${
                activeCategory === 'all'
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-100 text-gray-600'
              }\`}
            >
              {itemCounts['all']}
            </span>
          )}
        </button>

        {/* Individual Category Pills */}
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.id;
          const count = itemCounts[cat.id];

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={\`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm whitespace-nowrap transition-all duration-200 cursor-pointer \${
                isActive
                  ? 'bg-afc-red text-white shadow-md shadow-red-500/20 scale-[1.02]'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200/80 hover:border-gray-300'
              }\`}
            >
              <span className={isActive ? 'text-white' : 'text-afc-red'}>
                {CATEGORY_ICON_MAP[cat.id] || cat.emoji}
              </span>
              <span>{cat.label}</span>
              {count !== undefined && (
                <span
                  className={\`text-xs px-1.5 py-0.5 rounded-full font-bold \${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }\`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Scroll Right Button */}
      <button
        onClick={() => scroll('right')}
        aria-label="Scroll right"
        className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 items-center justify-center rounded-full bg-white shadow-md border border-gray-100 text-gray-700 hover:text-afc-red hover:bg-red-50 transition-all -mr-3"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};
`;

fs.writeFileSync(categoryNavPath, categoryNavContent, "utf8");
console.log("[3/5] Updated src/components/CategoryNav.tsx successfully");

// 4. Update Home.tsx bucket category filtering
const homePath = path.join(frontendDir, "src/pages/Home.tsx");
let homeContent = fs.readFileSync(homePath, "utf8");
homeContent = homeContent.replace(
    "const signatureBuckets = MENU_ITEMS.filter((item) => item.category === 'buckets').slice(0, 3);",
    "const signatureBuckets = MENU_ITEMS.filter((item) => item.category === 'bucket-meal' || item.category === 'buckets').slice(0, 3);"
);
fs.writeFileSync(homePath, homeContent, "utf8");
console.log("[4/5] Updated src/pages/Home.tsx successfully");

// 5. Update Footer.tsx category links
const footerPath = path.join(frontendDir, "src/components/Footer.tsx");
let footerContent = fs.readFileSync(footerPath, "utf8");
footerContent = footerContent
    .replace('to="/menu?category=buckets"', 'to="/menu?category=bucket-meal"')
    .replace('to="/menu?category=chicken"', 'to="/menu?category=grilled-chicken"')
    .replace('to="/menu?category=burgers"', 'to="/menu?category=burgers-combos"')
    .replace('to="/menu?category=wings"', 'to="/menu?category=pizza"')
    .replace('to="/menu?category=sides"', 'to="/menu?category=wraps-sides"');
fs.writeFileSync(footerPath, footerContent, "utf8");
console.log("[5/5] Updated src/components/Footer.tsx successfully");

console.log("\nAll frontend files successfully updated!");
