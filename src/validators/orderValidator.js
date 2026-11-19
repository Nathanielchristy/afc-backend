const { z } = require("zod");

const objectIdRegex = /^[a-f\d]{24}$/i;

const orderIdSchema = z.object({
    body: z.object({}).strict().optional(),

    params: z.object({
        id: z.string().regex(objectIdRegex, "Invalid order ID")
    }).strict(),

    query: z.object({}).strict()
});

const getOrdersQuerySchema = z.object({
    body: z.object({}).strict().optional(),
    params: z.object({}).strict(),
    query: z.object({
        page: z.string().optional(),
        limit: z.string().optional()
    }).passthrough()
});

const emptyRequestSchema = z.object({
    body: z.object({}).strict().optional(),
    params: z.object({}).strict(),
    query: z.object({}).strict()
});

const updateOrderStatusSchema = z.object({
    body: z.object({
        status: z.enum([
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled"
        ]).optional(),
        paymentStatus: z.enum([
            "pending",
            "paid",
            "failed",
            "refunded"
        ]).optional()
    }).refine(data => data.status !== undefined || data.paymentStatus !== undefined, {
        message: "Either status or paymentStatus must be provided"
    }),
    params: z.object({
        id: z.string().regex(objectIdRegex, "Invalid order ID")
    }).strict(),
    query: z.object({}).strict()
});

const createOrderSchema = z.object({
    body: z.object({
        addressId: z.string().regex(objectIdRegex, "Invalid address ID").optional(),
        orderType: z.enum(["pickup", "delivery"]).optional().default("pickup"),
        pickupLocation: z.string().optional().default("Noorul Islam College"),
        fullName: z.string().trim().min(1).max(100).optional(),
        phone: z.string().trim().min(1).max(20).optional(),
        email: z.string().trim().email().optional().or(z.literal("")),
        paymentMethod: z.enum(["upi", "card", "cod"]).optional().default("upi")
    }).passthrough().superRefine((data, ctx) => {
        if (data.couponCode || data.coupon) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "No promotional discounts or coupon codes are currently active",
                path: ["couponCode"]
            });
        }
        if (data.discount !== undefined || data.discountInPaise !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Arbitrary or frontend-supplied discounts are not accepted",
                path: ["discount"]
            });
        }
    }),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

const cancelOrderSchema = z.object({
    body: z.object({
        reason: z.string().trim().min(1, "Cancellation reason is required").max(500, "Reason must be 500 characters or less"),
        overrideReason: z.string().trim().min(1).max(500).optional()
    }),

    params: z.object({
        id: z.string().regex(objectIdRegex, "Invalid order ID")
    }).strict(),

    query: z.object({}).strict().optional()
});

module.exports = {
    createOrderSchema,
    orderIdSchema,
    emptyRequestSchema,
    getOrdersQuerySchema,
    updateOrderStatusSchema,
    cancelOrderSchema
};
