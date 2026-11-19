const crypto = require("crypto");
const axios = require("axios");

const getPineLabsConfig = () => {
    const merchantId = process.env.PINELABS_MERCHANT_ID || "test_merchant";
    const clientId = process.env.PINELABS_CLIENT_ID || "test_client_id";
    const clientSecret = process.env.PINELABS_CLIENT_SECRET || "test_client_secret";
    const environment = process.env.PINELABS_ENVIRONMENT || "uat";
    const webhookSecret = process.env.PINELABS_WEBHOOK_SECRET || clientSecret;

    const baseUrl = environment === "production"
        ? "https://api.pluralonline.com"
        : "https://pluraluat.pinelabs.com";

    return {
        merchantId,
        clientId,
        clientSecret,
        environment,
        baseUrl,
        webhookSecret
    };
};

const hasPineLabsCredentials = () => {
    return Boolean(
        process.env.PINELABS_CLIENT_ID &&
        process.env.PINELABS_CLIENT_SECRET &&
        process.env.PINELABS_CLIENT_ID !== "test_client_id"
    );
};

const createPineLabsOrder = async ({
    amountInPaise,
    currency = "INR",
    receipt,
    customer = {}
}) => {
    if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
        throw new Error("Invalid payment amount");
    }

    if (currency !== "INR") {
        throw new Error("Unsupported payment currency");
    }

    if (!receipt || typeof receipt !== "string") {
        throw new Error("Invalid payment receipt");
    }

    const config = getPineLabsConfig();

    // If credentials are not configured, return a simulated UAT hosted checkout response
    if (!hasPineLabsCredentials()) {
        const simulatedOrderId = `pl_order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        return {
            id: simulatedOrderId,
            order_id: simulatedOrderId,
            amount: amountInPaise,
            currency,
            status: "CREATED",
            payment_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/checkout?simulated_payment=true&order_id=${simulatedOrderId}`
        };
    }

    try {
        // Real Pine Labs Plural API integration
        // 1. Get OAuth Token if required by Plural API
        const tokenRes = await axios.post(`${config.baseUrl}/oauth/token`, {
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: "client_credentials"
        }, {
            headers: { "Content-Type": "application/json" }
        });

        const accessToken = tokenRes.data?.access_token;

        // 2. Create Order / Payment Session
        const orderRes = await axios.post(`${config.baseUrl}/api/v1/orders`, {
            merchant_id: config.merchantId,
            order_id: receipt,
            amount: amountInPaise,
            currency_code: currency,
            customer: {
                name: customer.name || "Customer",
                email: customer.email || "customer@college.edu",
                phone: customer.phone || "9999999999"
            },
            redirect_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/checkout/verify`
        }, {
            headers: {
                "Content-Type": "application/json",
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
            }
        });

        return {
            id: orderRes.data.order_id || receipt,
            order_id: orderRes.data.order_id || receipt,
            amount: amountInPaise,
            currency,
            status: orderRes.data.status || "CREATED",
            payment_url: orderRes.data.payment_url || orderRes.data.redirect_url
        };
    } catch (error) {
        console.error("Pine Labs Order creation error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to create Pine Labs payment order");
    }
};

const createPineLabsRefund = async ({
    providerPaymentId,
    amountInPaise,
    receipt
}) => {
    if (!providerPaymentId || typeof providerPaymentId !== "string") {
        throw new Error("Invalid payment ID for refund");
    }

    const config = getPineLabsConfig();

    if (!hasPineLabsCredentials()) {
        return {
            id: `pl_refund_${Date.now()}`,
            status: "SUCCESS",
            amount: amountInPaise
        };
    }

    try {
        const refundRes = await axios.post(`${config.baseUrl}/api/v1/refunds`, {
            merchant_id: config.merchantId,
            payment_id: providerPaymentId,
            amount: amountInPaise,
            receipt_id: receipt || `refund_${Date.now()}`
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        });

        return refundRes.data;
    } catch (error) {
        console.error("Pine Labs Refund error:", error.response?.data || error.message);
        throw new Error(error.response?.data?.message || "Failed to process Pine Labs refund");
    }
};

const verifyPineLabsWebhookSignature = ({ rawBody, signature }) => {
    const config = getPineLabsConfig();
    if (!config.webhookSecret || !signature) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac("sha256", config.webhookSecret)
        .update(typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody))
        .digest("hex");

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
};

module.exports = {
    createPineLabsOrder,
    createPineLabsRefund,
    verifyPineLabsWebhookSignature,
    hasPineLabsCredentials
};
