const mongoose = require("mongoose");
const Category = require("../models/Category");
const Product = require("../models/new/Product");
const Variant = require("../models/new/Variant");
const Addon = require("../models/new/Addon");
const AddonGroup = require("../models/new/AddonGroup");
const Bundle = require("../models/new/Bundle");
require("dotenv").config({ path: "./.env" });

const menu = require("../data/restaurantMenu.json");

const EXACT_PIZZA_PRICES = {
  "Tandoori Veg": { S: 269, M: 385, L: 490 },
  "Margherita": { S: 199, M: 285, L: 389 },
  "BBQ Chicken": { S: 290, M: 390, L: 498 },
  "Neapolitan": { S: 258, M: 387, L: 480 },
  "Crispy Chicken": { S: 270, M: 360, L: 460 },
  "Farm Topping": { S: 259, M: 388, L: 489 },
  "Tandoori Chicken": { S: 280, M: 380, L: 480 }
};

async function seedCompleteMenu() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to database for complete menu seeding...");

    // 1. Seed Categories idempotently
    const categoryMap = new Map();
    for (const cat of menu.categories) {
      const slug = cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      let categoryDoc = await Category.findOne({ slug });
      if (!categoryDoc) {
        categoryDoc = await Category.create({
          name: cat.name,
          slug,
          description: `${cat.name} menu offerings`,
          isActive: true
        });
      }
      categoryMap.set(cat.name, categoryDoc._id);
    }
    console.log("Categories synced:", categoryMap.size);

    // 2. Seed Products and Variants idempotently
    let productCount = 0;
    let variantCount = 0;

    for (const cat of menu.categories) {
      const categoryId = categoryMap.get(cat.name);

      if (cat.items) {
        for (const item of cat.items) {
          if (!item.name) continue;

          let priceInPaise = 0;
          if (item.price !== undefined) {
            priceInPaise = Math.round(Number(item.price) * 100);
          }

          const baseSku = `${item.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}_${cat.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;

          // Check for exact pizza prices if applicable
          let sizes = item.sizes;
          if (EXACT_PIZZA_PRICES[item.name]) {
            sizes = EXACT_PIZZA_PRICES[item.name];
          }

          if (sizes) {
            // Determine starting price (Small or cheapest size)
            let startingPrice = priceInPaise;
            if (!Array.isArray(sizes)) {
              const prices = Object.values(sizes).map(p => Math.round(Number(p) * 100));
              startingPrice = Math.min(...prices);
            }

            let product = await Product.findOne({ name: item.name, category: categoryId });
            if (!product) {
              product = await Product.create({
                name: item.name,
                description: item.ingredients ? item.ingredients.join(", ") : (item.description || ""),
                category: categoryId,
                priceInPaise: startingPrice,
                stock: 150,
                sku: baseSku,
                image: item.image || "https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=600&auto=format&fit=crop&q=80",
                includes: item.includes || [],
                isVeg: item.isVeg ?? (item.name.toLowerCase().includes("veg") && !item.name.toLowerCase().includes("non"))
              });
            } else {
              product.priceInPaise = startingPrice;
              product.description = item.ingredients ? item.ingredients.join(", ") : (item.description || product.description);
              await product.save();
            }
            productCount++;

            // Upsert variants
            if (!Array.isArray(sizes)) {
              for (const [size, price] of Object.entries(sizes)) {
                const varPrice = Math.round(Number(price) * 100);
                const varSku = `${baseSku}_${size}`;
                let variant = await Variant.findOne({ product: product._id, name: size });
                if (!variant) {
                  await Variant.create({
                    name: size,
                    sku: varSku,
                    priceInPaise: varPrice,
                    product: product._id,
                    isActive: true
                  });
                } else {
                  variant.priceInPaise = varPrice;
                  await variant.save();
                }
                variantCount++;
              }
            } else {
              for (const size of sizes) {
                let variant = await Variant.findOne({ product: product._id, name: String(size) });
                if (!variant) {
                  await Variant.create({
                    name: String(size),
                    sku: `${baseSku}_${size}`,
                    priceInPaise: priceInPaise,
                    product: product._id,
                    isActive: true
                  });
                } else {
                  variant.priceInPaise = priceInPaise;
                  await variant.save();
                }
                variantCount++;
              }
            }
          } else {
            let product = await Product.findOne({ name: item.name, category: categoryId });
            if (!product) {
              product = await Product.create({
                name: item.name,
                description: item.includes ? item.includes.join(" • ") : (item.description || ""),
                category: categoryId,
                priceInPaise: priceInPaise,
                stock: 150,
                sku: baseSku,
                image: item.image || "https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?w=600&auto=format&fit=crop&q=80",
                includes: item.includes || [],
                isVeg: item.isVeg ?? (item.name.toLowerCase().includes("veg") && !item.name.toLowerCase().includes("non"))
              });
            } else {
              product.priceInPaise = priceInPaise;
              await product.save();
            }
            productCount++;
          }
        }
      }
    }

    console.log(`Complete menu seeding finished successfully! Products: ${productCount}, Variants: ${variantCount}`);
    process.exit(0);
  } catch (error) {
    console.error("Complete menu seeding failed:", error);
    process.exit(1);
  }
}

seedCompleteMenu();
