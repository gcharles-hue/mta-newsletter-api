function setNoCache(res) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
    "Pragma": "no-cache",
    "Expires": "0",
    "Surrogate-Control": "no-store",
    "Vary": "*"
  });
}

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
    setNoCache(res);
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
    setNoCache(res);

    const data = await fetchMTA();

    const updated = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short"
    }).format(new Date(data.updatedAt));

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

    const GROUP_META = [
      { key: "GOOD SERVICE", label: "Good Service", color: "#1a7f37" },
      { key: "DELAYS", label: "Delays", color: "#b26a00" },
      { key: "SUSPENDED", label: "Suspended", color: "#8B0000" }
    ];
    

    
    function drawCircle(line, x, y) {
      const fill = COLORS[line] || "#111111";
      const textFill = fill === "#FCCC0A" ? "#000000" : "#ffffff";

      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.fillStyle = textFill;
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(line, x, y + 1);
    }

    function drawGroup(lines, startY) {
      const perRow = 10;
      const xStart = 36;
      const xGap = 52;
      const yGap = 44;

      if (!lines.length) {
        ctx.fillStyle = "#666666";
        ctx.font = "15px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText("None", xStart, startY + 2);
return 18;
      }

      lines.forEach((line, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const x = xStart + col * xGap;
        const y = startY + row * yGap;
        drawCircle(line, x, y);
      });

      const rows = Math.ceil(lines.length / perRow);
      return rows * yGap;
    }

    // match SVG layout better
   

    let y = 58;
let sectionHeights = [];

for (const group of GROUP_META) {
  const lines = data.grouped[group.key] || [];
  const rows = lines.length ? Math.ceil(lines.length / 10) : 1;
  const heightUsed = lines.length ? rows * 44 : 18;

  sectionHeights.push({
    group,
    lines,
    labelY: y,
    circlesY: y + 26,
    heightUsed
  });

  y += 26 + heightUsed + 10;
}

    const totalHeight = y + 40;
const width = 600;
const height = totalHeight;

const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // header bar
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(0, 0, width, 56);

    // title
    ctx.fillStyle = "#111111";
ctx.font = "bold 24px Arial";
ctx.textAlign = "center";
ctx.textBaseline = "alphabetic";
ctx.fillText("NYC Subway Status", 300, 40);

    // draw groups
    for (const section of sectionHeights) {
  ctx.fillStyle = section.group.color;
  ctx.font = "bold 17px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(section.group.label, 20, section.labelY);

  drawGroup(section.lines, section.circlesY);
}

    // footer divider
    ctx.strokeStyle = "#dddddd";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, totalHeight - 34);
    ctx.lineTo(580, totalHeight - 34);
    ctx.stroke();

    // footer text
    ctx.fillStyle = "#777777";
    ctx.font = "12px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`Updated: ${updated}`, 20, totalHeight - 12);

    res.setHeader("Content-Type", "image/png");
    res.send(canvas.toBuffer("image/png"));
  } catch (err) {
    console.error("PNG error:", err);
    res.status(500).send("Error generating image");
  }
});

app.get("/status-image.svg", async (req, res) => {
  try {
    setNoCache(res);
    const data = await fetchMTA();
    const updated = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZoneName: "short"
}).format(new Date(data.updatedAt));

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

    const GROUP_META = [
      { key: "GOOD SERVICE", label: "Good Service", color: "#1a7f37" },
      { key: "DELAYS", label: "Delays", color: "#b26a00" },
      { key: "SUSPENDED", label: "Suspended", color: "#8B0000" }
    ];
    
    function circleSvg(line, x, y) {
      const fill = COLORS[line] || "#111";
      const textFill = fill === "#FCCC0A" ? "#000" : "#fff";

      return `
        <circle cx="${x}" cy="${y}" r="16" fill="${fill}" />
        <text x="${x}" y="${y + 5}" font-size="14" text-anchor="middle"
              fill="${textFill}" font-family="Arial, Helvetica, sans-serif"
              font-weight="bold">${line}</text>
      `;
    }

    function renderGroup(lines, startY) {
      const perRow = 10;
      const xStart = 36;
      const xGap = 52;
      const yGap = 44;

      if (!lines.length) {
        return {
          svg: `<text x="${xStart}" y="${startY}" font-size="15" fill="#666"
                    font-family="Arial, Helvetica, sans-serif">None</text>`,
          heightUsed: 18
        };
      }

      let svg = "";
      lines.forEach((line, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const x = xStart + col * xGap;
        const y = startY + row * yGap;
        svg += circleSvg(line, x, y);
      });

      const rows = Math.ceil(lines.length / perRow);
      return {
        svg,
        heightUsed: rows * yGap
      };
    }

    let y = 58;
    let bodySvg = "";

    for (const group of GROUP_META) {
      const lines = data.grouped[group.key] || [];

      bodySvg += `
        <text x="20" y="${y}" font-size="17" fill="${group.color}"
              font-family="Arial, Helvetica, sans-serif" font-weight="bold">
          ${group.label}
        </text>
      `;

      const rendered = renderGroup(lines, y + 28);
      bodySvg += rendered.svg;
      y += 24 + rendered.heightUsed + 18;
    }

    const totalHeight = y + 40;

    const svg = `
      <svg width="600" height="${totalHeight}" viewBox="0 0 600 ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <rect x="0" y="0" width="600" height="64" fill="#f4f4f4"/>
        <text x="300" y="40" font-size="24" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-weight="bold" fill="#111">
   NYC Subway Status
</text>

        ${bodySvg}

        <line x1="20" y1="${totalHeight - 34}" x2="580" y2="${totalHeight - 34}" stroke="#ddd" stroke-width="1"/>
        <text x="20" y="${totalHeight - 12}" font-size="12" fill="#777"
              font-family="Arial, Helvetica, sans-serif">
          Updated: ${updated}
        </text>
      </svg>
    `;

    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    
    res.send(svg);
  } catch (err) {
    console.error("SVG error:", err);
    res.status(500).send("Error generating SVG");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
