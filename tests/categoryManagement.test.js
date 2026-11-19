const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Category = require("../src/models/Category");
const Product = require("../src/models/Product");
const Order = require("../src/models/Order");
const { categoryCreateSchema, categoryUpdateSchema, categoryIdSchema } = require("../src/validators/categoryValidator");
const { createCategory, getCategories, getCategoryById, updateCategory, deleteCategory } = require("../src/controllers/categoryController");
const { getAllCategoriesAdmin, getCategoryWithProductCount } = require("../src/controllers/adminController");
const { authorize } = require("../src/middleware/authMiddleware");

// Helper mock response
function createMockRes() {
    const res = {
        statusCode: 200,
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        }
    };
    return res;
}

describe("AFC Category Management Verification Suite", () => {
    before(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/afc");
        }
        // Ensure indexes are built for unique constraints
        await Category.init();
        // Clean up any test records
        await Category.deleteMany({ slug: { $regex: "^test-" } });
        await Product.deleteMany({ sku: { $regex: "^TEST-" } });
    });

    after(async () => {
        // Clean up test data
        await Category.deleteMany({ slug: { $regex: "^test-" } });
        await Product.deleteMany({ sku: { $regex: "^TEST-" } });
        await mongoose.disconnect();
    });

    describe("1. Category Schema & Zod Validation", () => {
        it("Scenario 9a: should validate a valid category creation payload", () => {
            const validPayload = {
                body: {
                    name: "Test Milkshakes",
                    slug: "test-milkshakes",
                    description: "Chilled milkshakes",
                    image: "https://example.com/shakes.jpg"
                },
                params: {},
                query: {}
            };

            const result = categoryCreateSchema.safeParse(validPayload);
            assert.equal(result.success, true);
        });

        it("Scenario 9b: should reject category creation with missing name", () => {
            const invalidPayload = {
                body: {
                    slug: "test-shakes",
                    description: "Missing name"
                },
                params: {},
                query: {}
            };

            const result = categoryCreateSchema.safeParse(invalidPayload);
            assert.equal(result.success, false);
            assert.ok(result.error.issues.some(i => i.path.includes("name")));
        });

        it("Scenario 9c: should reject category creation with invalid slug format", () => {
            const invalidPayload = {
                body: {
                    name: "Test Shakes",
                    slug: "INVALID SLUG!!",
                    description: "Invalid slug format"
                },
                params: {},
                query: {}
            };

            const result = categoryCreateSchema.safeParse(invalidPayload);
            assert.equal(result.success, false);
            assert.ok(result.error.issues.some(i => i.path.includes("slug")));
        });

        it("Scenario 9d: should reject invalid MongoDB ObjectId in params", () => {
            const invalidPayload = {
                body: {},
                params: {
                    id: "invalid-mongo-id"
                },
                query: {}
            };

            const result = categoryIdSchema.safeParse(invalidPayload);
            assert.equal(result.success, false);
        });

        it("Scenario 9e: should validate category update with partial fields", () => {
            const validUpdate = {
                body: {
                    name: "Test Shakes Updated",
                    isActive: false
                },
                params: {
                    id: new mongoose.Types.ObjectId().toString()
                },
                query: {}
            };

            const result = categoryUpdateSchema.safeParse(validUpdate);
            assert.equal(result.success, true);
        });
    });

    describe("2. Admin Category Listing (Scenario 1 & 5)", () => {
        let activeCat, disabledCat;

        before(async () => {
            activeCat = await Category.create({
                name: "Test Active Treats",
                slug: "test-active-treats",
                isActive: true
            });
            disabledCat = await Category.create({
                name: "Test Disabled Treats",
                slug: "test-disabled-treats",
                isActive: false
            });
        });

        it("Scenario 1: Admin can list all categories including active and disabled", async () => {
            const req = { query: {} };
            const res = createMockRes();

            await getAllCategoriesAdmin(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.data.success, true);
            const slugs = res.data.categories.map(c => c.slug);
            assert.ok(slugs.includes("test-active-treats"), "Active category should be listed");
            assert.ok(slugs.includes("test-disabled-treats"), "Disabled category should be listed for admin");
        });

        it("Scenario 5: Disabled categories remain visible in admin dashboard with status filter", async () => {
            const req = { query: { status: "inactive" } };
            const res = createMockRes();

            await getAllCategoriesAdmin(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.data.success, true);
            assert.ok(res.data.categories.every(c => c.isActive === false));
            assert.ok(res.data.categories.some(c => c.slug === "test-disabled-treats"));
        });

        it("Scenario 1b: Admin can search categories by query term", async () => {
            const req = { query: { search: "Disabled Treats" } };
            const res = createMockRes();

            await getAllCategoriesAdmin(req, res);

            assert.equal(res.statusCode, 200);
            assert.ok(res.data.categories.some(c => c.slug === "test-disabled-treats"));
        });
    });

    describe("3. Category Creation & Duplicate Prevention (Scenario 2 & 8)", () => {
        it("Scenario 2: Admin can create a category", async () => {
            const req = {
                body: {
                    name: "Test Fried Chicken",
                    slug: "test-fried-chicken",
                    description: "Crispy fried chicken pieces",
                    image: "https://example.com/fried-chicken.jpg"
                },
                user: { _id: new mongoose.Types.ObjectId(), email: "admin@afc.com" },
                ip: "127.0.0.1"
            };
            const res = createMockRes();

            await createCategory(req, res);

            assert.equal(res.statusCode, 201);
            assert.equal(res.data.success, true);
            assert.equal(res.data.category.name, "Test Fried Chicken");
            assert.equal(res.data.category.slug, "test-fried-chicken");
            assert.equal(res.data.category.isActive, true);
        });

        it("Scenario 8: Duplicate slugs are rejected with 409 Conflict", async () => {
            const req = {
                body: {
                    name: "Test Fried Chicken Different Name",
                    slug: "test-fried-chicken", // Same slug
                    description: "Duplicate slug test"
                },
                user: { _id: new mongoose.Types.ObjectId(), email: "admin@afc.com" },
                ip: "127.0.0.1"
            };
            const res = createMockRes();

            await createCategory(req, res);

            assert.equal(res.statusCode, 409);
            assert.equal(res.data.success, false);
            assert.match(res.data.message, /already exists/i);
        });

        it("Scenario 8b: Duplicate category names are rejected with 409 Conflict", async () => {
            const req = {
                body: {
                    name: "Test Fried Chicken", // Same name
                    slug: "test-fried-chicken-unique-slug",
                    description: "Duplicate name test"
                },
                user: { _id: new mongoose.Types.ObjectId(), email: "admin@afc.com" },
                ip: "127.0.0.1"
            };
            const res = createMockRes();

            await createCategory(req, res);

            assert.equal(res.statusCode, 409);
            assert.equal(res.data.success, false);
            assert.match(res.data.message, /already exists/i);
        });
    });

    describe("4. Category Edit & ID Preservation (Scenario 3)", () => {
        let testCat;

        before(async () => {
            testCat = await Category.create({
                name: "Test Editable Cat",
                slug: "test-editable-cat",
                description: "Original Description"
            });
        });

        it("Scenario 3: Admin can edit a category without changing its ID", async () => {
            const originalId = testCat._id.toString();
            const req = {
                params: { id: originalId },
                body: {
                    name: "Test Editable Cat Updated",
                    description: "Updated Description"
                },
                user: { _id: new mongoose.Types.ObjectId(), email: "admin@afc.com" },
                ip: "127.0.0.1"
            };
            const res = createMockRes();

            await updateCategory(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.data.success, true);
            assert.equal(res.data.category._id.toString(), originalId, "Category ID must remain unchanged");
            assert.equal(res.data.category.name, "Test Editable Cat Updated");
            assert.equal(res.data.category.description, "Updated Description");
        });
    });

    describe("5. Category Disabling & Customer Menu Exclusion (Scenario 4 & 6)", () => {
        let testCat;

        before(async () => {
            testCat = await Category.create({
                name: "Test Disabling Cat",
                slug: "test-disabling-cat",
                isActive: true
            });
        });

        it("Scenario 4: Admin can disable a category", async () => {
            const req = {
                params: { id: testCat._id.toString() },
                user: { _id: new mongoose.Types.ObjectId(), email: "admin@afc.com" },
                ip: "127.0.0.1"
            };
            const res = createMockRes();

            await deleteCategory(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.data.success, true);

            const fetched = await Category.findById(testCat._id);
            assert.equal(fetched.isActive, false, "Category should be deactivated in DB");
        });

        it("Scenario 6: Disabled categories do not appear in customer public menu", async () => {
            const req = {};
            const res = createMockRes();

            await getCategories(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.data.success, true);
            const found = res.data.categories.find(c => c.slug === "test-disabling-cat");
            assert.equal(found, undefined, "Disabled category must NOT be in public customer category list");
        });
    });

    describe("6. Category Re-enabling (Scenario 7)", () => {
        let disabledCat;

        before(async () => {
            disabledCat = await Category.create({
                name: "Test Reenable Cat",
                slug: "test-reenable-cat",
                isActive: false
            });
        });

        it("Scenario 7: Admin can re-enable a category", async () => {
            const req = {
                params: { id: disabledCat._id.toString() },
                body: { isActive: true },
                user: { _id: new mongoose.Types.ObjectId(), email: "admin@afc.com" },
                ip: "127.0.0.1"
            };
            const res = createMockRes();

            await updateCategory(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.data.success, true);
            assert.equal(res.data.category.isActive, true);

            // Verify it now appears in public getCategories
            const pubRes = createMockRes();
            await getCategories({}, pubRes);
            const found = pubRes.data.categories.find(c => c.slug === "test-reenable-cat");
            assert.ok(found, "Re-enabled category must appear in public category list");
        });
    });

    describe("7. Non-Admin Permission Checks (Scenario 10)", () => {
        it("Scenario 10a: Unauthenticated user is rejected with 401", () => {
            const middleware = authorize("admin");
            const req = {}; // No user
            const res = createMockRes();
            let nextCalled = false;

            middleware(req, res, () => { nextCalled = true; });

            assert.equal(nextCalled, false, "next() should not be called for unauthenticated request");
            assert.equal(res.statusCode, 401);
            assert.equal(res.data.success, false);
            assert.match(res.data.message, /authentication required/i);
        });

        it("Scenario 10b: Customer role user is rejected with 403 Forbidden", () => {
            const middleware = authorize("admin");
            const req = { user: { role: "customer", email: "user@test.com" } };
            const res = createMockRes();
            let nextCalled = false;

            middleware(req, res, () => { nextCalled = true; });

            assert.equal(nextCalled, false, "next() should not be called for non-admin");
            assert.equal(res.statusCode, 403);
            assert.equal(res.data.success, false);
            assert.match(res.data.message, /do not have permission/i);
        });

        it("Scenario 10c: Kitchen staff role user is rejected with 403 Forbidden", () => {
            const middleware = authorize("admin");
            const req = { user: { role: "kitchen", email: "kitchen@test.com" } };
            const res = createMockRes();
            let nextCalled = false;

            middleware(req, res, () => { nextCalled = true; });

            assert.equal(nextCalled, false, "next() should not be called for kitchen staff");
            assert.equal(res.statusCode, 403);
            assert.equal(res.data.success, false);
        });

        it("Scenario 10d: Admin role is authorized to proceed", () => {
            const middleware = authorize("admin");
            const req = { user: { role: "admin", email: "admin@test.com" } };
            const res = createMockRes();
            let nextCalled = false;

            middleware(req, res, () => { nextCalled = true; });

            assert.equal(nextCalled, true, "next() must be called for admin");
        });
    });

    describe("8. Product and Order Data Preservation (Scenario 11)", () => {
        let catWithProducts, prod1, prod2;

        before(async () => {
            catWithProducts = await Category.create({
                name: "Test Preserved Cat",
                slug: "test-preserved-cat",
                isActive: true
            });

            prod1 = await Product.create({
                name: "Test Preserved Product 1",
                category: catWithProducts._id,
                priceInPaise: 15000,
                stock: 10,
                sku: "TEST-PRESERVED-1",
                image: "https://example.com/p1.jpg"
            });

            prod2 = await Product.create({
                name: "Test Preserved Product 2",
                category: catWithProducts._id,
                priceInPaise: 25000,
                stock: 5,
                sku: "TEST-PRESERVED-2",
                image: "https://example.com/p2.jpg"
            });
        });

        it("Scenario 11: Disabling a category does not delete its products", async () => {
            // Disable the category
            const req = {
                params: { id: catWithProducts._id.toString() },
                user: { _id: new mongoose.Types.ObjectId(), email: "admin@afc.com" },
                ip: "127.0.0.1"
            };
            const res = createMockRes();
            await deleteCategory(req, res);

            assert.equal(res.statusCode, 200);

            // Check that products still exist in the database
            const productsAfter = await Product.find({ category: catWithProducts._id });
            assert.equal(productsAfter.length, 2, "Both products must still exist in the database");
            assert.equal(productsAfter[0]._id.toString(), prod1._id.toString());
            assert.equal(productsAfter[1]._id.toString(), prod2._id.toString());
        });

        it("Scenario 11b: Product count aggregation includes disabled categories for admin", async () => {
            const req = { params: { id: catWithProducts._id.toString() } };
            const res = createMockRes();

            await getCategoryWithProductCount(req, res);

            assert.equal(res.statusCode, 200);
            assert.equal(res.data.success, true);
            assert.equal(res.data.productCount, 2, "Product count should be 2 even though category is disabled");
            assert.equal(res.data.category.isActive, false);
        });
    });

    describe("9. Product Management & Category Validation (Scenario 12)", () => {
        let activeCat, inactiveCat;

        before(async () => {
            activeCat = await Category.create({
                name: "Test Active Valid Cat",
                slug: "test-active-valid-cat",
                isActive: true
            });
            inactiveCat = await Category.create({
                name: "Test Inactive Valid Cat",
                slug: "test-inactive-valid-cat",
                isActive: false
            });
        });

        it("Scenario 12: Cannot create a product under a disabled category", async () => {
            const { createProduct } = require("../src/controllers/productController");
            const req = {
                body: {
                    name: "Test Invalid Product",
                    category: inactiveCat._id.toString(),
                    priceInPaise: 10000,
                    stock: 5,
                    sku: "TEST-INVALID-PROD",
                    image: "https://example.com/inv.jpg"
                },
                user: { _id: new mongoose.Types.ObjectId(), role: "admin" }
            };
            const res = createMockRes();

            await createProduct(req, res);

            assert.equal(res.statusCode, 400);
            assert.equal(res.data.success, false);
            assert.match(res.data.message, /inactive/i);
        });

        it("Scenario 12b: Can create a product under an active category", async () => {
            const { createProduct } = require("../src/controllers/productController");
            const req = {
                body: {
                    name: "Test Valid Product",
                    category: activeCat._id.toString(),
                    priceInPaise: 12000,
                    stock: 10,
                    sku: "TEST-VALID-PROD",
                    image: "https://example.com/val.jpg"
                },
                user: { _id: new mongoose.Types.ObjectId(), role: "admin" }
            };
            const res = createMockRes();

            await createProduct(req, res);

            assert.equal(res.statusCode, 201);
            assert.equal(res.data.success, true);
            assert.equal(res.data.product.name, "Test Valid Product");
        });
    });
});
