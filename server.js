require("dotenv").config();

const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();

    // Seed default policy page content (no-op if already seeded)
    const { seedDefaults } = require('./src/controllers/siteContentController');
    await seedDefaults().catch(err =>
        console.error('[SiteContent] Seed error (non-fatal):', err.message)
    );

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
};

startServer();