const { z } = require("zod");

const objectIdRegex = /^[a-f\d]{24}$/i;

const productCreateSchema = z.object({
    body: z
        .object({
            name: z
                .string()
                .trim()
                .min(2, "Product name must be at least 2 characters")
                .max(200, "Product name cannot exceed 200 characters"),

            description: z
                .string()
                .trim()
                .min(1, "Product description is required")
                .max(5000, "Product description cannot exceed 5000 characters"),

            priceInPaise: z
                .number()
                .int("Price must be a whole number of paise")
                .min(0, "Price cannot be negative")
                .max(100000000000, "Price is too large")
                .optional(),

            stock: z
                .number()
                .int("Stock must be a whole number")
                .min(0, "Stock cannot be negative")
                .max(1000000, "Stock is too large")
                .optional(),

            sku: z
                .string()
                .trim()
                .toUpperCase()
                .min(2, "SKU must be at least 2 characters")
                .max(100, "SKU cannot exceed 100 characters")
                .optional(),

            category: z
                .string()
                .regex(objectIdRegex, "Invalid category ID"),

            images: z
                .array(
                    z
                        .string()
                        .trim()
                        .max(2048, "Image path or URL is too long")
                )
                .max(10, "A product cannot have more than 10 images")
                .optional(),

            isActive: z
                .boolean()
                .optional(),

            variants: z
                .array(
                    z.object({
                        name: z.string().min(1),
                        sku: z.string().min(1),
                        priceInPaise: z.number().int().min(0),
                        isActive: z.boolean().optional()
                    })
                )
                .optional()
        })
        .strict(),

    params: z.object({}).strict(),
    query: z.object({}).strict()
});

const productUpdateSchema = z.object({
    body: z
        .object({
            name: z
                .string()
                .trim()
                .min(2)
                .max(200)
                .optional(),

            description: z
                .string()
                .trim()
                .min(1)
                .max(5000)
                .optional(),

            priceInPaise: z
                .number()
                .int("Price must be a whole number of paise")
                .min(0)
                .max(100000000000)
                .optional(),

            stock: z
                .number()
                .int("Stock must be a whole number")
                .min(0)
                .max(1000000)
                .optional(),

            sku: z
                .string()
                .trim()
                .toUpperCase()
                .min(2)
                .max(100)
                .optional(),

            category: z
                .string()
                .regex(objectIdRegex, "Invalid category ID")
                .optional(),

            images: z
                .array(
                    z
                        .string()
                        .trim()
                        .max(2048)
                )
                .max(10)
                .optional(),

            isActive: z
                .boolean()
                .optional(),

            variants: z
                .array(
                    z.object({
                        name: z.string().min(1),
                        sku: z.string().min(1),
                        priceInPaise: z.number().int().min(0),
                        isActive: z.boolean().optional()
                    })
                )
                .optional()
        })
        .strict(),

    params: z.object({
        id: z
            .string()
            .regex(objectIdRegex, "Invalid product ID")
    }).strict(),

    query: z.object({}).strict()
});

const productIdSchema = z.object({
    body: z
        .object({})
        .strict()
        .optional(),

    params: z.object({
        id: z
            .string()
            .regex(objectIdRegex, "Invalid product ID")
    }).strict(),

    query: z.object({}).strict()
});

const productListSchema = z.object({
    body: z.object({}).strict().optional(),

    params: z.object({}).strict(),

    query: z.object({
        page: z
            .coerce
            .number()
            .int("Page must be a whole number")
            .min(1, "Page must be at least 1")
            .max(100000, "Page is too large")
            .default(1),

        limit: z
            .coerce
            .number()
            .int("Limit must be a whole number")
            .min(1, "Limit must be at least 1")
            .max(500, "Limit cannot exceed 500")
            .default(20),

        search: z
            .string()
            .trim()
            .max(100, "Search is too long")
            .optional(),

        category: z
            .string()
            .regex(objectIdRegex, "Invalid category ID")
            .optional(),

        sort: z
            .enum([
                "newest",
                "oldest",
                "price_asc",
                "price_desc",
                "name_asc",
                "name_desc"
            ])
            .default("newest")
    }).strict()
});



module.exports = {
    productCreateSchema,
    productUpdateSchema,
    productIdSchema,
    productListSchema
};