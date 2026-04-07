const express = require("express");
const axios = require("axios");
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");

const app = express();
const PORT = process.env.PORT || 10000;

const FEED_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts";

const ALL_LINES = [
  "A","C","E","B","D","F","M","G","J","Z",
  "N","Q","R","W","L","1","2","3","4","5","6","7"
];

function classify(text) {
  text = (text || "").toLowerCase();

  if (
    text.includes("suspend") ||
    text.includes("no trains") ||
    text.includes("part suspended")
  ) {
    return "SUSPENDED";
  }

  if (
    text.includes("delay") ||
    text.includes("slow") ||
    text.includes("signal") ||
    text.includes("train traffic") ||
    text.includes("reroute") ||
    text.includes("reduced service")
  ) {
    return "DELAYS";
  }

  return "GOOD SERVICE";
}

async function fetchMTA() {
  const res = await axios.get(FEED_URL, {
    responseType: "arraybuffer",
    timeout: 15000
  });

  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(res.data)
  );

  const lineStatus = {};
  ALL_LINES.forEach((line) => {
    lineStatus[line] = "GOOD SERVICE";
  });

  for (const entity of feed.entity || []) {
    if (!entity.alert) continue;

    const text =
      entity.alert.headerText?.translation?.[0]?.text ||
      entity.alert.descriptionText?.translation?.[0]?.text ||
      "";

    const status = classify(text);

    for (const line of ALL_LINES) {
      const regex = new RegExp(`\\b${line}\\b`, "i");

      if (regex.test(text)) {
        if (status === "SUSPENDED") {
          lineStatus[line] = "SUSPENDED";
        } else if (
          status === "DELAYS" &&
          lineStatus[line] !== "SUSPENDED"
        ) {
          lineStatus[line] = "DELAYS";
        }
      }
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    grouped: {
      "GOOD SERVICE": Object.keys(lineStatus).filter(
        (line) => lineStatus[line] === "GOOD SERVICE"
      ),
      "DELAYS": Object.keys(lineStatus).filter(
        (line) => lineStatus[line] === "DELAYS"
      ),
      "SUSPENDED": Object.keys(lineStatus).filter(
        (line) => lineStatus[line] === "SUSPENDED"
      )
    }
  };
}

app.get("/", (req, res) => {
  res.send("MTA API is running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/status.json", async (req, res) => {
  try {
    const data = await fetchMTA();
    res.json(data);
  } catch (error) {
    console.error("status.json error:", error.message);
    res.status(500).json({
      error: "Failed to fetch MTA data",
      details: error.message
    });
  }
});

app.get("/status-snippet", async (req, res) => {
  try {
    const data = await fetchMTA();

    const good = data.grouped["GOOD SERVICE"].join(", ");
    const delays = data.grouped["DELAYS"].join(", ");
    const suspended = data.grouped["SUSPENDED"].join(", ");

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;">
        <strong>NYC Subway Status</strong><br><br>

        <span style="color:green;"><strong>Good Service:</strong></span> ${good || "None"}<br>
        <span style="color:orange;"><strong>Delays:</strong></span> ${delays || "None"}<br>
        <span style="color:#8B0000;"><strong>Suspended:</strong></span> ${suspended || "None"}<br><br>

        <small>Updated: ${new Date(data.updatedAt).toLocaleTimeString()}</small>
      </div>
    `;

    res.send(html);
  } catch (err) {
    res.status(500).send("Failed to load status");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
