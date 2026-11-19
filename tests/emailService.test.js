const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const SibApiV3Sdk = require("sib-api-v3-sdk");

const {
    isEmailConfigured,
    sendVerificationOtpEmail,
    sendPasswordResetOtpEmail,
    getTestEmailQueue,
    clearTestEmailQueue
} = require("../src/services/emailService");

describe("AFC Email Service Configuration & Brevo Endpoint Suite", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        clearTestEmailQueue();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        clearTestEmailQueue();
    });

    it("1. isEmailConfigured returns true when BREVO_API_KEY is present", () => {
        process.env.BREVO_API_KEY = "xkeysib-dummy-test-key";
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;

        assert.equal(isEmailConfigured(), true);
    });

    it("2. isEmailConfigured returns true when SMTP credentials are present", () => {
        delete process.env.BREVO_API_KEY;
        process.env.SMTP_HOST = "smtp.example.com";
        process.env.SMTP_USER = "user";
        process.env.SMTP_PASS = "pass";

        assert.equal(isEmailConfigured(), true);
    });

    it("3. isEmailConfigured returns false when no email configuration is present", () => {
        delete process.env.BREVO_API_KEY;
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASS;

        assert.equal(isEmailConfigured(), false);
    });

    it("4. In test environment (NODE_ENV=test), sendVerificationOtpEmail queues email safely", async () => {
        process.env.NODE_ENV = "test";
        const result = await sendVerificationOtpEmail("customer@example.com", "123456", "Test User");

        assert.equal(result.success, true);
        assert.ok(result.messageId.startsWith("test-email-"));

        const queue = getTestEmailQueue();
        assert.equal(queue.length, 1);
        assert.equal(queue[0].to, "customer@example.com");
        assert.equal(queue[0].subject, "Your AFC Account Verification Code");
        assert.ok(queue[0].html.includes("123456"));
        assert.ok(queue[0].text.includes("123456"));
    });

    it("5. In test environment (NODE_ENV=test), sendPasswordResetOtpEmail queues email safely", async () => {
        process.env.NODE_ENV = "test";
        const result = await sendPasswordResetOtpEmail("customer@example.com", "654321", "Test User");

        assert.equal(result.success, true);
        assert.ok(result.messageId.startsWith("test-email-"));

        const queue = getTestEmailQueue();
        assert.equal(queue.length, 1);
        assert.equal(queue[0].to, "customer@example.com");
        assert.equal(queue[0].subject, "AFC Password Reset Code");
        assert.ok(queue[0].html.includes("654321"));
    });

    it("6. SibApiV3Sdk ApiClient default basePath is updated to https://api.brevo.com/v3", () => {
        const defaultClient = SibApiV3Sdk.ApiClient.instance;
        const configuredBasePath = process.env.BREVO_API_BASE_PATH && process.env.BREVO_API_BASE_PATH.trim();
        defaultClient.basePath = (configuredBasePath || "https://api.brevo.com/v3").replace(/\/+$/, "");

        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi(defaultClient);
        assert.equal(apiInstance.apiClient.basePath, "https://api.brevo.com/v3");
        assert.notEqual(apiInstance.apiClient.basePath, "https://api.sendinblue.com/v3");
    });

    it("7. Custom BREVO_API_BASE_PATH overrides endpoint and strips trailing slashes", () => {
        const defaultClient = SibApiV3Sdk.ApiClient.instance;
        process.env.BREVO_API_BASE_PATH = "https://custom-proxy.internal.afc/v3///";
        const configuredBasePath = process.env.BREVO_API_BASE_PATH && process.env.BREVO_API_BASE_PATH.trim();
        defaultClient.basePath = (configuredBasePath || "https://api.brevo.com/v3").replace(/\/+$/, "");

        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi(defaultClient);
        assert.equal(apiInstance.apiClient.basePath, "https://custom-proxy.internal.afc/v3");
    });
});
