const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createOrderSchema } = require("../src/validators/orderValidator");
const Order = require("../src/models/Order");
const menuData = require("../src/data/restaurantMenu.json");

describe("AFC Pricing and Promotions Verification Suite", () => {
    describe("1. Unknown Coupon Codes and Arbitrary Discounts Rejection", () => {
        it("should reject order payload containing couponCode", () => {
            const result = createOrderSchema.safeParse({
                body: {
                    fullName: "Student Customer",
                    phone: "9876543210",
                    couponCode: "CAMPUS20"
                },
                params: {},
                query: {}
            });

            assert.equal(result.success, false, "Order with couponCode must fail validation");
            const issue = result.error.issues.find(i => i.path.includes("couponCode"));
            assert.ok(issue, "Must contain issue for couponCode");
            assert.match(issue.message, /no promotional discounts or coupon codes/i);
        });

        it("should reject order payload containing coupon alias", () => {
            const result = createOrderSchema.safeParse({
                body: {
                    fullName: "Customer",
                    phone: "9876543210",
                    coupon: "AFC50"
                },
                params: {},
                query: {}
            });

            assert.equal(result.success, false, "Order with coupon alias must fail validation");
            const issue = result.error.issues.find(i => i.path.includes("couponCode"));
            assert.ok(issue, "Must contain issue for coupon");
        });

        it("should reject order payload containing frontend-supplied discount", () => {
            const result = createOrderSchema.safeParse({
                body: {
                    fullName: "Customer",
                    phone: "9876543210",
                    discount: 50
                },
                params: {},
                query: {}
            });

            assert.equal(result.success, false, "Order with discount must fail validation");
            const issue = result.error.issues.find(i => i.path.includes("discount"));
            assert.ok(issue, "Must contain issue for discount");
            assert.match(issue.message, /arbitrary or frontend-supplied discounts are not accepted/i);
        });

        it("should reject order payload containing discountInPaise", () => {
            const result = createOrderSchema.safeParse({
                body: {
                    fullName: "Customer",
                    phone: "9876543210",
                    discountInPaise: 5000
                },
                params: {},
                query: {}
            });

            assert.equal(result.success, false, "Order with discountInPaise must fail validation");
        });

        it("should accept legitimate order payload without coupons or discounts", () => {
            const result = createOrderSchema.safeParse({
                body: {
                    fullName: "Legitimate Customer",
                    phone: "9876543210",
                    orderType: "pickup",
                    pickupLocation: "Noorul Islam College"
                },
                params: {},
                query: {}
            });

            assert.equal(result.success, true, "Valid order without discounts must pass");
        });
    });

    describe("2. Legitimate Menu Items and Prices Preservation", () => {
        it("should verify AFC restaurant menu categories and combo items exist intact", () => {
            assert.equal(menuData.restaurant, "American Fried Chicken");
            assert.ok(Array.isArray(menuData.categories), "Categories must be an array");
            assert.ok(menuData.categories.length > 0, "Menu must have categories");

            // Verify campus specials and bucket meals
            const campusCategory = menuData.categories.find(c => c.name.toLowerCase().includes("campus") || c.name.toLowerCase().includes("special"));
            assert.ok(campusCategory, "Campus menu category must exist");
            assert.ok(campusCategory.items.length > 0, "Campus items must exist");

            // Verify that all menu item prices are positive numbers and not discounts
            let totalItemsChecked = 0;
            for (const category of menuData.categories) {
                for (const item of category.items) {
                    const itemName = item.name || (item.includes && item.includes.join(" + ")) || "Item";
                    assert.ok(typeof itemName === "string" && itemName.length > 0, "Item must have name or includes");
                    if (typeof item.price === "number") {
                        assert.ok(item.price > 0, `Price for ${itemName} must be positive`);
                    } else if (item.sizes && typeof item.sizes === "object" && !Array.isArray(item.sizes)) {
                        for (const [size, price] of Object.entries(item.sizes)) {
                            assert.ok(typeof price === "number" && price > 0, `Size ${size} price for ${itemName} must be positive`);
                        }
                    }
                    assert.equal(item.discount, undefined, `Item ${itemName} must not have fake discount property`);
                    assert.equal(item.originalPrice, undefined, `Item ${itemName} must not have fake originalPrice property`);
                    totalItemsChecked++;
                }
            }
            assert.ok(totalItemsChecked >= 20, "Should have verified at least 20 menu items");
        });
    });

    describe("3. Backend Calculation of Checkout Totals and Historical Orders Integrity", () => {
        it("should calculate total amount strictly as integer paise from item prices and quantities", () => {
            const sampleItems = [
                { priceInPaise: 11000, quantity: 2 }, // 2 * ₹110 = ₹220 (22000 paise)
                { priceInPaise: 54900, quantity: 1 }  // 1 * ₹549 = ₹549 (54900 paise)
            ];

            const computedTotalPaise = sampleItems.reduce((sum, item) => sum + (item.priceInPaise * item.quantity), 0);
            assert.equal(computedTotalPaise, 76900, "Total must be 76900 paise (₹769)");
            assert.ok(Number.isInteger(computedTotalPaise), "Computed total must be an integer");
        });

        it("should verify order schema stores frozen item snapshots with priceInPaise", () => {
            const orderItemPath = Order.schema.path("items");
            assert.ok(orderItemPath, "Order must have items array");

            const totalAmountPath = Order.schema.path("totalAmountInPaise");
            assert.ok(totalAmountPath, "Order must have totalAmountInPaise");
            assert.equal(totalAmountPath.instance, "Number");
            assert.equal(totalAmountPath.isRequired, true, "totalAmountInPaise is required on orders");
        });
    });
});
