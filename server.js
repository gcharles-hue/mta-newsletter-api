const express = require("express");
const axios = require("axios");
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");
const Redis = require("ioredis");

const app = express();
const PORT = process.env.PORT || 10000;

// 🔑 Add your MTA API key later
const MTA_API_KEY = process.env.MTA_API_KEY;

// Redis (we’ll plug this later)
let redis;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
}

// Example feed (A/C/E)
const FEED_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace";

// Simple classifier
function classify(text) {
  text = text.toLowerCase();

  if (text.includes("suspend")) return "SUSPENDED";
  if (text.includes("delay") || text.includes("slow")) return "DELAYS";
  return "GOOD SERVICE";
}

// Fetch + decode MTA
async function fetchMTA() {
  const res = await axios.get(FEED_URL, {
    responseType: "arraybuffer",
    headers: {
      "x-api-key": MTA_API_KEY
    }
  });

  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(res.data)
  );

  let status = "GOOD SERVICE";

  feed.entity.forEach(entity => {
    if (entity.alert) {
      const text =
        entity.alert.headerText?.translation?.[0]?.text || "";

      const result = classify(text);

      if (result === "SUSPENDED") status = "SUSPENDED";
      else if (result === "DELAYS" && status !== "SUSPENDED") status = "DELAYS";
    }
  });

  return {
    updatedAt: new Date().toISOString(),
    line: "ACE",
    status
  };
}

// Routes
app.get("/", (req, res) => {
  res.send("MTA API is running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/status.json", async (req, res) => {
  try {
    // Try cache first
    if (redis) {
      const cached = await redis.get("mta:status");
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    }

    const data = await fetchMTA();

    if (redis) {
      await redis.set("mta:status", JSON.stringify(data), "EX", 60);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch MTA data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
