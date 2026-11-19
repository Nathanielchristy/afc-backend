const { z } = require("zod");

const registerSchema = z.object({
    body: z
        .object({
            name: z
                .string()
                .trim()
                .min(2, "Name must be at least 2 characters")
                .max(100, "Name cannot exceed 100 characters"),

            email: z
                .string()
                .trim()
                .toLowerCase()
                .email("Invalid email address")
                .max(254, "Email is too long"),

            password: z
                .string()
                .min(8, "Password must be at least 8 characters")
                .max(128, "Password cannot exceed 128 characters")
        })
        .strict(),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

const loginSchema = z.object({
    body: z
        .object({
            phone: z
                .string()
                .trim()
                .min(10, "Phone number must be at least 10 digits")
                .max(15, "Phone number is too long")
                .regex(/^[0-9+\-\s()]+$/, "Phone number contains invalid characters"),

            password: z
                .string()
                .min(1, "Password is required")
                .max(128, "Password is too long")
        })
        .strict(),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

const verifyEmailOtpSchema = z.object({
    body: z
        .object({
            email: z
                .string()
                .trim()
                .toLowerCase()
                .email("Invalid email address")
                .max(254, "Email is too long"),

            otp: z
                .string()
                .trim()
                .regex(/^\d{6}$/, "OTP must be a 6-digit number")
        })
        .strict(),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

const resendOtpSchema = z.object({
    body: z
        .object({
            email: z
                .string()
                .trim()
                .toLowerCase()
                .email("Invalid email address")
                .max(254, "Email is too long")
        })
        .strict(),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

const forgotPasswordSchema = z.object({
    body: z
        .object({
            phone: z.string().trim().optional(),
            email: z
                .string()
                .trim()
                .toLowerCase()
                .max(254, "Email is too long")
                .optional()
        })
        .refine(data => data.phone || data.email, {
            message: "Phone number or email is required"
        })
        .strict(),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

const verifyResetOtpSchema = z.object({
    body: z
        .object({
            phone: z.string().trim().optional(),
            email: z.string().trim().toLowerCase().optional(),

            otp: z
                .string()
                .trim()
                .regex(/^\d{6}$/, "OTP must be a 6-digit number")
        })
        .refine(data => data.phone || data.email, {
            message: "Phone number or email is required"
        })
        .strict(),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

const resetPasswordSchema = z.object({
    body: z
        .object({
            phone: z.string().trim().optional(),
            email: z.string().trim().toLowerCase().optional(),

            otp: z
                .string()
                .trim()
                .regex(/^\d{6}$/, "OTP must be a 6-digit number"),

            newPassword: z
                .string()
                .min(8, "Password must be at least 8 characters")
                .max(128, "Password cannot exceed 128 characters")
        })
        .refine(data => data.phone || data.email, {
            message: "Phone number or email is required"
        })
        .strict(),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

const adminLoginSchema = z.object({
    body: z
        .object({
            email: z
                .string()
                .trim()
                .toLowerCase()
                .email("Invalid email address")
                .max(254, "Email is too long"),

            password: z
                .string()
                .min(1, "Password is required")
                .max(128, "Password is too long")
        })
        .strict(),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

const kitchenLoginSchema = adminLoginSchema;

const changePasswordSchema = z.object({
    body: z
        .object({
            currentPassword: z.string().optional(),
            newPassword: z
                .string()
                .min(8, "Password must be at least 8 characters")
                .max(128, "Password cannot exceed 128 characters")
        })
        .strict(),

    params: z.object({}).strict(),

    query: z.object({}).strict()
});

module.exports = {
    registerSchema,
    loginSchema,
    adminLoginSchema,
    kitchenLoginSchema,
    verifyEmailOtpSchema,
    resendOtpSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    changePasswordSchema
};
