import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import webpush from "web-push";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const publicVapidKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
  let vapidEmail = process.env.VAPID_EMAIL || "admin@visaexpert.com";

  // Ensure vapidEmail is a valid mailto: or http(s) URL
  if (!vapidEmail.startsWith("mailto:") && !vapidEmail.startsWith("http")) {
    // Basic cleanup: if it contains a ":", take what's after it as the email
    if (vapidEmail.includes(":")) {
      vapidEmail = vapidEmail.split(":").pop()?.trim() || vapidEmail;
    }
    vapidEmail = `mailto:${vapidEmail}`;
  }

  if (publicVapidKey && privateVapidKey) {
    try {
      webpush.setVapidDetails(vapidEmail, publicVapidKey, privateVapidKey);
      console.log("VAPID details set successfully for", vapidEmail);
    } catch (error) {
      console.error("Critical error setting VAPID details:", error);
      console.warn("Push notifications will not work until VAPID keys are fixed in environment variables.");
    }
  } else {
    console.warn("VAPID keys not set. Push notifications will not work.");
  }

  // API Routes
  app.post("/api/notifications/subscribe", (req, res) => {
    const subscription = req.body;
    // In a real app, you would save this to a database (e.g. Firestore)
    // For this implementation, we will acknowledge the subscription
    console.log("New subscription received:", subscription);
    res.status(201).json({});
  });

  app.post("/api/notifications/send", async (req, res) => {
    const { subscription, title, body } = req.body;
    
    const payload = JSON.stringify({
      title: title || "Actualización de Visa",
      body: body || "Hay una novedad en su trámite.",
      icon: "/globe.png"
    });

    try {
      await webpush.sendNotification(subscription, payload);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error sending notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
