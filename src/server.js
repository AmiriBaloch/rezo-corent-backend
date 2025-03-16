import dotenv from "dotenv";
import app from "./config/app.js";

dotenv.config();
const PORT = process.env.PORT || 5000;

app.listen(PORT, () =>
  console.log(`
    🚀 Server running on port ${PORT}
    visit link below to see the app
    🌐 http://localhost:${PORT}
    `)
);
