import "dotenv/config";
import express from "express";
import cors from "cors";
import { connect } from "./db";
import { publicRouter } from "./routes/public";
import { adminRouter } from "./routes/admin";

const app = express();

app.use(express.json({ limit: "1mb" }));

const allowed = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin/curl requests arrive without an Origin header.
      if (!origin || allowed.includes("*") || allowed.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
  })
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api", publicRouter);
app.use("/api/admin", adminRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const port = Number(process.env.PORT || 4000);

connect()
  .then(() => {
    app.listen(port, () => console.log(`[server] listening on :${port}`));
  })
  .catch((err) => {
    console.error("[startup] failed to connect to MongoDB:", err);
    process.exit(1);
  });
