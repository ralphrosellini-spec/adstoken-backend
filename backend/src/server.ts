import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import stakingRoutes from "./routes/staking.routes";
import { swaggerDocument } from "./docs/swagger";
import { CronService } from "./services/cron.service";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API Documentation
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    service: "ADSToken v2.0 Staking & Ecosystem API",
    timestamp: new Date().toISOString(),
    cronActive: true,
  });
});

// Staking & Ecosystem Routes
app.use("/api/staking", stakingRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: err.message || "Internal server error" });
});

// Start Cron Service
CronService.init();

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 ADSToken v2.0 API Server running on port ${PORT}`);
  console.log(`📖 Swagger API Docs:  http://localhost:${PORT}/api/docs`);
  console.log(`⚡ Health Endpoint:   http://localhost:${PORT}/api/health`);
  console.log(`=======================================================`);
});

export default app;
