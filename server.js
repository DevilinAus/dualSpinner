const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT) || 4173;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "decks.json");
const PLAYER_POOLS = {
  Andrew: "shared",
  Kirsten: "shared",
  Mark: "mark",
};
const RETRO_LABEL = "RETRO";
const VALID_PLAYERS = new Set(Object.keys(PLAYER_POOLS));
const DEFAULT_STATE = {
  player1: "Andrew",
  player2: "Mark",
  retroEnabled: false,
  disableRetroMirror: false,
  sharedDecks: [],
  markDecks: [],
  player1Deck: "",
  player2Deck: "",
  updatedAt: null,
};
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const PUBLIC_FILES = new Map([
  ["/", path.join(ROOT_DIR, "index.html")],
  ["/index.html", path.join(ROOT_DIR, "index.html")],
  ["/styles.css", path.join(ROOT_DIR, "styles.css")],
  ["/script.js", path.join(ROOT_DIR, "script.js")],
  ["/data/retro.json", path.join(ROOT_DIR, "data", "retro.json")],
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sanitizeDeckList(deckList) {
  if (!Array.isArray(deckList)) {
    return [];
  }

  const seenDecks = new Set();
  const cleanedDecks = [];

  deckList.forEach((deckName) => {
    if (typeof deckName !== "string") {
      return;
    }

    const trimmedDeck = deckName.trim();

    if (!trimmedDeck || seenDecks.has(trimmedDeck)) {
      return;
    }

    seenDecks.add(trimmedDeck);
    cleanedDecks.push(trimmedDeck);
  });

  return cleanedDecks;
}

function sanitizePlayer(playerName, fallbackPlayer) {
  return VALID_PLAYERS.has(playerName) ? playerName : fallbackPlayer;
}

function sanitizeSelectedDeck(selectedDeck, availableDecks, retroEnabled) {
  if (typeof selectedDeck !== "string") {
    return "";
  }

  if (retroEnabled && selectedDeck === RETRO_LABEL) {
    return RETRO_LABEL;
  }

  return availableDecks.includes(selectedDeck) ? selectedDeck : "";
}

function normalizeState(rawState = {}) {
  const player1 = sanitizePlayer(rawState.player1, DEFAULT_STATE.player1);
  const player2 = sanitizePlayer(rawState.player2, DEFAULT_STATE.player2);
  const retroEnabled = rawState.retroEnabled === true;
  const disableRetroMirror = rawState.disableRetroMirror === true;
  const sharedDecks = sanitizeDeckList(rawState.sharedDecks);
  const markDecks = sanitizeDeckList(rawState.markDecks);
  const player1DeckPool =
    PLAYER_POOLS[player1] === "shared" ? sharedDecks : markDecks;
  const player2DeckPool =
    PLAYER_POOLS[player2] === "shared" ? sharedDecks : markDecks;

  let player1Deck = sanitizeSelectedDeck(
    rawState.player1Deck,
    player1DeckPool,
    retroEnabled
  );
  let player2Deck = sanitizeSelectedDeck(
    rawState.player2Deck,
    player2DeckPool,
    retroEnabled
  );

  if (
    PLAYER_POOLS[player1] === "shared" &&
    PLAYER_POOLS[player2] === "shared" &&
    player1Deck &&
    player1Deck !== RETRO_LABEL &&
    player1Deck === player2Deck
  ) {
    player2Deck = "";
  }

  if (player1 === player2) {
    player1Deck = "";
    player2Deck = "";
  }

  const updatedAt =
    typeof rawState.updatedAt === "string" && !Number.isNaN(Date.parse(rawState.updatedAt))
      ? rawState.updatedAt
      : null;

  return {
    player1,
    player2,
    retroEnabled,
    disableRetroMirror,
    sharedDecks,
    markDecks,
    player1Deck,
    player2Deck,
    updatedAt,
  };
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    const initialState = {
      ...DEFAULT_STATE,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialState, null, 2));
  }
}

async function readStateFromFile() {
  await ensureDataFile();

  const fileContents = await fs.readFile(DATA_FILE, "utf8");
  const parsedState = JSON.parse(fileContents);
  return normalizeState(parsedState);
}

async function writeStateToFile(nextState) {
  const normalizedState = normalizeState(nextState);
  const stateToSave = {
    ...normalizedState,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(DATA_FILE, JSON.stringify(stateToSave, null, 2));

  return stateToSave;
}

async function collectRequestBody(request) {
  const chunks = [];
  let totalSize = 0;

  for await (const chunk of request) {
    totalSize += chunk.length;

    if (totalSize > 1_000_000) {
      throw new Error("Request body too large.");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function handleApiRequest(request, response) {
  if (request.method === "GET") {
    const savedState = await readStateFromFile();
    sendJson(response, 200, savedState);
    return;
  }

  if (request.method === "POST") {
    const rawBody = await collectRequestBody(request);
    const parsedBody = JSON.parse(rawBody || "{}");
    const savedState = await writeStateToFile(parsedBody);
    sendJson(response, 200, savedState);
    return;
  }

  response.writeHead(405, {
    Allow: "GET, POST",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end("Method not allowed");
}

async function serveStaticFile(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const publicFilePath = PUBLIC_FILES.get(requestUrl.pathname);

  if (!publicFilePath) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
    return;
  }

  try {
    const fileBuffer = await fs.readFile(publicFilePath);
    const extension = path.extname(publicFilePath).toLowerCase();
    const contentType =
      CONTENT_TYPES[extension] || "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });

    if (request.method !== "HEAD") {
      response.end(fileBuffer);
      return;
    }

    response.end();
  } catch (error) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      response.writeHead(400, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("Missing request URL");
      return;
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/state") {
      await handleApiRequest(request, response);
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      await serveStaticFile(request, response);
      return;
    }

    response.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Method not allowed");
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: "The server could not complete that request.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Dual Spinner running at http://127.0.0.1:${PORT}`);
});
