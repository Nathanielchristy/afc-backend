const mongoose = require("mongoose");
require("dotenv").config({ path: "./.env" });

async function dropSpecificCol() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await mongoose.connection.dropCollection("products");
    console.log("Products collection dropped.");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
dropSpecificCol();