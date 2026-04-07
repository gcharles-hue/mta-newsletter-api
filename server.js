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

  // Strong suspend only
  if (
    text.includes("trains are not running") ||
    text.includes("no trains running") ||
    text.includes("service is suspended")
  ) {
    return "SUSPENDED";
  }

  // Delay / disruption
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



const { createCanvas } = require("canvas");

app.get("/status-image.png", async (req, res) => {
  try {
    const data = await fetchMTA();

    const width = 600;
    const height = 250;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#000";
    ctx.font = "bold 22px Arial";
    ctx.fillText("NYC Subway Status", 20, 40);

    ctx.font = "18px Arial";

    // Good Service
    ctx.fillStyle = "green";
    ctx.fillText(
      `Good: ${data.grouped["GOOD SERVICE"].join(", ") || "None"}`,
      20,
      90
    );

    // Delays
    ctx.fillStyle = "orange";
    ctx.fillText(
      `Delays: ${data.grouped["DELAYS"].join(", ") || "None"}`,
      20,
      140
    );

    // Suspended
    ctx.fillStyle = "#8B0000";
    ctx.fillText(
      `Suspended: ${data.grouped["SUSPENDED"].join(", ") || "None"}`,
      20,
      190
    );

    res.setHeader("Content-Type", "image/png");
    canvas.createPNGStream().pipe(res);
  } catch (err) {
    res.status(500).send("Error generating image");
  }
});

app.get("/status-image.svg", async (req, res) => {
  try {
    const data = await fetchMTA();

    const updated = new Date(data.updatedAt).toLocaleTimeString();

    // MTA colors
    const COLORS = {
      A: "#0039A6", C: "#0039A6", E: "#0039A6",
      B: "#FF6319", D: "#FF6319", F: "#FF6319", M: "#FF6319",
      G: "#6CBE45",
      J: "#996633", Z: "#996633",
      N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A",
      L: "#A7A9AC",
      "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
      "4": "#00933C", "5": "#00933C", "6": "#00933C",
      "7": "#B933AD"
    };

    function renderCircles(lines) {
      return lines.map((line, i) => {
        const x = 20 + (i % 12) * 45;
        const yOffset = Math.floor(i / 12) * 50;

        return `
          <circle cx="${x}" cy="${yOffset}" r="16" fill="${COLORS[line] || "#000"}"/>
          <text x="${x}" y="${yOffset + 5}" font-size="14" text-anchor="middle" fill="white" font-family="Arial" font-weight="bold">${line}</text>
        `;
      }).join("");
    }

    const good = data.grouped["GOOD SERVICE"];
    const delays = data.grouped["DELAYS"];
    const suspended = data.grouped["SUSPENDED"];

    const svg = `
      <svg width="600" height="320" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>

        <!-- Title -->
        <text x="20" y="30" font-size="22" font-family="Arial" font-weight="bold">
          NYC Subway Status
        </text>

        <!-- GOOD -->
        <text x="20" y="70" font-size="16" fill="green" font-family="Arial">
          Good Service
        </text>
        <g transform="translate(20,90)">
          ${renderCircles(good)}
        </g>

        <!-- DELAYS -->
        <text x="20" y="170" font-size="16" fill="orange" font-family="Arial">
          Delays
        </text>
        <g transform="translate(20,190)">
          ${renderCircles(delays)}
        </g>

        <!-- SUSPENDED -->
        <text x="20" y="250" font-size="16" fill="#8B0000" font-family="Arial">
          Suspended
        </text>
        <g transform="translate(20,270)">
          ${renderCircles(suspended)}
        </g>

        <!-- Timestamp -->
        <text x="20" y="310" font-size="12" fill="gray" font-family="Arial">
          Updated: ${updated}
        </text>
      </svg>
    `;

    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg);

  } catch (err) {
    res.status(500).send("Error generating SVG");
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
