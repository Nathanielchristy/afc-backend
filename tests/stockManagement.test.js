const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');
const Order = require('../src/models/new/Order');
const {
    getDashboardMetrics,
    getAdminProducts,
    adminUpdateProduct,
    adminUpdateProductStock,
    adminBulkUpdateStock
} = require('../src/controllers/adminController');

describe('AFC Stock Management & Inventory Accuracy Suite', () => {
    let testCategory;
    let testProduct1;
    let testProduct2;

    before(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/afc");
        }

        testCategory = await Category.create({
            name: 'Stock Test Category ' + Date.now(),
            slug: 'stock-test-' + Date.now(),
            isActive: true
        });

        testProduct1 = await Product.create({
            name: 'Chicken Burger Test ' + Date.now(),
            category: testCategory._id,
            priceInPaise: 15000,
            stock: 25,
            sku: 'STK-' + Date.now() + '-1'
        });

        testProduct2 = await Product.create({
            name: 'Fries Test ' + Date.now(),
            category: testCategory._id,
            priceInPaise: 8000,
            stock: 3, // Low stock <= 5
            sku: 'STK-' + Date.now() + '-2'
        });
    });

    after(async () => {
        if (testCategory) await Category.deleteOne({ _id: testCategory._id });
        if (testProduct1) await Product.deleteOne({ _id: testProduct1._id });
        if (testProduct2) await Product.deleteOne({ _id: testProduct2._id });
        await mongoose.disconnect();
    });

    test('1. getAdminProducts returns valid non-negative integer stock for all products', async () => {
        const req = {
            query: { page: 1, limit: 10 }
        };
        let responseData = null;
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            }
        };

        await getAdminProducts(req, res);

        assert.equal(statusCode, 200);
        assert.equal(responseData.success, true);
        assert.ok(Array.isArray(responseData.products));
        for (const p of responseData.products) {
            assert.ok(typeof p.stock === 'number', `Product ${p.name} stock should be a number`);
            assert.ok(p.stock >= 0, `Product ${p.name} stock should be non-negative`);
            assert.ok(Number.isInteger(p.stock), `Product ${p.name} stock should be an integer`);
        }
    });

    test('2. adminUpdateProductStock updates product stock directly', async () => {
        const req = {
            params: { id: testProduct1._id.toString() },
            body: { stock: 40 },
            user: { _id: new mongoose.Types.ObjectId(), email: 'admin@afc.com' },
            ip: '127.0.0.1'
        };
        let responseData = null;
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            }
        };

        await adminUpdateProductStock(req, res);

        assert.equal(statusCode, 200);
        assert.equal(responseData.success, true);
        assert.equal(responseData.product.stock, 40);

        const refreshed = await Product.findById(testProduct1._id);
        assert.equal(refreshed.stock, 40);
    });

    test('3. adminUpdateProductStock updates stock with delta adjustment (+15)', async () => {
        const req = {
            params: { id: testProduct1._id.toString() },
            body: { delta: 15 },
            user: { _id: new mongoose.Types.ObjectId(), email: 'admin@afc.com' },
            ip: '127.0.0.1'
        };
        let responseData = null;
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            }
        };

        await adminUpdateProductStock(req, res);

        assert.equal(statusCode, 200);
        assert.equal(responseData.success, true);
        assert.equal(responseData.product.stock, 55); // 40 + 15
    });

    test('4. adminUpdateProductStock clamps negative delta to 0 (floor bound)', async () => {
        const req = {
            params: { id: testProduct1._id.toString() },
            body: { delta: -100 }, // Current stock is 55
            user: { _id: new mongoose.Types.ObjectId(), email: 'admin@afc.com' },
            ip: '127.0.0.1'
        };
        let responseData = null;
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            }
        };

        await adminUpdateProductStock(req, res);

        assert.equal(statusCode, 200);
        assert.equal(responseData.success, true);
        assert.equal(responseData.product.stock, 0); // Clamped to 0, not -45
    });

    test('5. adminUpdateProduct allows updating stock and price without legacy image/sku errors', async () => {
        const req = {
            params: { id: testProduct1._id.toString() },
            body: {
                name: testProduct1.name + ' Updated',
                stock: 75,
                priceInPaise: 16000
            },
            user: { _id: new mongoose.Types.ObjectId(), email: 'admin@afc.com' },
            ip: '127.0.0.1'
        };
        let responseData = null;
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            }
        };

        await adminUpdateProduct(req, res);

        assert.equal(statusCode, 200);
        assert.equal(responseData.success, true);
        assert.equal(responseData.product.stock, 75);
        assert.equal(responseData.product.priceInPaise, 16000);
    });

    test('6. getDashboardMetrics accurately reports lowStockProducts and outOfStockProducts', async () => {
        // Ensure testProduct1 is out of stock (0) and testProduct2 is low stock (3)
        await Product.updateOne({ _id: testProduct1._id }, { $set: { stock: 0 } });
        await Product.updateOne({ _id: testProduct2._id }, { $set: { stock: 3 } });

        const req = {};
        let responseData = null;
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            }
        };

        await getDashboardMetrics(req, res);

        assert.equal(statusCode, 200);
        assert.equal(responseData.success, true);
        assert.ok(responseData.metrics.outOfStockProducts >= 1);
        assert.ok(responseData.metrics.lowStockProducts >= 1);
    });

    test('7. adminBulkUpdateStock "set" mode sets all matching category products to exact value', async () => {
        const req = {
            body: {
                mode: 'set',
                value: 65,
                category: testCategory._id.toString()
            },
            user: { _id: new mongoose.Types.ObjectId(), email: 'admin@afc.com' },
            ip: '127.0.0.1'
        };
        let responseData = null;
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            }
        };

        await adminBulkUpdateStock(req, res);

        assert.equal(statusCode, 200);
        assert.equal(responseData.success, true);
        assert.equal(responseData.modifiedCount, 2);

        const [p1, p2] = await Promise.all([
            Product.findById(testProduct1._id),
            Product.findById(testProduct2._id)
        ]);
        assert.equal(p1.stock, 65);
        assert.equal(p2.stock, 65);
    });

    test('8. adminBulkUpdateStock "add" mode increments matching products inventory', async () => {
        const req = {
            body: {
                mode: 'add',
                value: 15,
                category: testCategory._id.toString()
            },
            user: { _id: new mongoose.Types.ObjectId(), email: 'admin@afc.com' },
            ip: '127.0.0.1'
        };
        let responseData = null;
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            }
        };

        await adminBulkUpdateStock(req, res);

        assert.equal(statusCode, 200);
        assert.equal(responseData.success, true);
        assert.equal(responseData.modifiedCount, 2);

        const [p1, p2] = await Promise.all([
            Product.findById(testProduct1._id),
            Product.findById(testProduct2._id)
        ]);
        assert.equal(p1.stock, 80); // 65 + 15
        assert.equal(p2.stock, 80); // 65 + 15
    });

    test('9. adminBulkUpdateStock validates invalid modes and inputs', async () => {
        const req = {
            body: {
                mode: 'invalid_mode',
                value: 'not-a-number'
            }
        };
        let responseData = null;
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseData = data; }
                };
            }
        };

        await adminBulkUpdateStock(req, res);

        assert.equal(statusCode, 400);
        assert.equal(responseData.success, false);
    });
});
