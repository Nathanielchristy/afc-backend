const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const upload = require("../src/middleware/uploadMiddleware");
const { productCreateSchema, productUpdateSchema } = require("../src/validators/productValidator");

describe("Product Image Upload & Validation Security Suite", () => {
    describe("1. Image File Type and Extension Filtering", () => {
        it("should accept valid JPEG raster image", (t, done) => {
            const req = {};
            const file = {
                originalname: "crispy-burger.jpg",
                mimetype: "image/jpeg"
            };

            upload.fileFilter(req, file, (err, accept) => {
                assert.equal(err, null);
                assert.equal(accept, true);
                done();
            });
        });

        it("should accept valid PNG raster image", (t, done) => {
            const req = {};
            const file = {
                originalname: "chicken-bucket.png",
                mimetype: "image/png"
            };

            upload.fileFilter(req, file, (err, accept) => {
                assert.equal(err, null);
                assert.equal(accept, true);
                done();
            });
        });

        it("should accept valid WebP raster image", (t, done) => {
            const req = {};
            const file = {
                originalname: "mojito.webp",
                mimetype: "image/webp"
            };

            upload.fileFilter(req, file, (err, accept) => {
                assert.equal(err, null);
                assert.equal(accept, true);
                done();
            });
        });

        it("should reject unsafe SVG image", (t, done) => {
            const req = {};
            const file = {
                originalname: "malicious.svg",
                mimetype: "image/svg+xml"
            };

            upload.fileFilter(req, file, (err, accept) => {
                assert.ok(err, "SVG files must be rejected");
                assert.equal(accept, false);
                assert.match(err.message, /only jpeg, png, and webp/i);
                done();
            });
        });

        it("should reject executable and script extensions", (t, done) => {
            const req = {};
            const file = {
                originalname: "payload.php",
                mimetype: "application/x-php"
            };

            upload.fileFilter(req, file, (err, accept) => {
                assert.ok(err, "PHP files must be rejected");
                assert.equal(accept, false);
                done();
            });
        });

        it("should reject spoofed extension with invalid MIME type", (t, done) => {
            const req = {};
            const file = {
                originalname: "exploit.jpg",
                mimetype: "application/javascript"
            };

            upload.fileFilter(req, file, (err, accept) => {
                assert.ok(err, "MIME type mismatch must be rejected");
                assert.equal(accept, false);
                done();
            });
        });
    });

    describe("2. Product Validator Schema with Upload Paths and URLs", () => {
        it("should accept local uploaded image path (/uploads/...)", () => {
            const result = productCreateSchema.safeParse({
                body: {
                    name: "AFC Deluxe Burger",
                    description: "Juicy fried chicken patty with lettuce",
                    priceInPaise: 24900,
                    stock: 50,
                    sku: "AFC-BUR-TEST1",
                    category: "65d4a1b2c3d4e5f6a7b8c9d0",
                    images: ["/uploads/product-a1b2c3d4e5f6.jpg"]
                },
                params: {},
                query: {}
            });

            assert.equal(result.success, true, "Product schema should accept relative upload paths");
        });

        it("should accept existing external image URLs", () => {
            const result = productCreateSchema.safeParse({
                body: {
                    name: "AFC Classic Wings",
                    description: "Crispy chicken wings",
                    priceInPaise: 19900,
                    stock: 40,
                    sku: "AFC-WNG-TEST1",
                    category: "65d4a1b2c3d4e5f6a7b8c9d0",
                    images: ["https://images.unsplash.com/photo-1569058242253-92a9c755a0ec"]
                },
                params: {},
                query: {}
            });

            assert.equal(result.success, true, "Product schema should accept existing external URLs");
        });

        it("should validate and preserve update product schema with image paths", () => {
            const result = productUpdateSchema.safeParse({
                body: {
                    images: ["/uploads/product-updated.webp"]
                },
                params: {
                    id: "65d4a1b2c3d4e5f6a7b8c9d0"
                },
                query: {}
            });

            assert.equal(result.success, true, "Product update schema should accept updated images");
        });
    });
});
