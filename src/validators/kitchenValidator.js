const { z } = require("zod");

const objectIdRegex = /^[a-f\d]{24}$/i;

const kitchenOrderIdSchema = z.object({
    body: z.object({}).strict().optional(),
    params: z.object({
        id: z.string().regex(objectIdRegex, "Invalid order ID")
    }).strict(),
    query: z.object({}).strict()
});

const updateKitchenStatusSchema = z.object({
    body: z.object({
        status: z.enum([
            "confirmed",
            "processing",
            "shipped",
            "delivered"
        ])
    }).strict(),
    params: z.object({
        id: z.string().regex(objectIdRegex, "Invalid order ID")
    }).strict(),
    query: z.object({}).strict()
});

const getKitchenOrdersSchema = z.object({
    body: z.object({}).strict().optional(),
    params: z.object({}).strict(),
    query: z.object({
        status: z.enum([
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
            "active",
            "all"
        ]).optional(),
        page: z.string().regex(/^\d+$/).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        search: z.string().max(100).optional()
    }).passthrough()
});

module.exports = {
    kitchenOrderIdSchema,
    updateKitchenStatusSchema,
    getKitchenOrdersSchema
};
