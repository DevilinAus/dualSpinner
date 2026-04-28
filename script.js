const PLAYER_POOLS = {
  Andrew: "shared",
  Kirsten: "shared",
  Mark: "mark",
};

const RETRO_LABEL = "RETRO";
const RETRO_CHANCE = 0.05;
const RETRO_DECK_COLORS = {
  venusaur: "#2f9e44",
  alakazam: "#7b3fc6",
  gengar: "#7b3fc6",
  haymaker: "#f08c00",
  sponge: "#f5c400",
  "rain dance": "#1c7ed6",
  raindance: "#1c7ed6",
};
const DEFAULT_RETRO_DATA = {
  sharedDecks: [
    { name: "Haymaker", copies: 2 },
    { name: "raindance", copies: 2 },
    { name: "venusaur", copies: 2 },
    { name: "sponge", copies: 2 },
  ],
  playerDecks: {
    Andrew: ["alakazam"],
    Mark: ["gengar"],
  },
};

const DEFAULT_STATE = {
  player1: "Andrew",
  player2: "Mark",
  retroEnabled: false,
  disableRetroMirror: false,
  sharedDecks: [],
  markDecks: [],
  player1Deck: "",
  player2Deck: "",
};

const SAVE_DELAY_MS = 450;
const FULL_CIRCLE = Math.PI * 2;

const elements = {
  player1: document.querySelector("#player1"),
  player2: document.querySelector("#player2"),
  retroEnabled: document.querySelector("#retroEnabled"),
  disableRetroMirror: document.querySelector("#disableRetroMirror"),
  retroOverrideButton: document.querySelector("#retroOverrideButton"),
  spinBothButton: document.querySelector("#spinBothButton"),
  sharedDecks: document.querySelector("#sharedDecks"),
  markDecks: document.querySelector("#markDecks"),
  player1Heading: document.querySelector("#player1Heading"),
  player2Heading: document.querySelector("#player2Heading"),
  player1Pool: document.querySelector("#player1Pool"),
  player2Pool: document.querySelector("#player2Pool"),
  player1Result: document.querySelector("#player1Result"),
  player2Result: document.querySelector("#player2Result"),
  wheel1: document.querySelector("#wheel1"),
  wheel2: document.querySelector("#wheel2"),
  sharedCount: document.querySelector("#sharedCount"),
  markCount: document.querySelector("#markCount"),
  matchStatus: document.querySelector("#matchStatus"),
  deckStatus: document.querySelector("#deckStatus"),
  saveStatus: document.querySelector("#saveStatus"),
  retroOverlay: document.querySelector("#retroOverlay"),
  retroPlayerList: document.querySelector("#retroPlayerList"),
  retroPanel1: document.querySelector("#retroPanel1"),
  retroPanel2: document.querySelector("#retroPanel2"),
  retroPlayer1Name: document.querySelector("#retroPlayer1Name"),
  retroPlayer2Name: document.querySelector("#retroPlayer2Name"),
  retroWheel1: document.querySelector("#retroWheel1"),
  retroWheel2: document.querySelector("#retroWheel2"),
  retroResult1: document.querySelector("#retroResult1"),
  retroResult2: document.querySelector("#retroResult2"),
  retroSummary: document.querySelector("#retroSummary"),
  spinRetroButton: document.querySelector("#spinRetroButton"),
  closeRetroOverlayButton: document.querySelector("#closeRetroOverlayButton"),
};

const wheelViews = [
  { canvas: elements.wheel1, rotation: 0 },
  { canvas: elements.wheel2, rotation: 0 },
];
const retroWheelViews = [
  { canvas: elements.retroWheel1, rotation: 0 },
  { canvas: elements.retroWheel2, rotation: 0 },
];

let appState = { ...DEFAULT_STATE };
let isHydrating = true;
let isSpinning = false;
let isRetroOverlayOpen = false;
let isRetroSpinning = false;
let retroTriggerPlayers = [];
let retroHitPlayers = [];
let retroResults = {};
let retroDeckData = normalizeRetroDeckData(DEFAULT_RETRO_DATA);
let saveTimerId = null;
let lastSaveRequestId = 0;
let activeAnimationFrameId = 0;
let activeRetroAnimationFrameIds = [];

function parseDeckList(listText) {
  const uniqueDecks = new Set();

  listText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((deck) => uniqueDecks.add(deck));

  return Array.from(uniqueDecks);
}

function sanitizeDeckArray(deckList) {
  if (!Array.isArray(deckList)) {
    return [];
  }

  const uniqueDecks = new Set();

  deckList
    .filter((deck) => typeof deck === "string")
    .map((deck) => deck.trim())
    .filter(Boolean)
    .forEach((deck) => uniqueDecks.add(deck));

  return Array.from(uniqueDecks);
}

function normalizeRetroDeckEntries(deckList) {
  if (!Array.isArray(deckList)) {
    return [];
  }

  const entriesByName = new Map();

  deckList.forEach((deck) => {
    const deckName =
      typeof deck === "string" ? deck.trim() : deck?.name?.trim();

    if (!deckName) {
      return;
    }

    const deckCopies =
      typeof deck === "object" && Number.isInteger(deck.copies)
        ? Math.max(deck.copies, 1)
        : 1;
    const existingCopies = entriesByName.get(deckName) || 0;
    entriesByName.set(deckName, existingCopies + deckCopies);
  });

  return Array.from(entriesByName, ([name, copies]) => ({ name, copies }));
}

function normalizeRetroDeckData(rawData) {
  const playerDecks = {};
  const rawPlayerDecks =
    rawData && typeof rawData.playerDecks === "object" ? rawData.playerDecks : {};

  Object.keys(PLAYER_POOLS).forEach((playerName) => {
    playerDecks[playerName] = sanitizeDeckArray(rawPlayerDecks[playerName]);
  });

  return {
    sharedDecks: normalizeRetroDeckEntries(rawData?.sharedDecks),
    playerDecks,
  };
}

function formatDeckCount(count) {
  return `${count} deck${count === 1 ? "" : "s"}`;
}

function getPoolName(playerName) {
  return PLAYER_POOLS[playerName] === "shared"
    ? "Andrew + Kirsten shared pool"
    : "Mark's deck pool";
}

function getDecksForPlayer(playerName, sharedDecks, markDecks) {
  return PLAYER_POOLS[playerName] === "shared" ? sharedDecks : markDecks;
}

function setStatus(element, message, tone) {
  element.textContent = message;
  element.dataset.tone = tone;
}

function isValidPlayer(playerName) {
  return Object.hasOwn(PLAYER_POOLS, playerName);
}

function formatSavedTime(updatedAt) {
  if (!updatedAt) {
    return "";
  }

  const savedDate = new Date(updatedAt);

  if (Number.isNaN(savedDate.getTime())) {
    return "";
  }

  return savedDate.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeAngle(angle) {
  return ((angle % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
}

function formatNameList(names) {
  if (names.length <= 1) {
    return names[0] || "";
  }

  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function createMainWheelEntries(decks, retroEnabled) {
  if (decks.length === 0) {
    return [];
  }

  const deckChance = retroEnabled ? 1 - RETRO_CHANCE : 1;
  const deckWeight = deckChance / decks.length;
  const entries = decks.map((deck) => ({
    label: deck,
    value: deck,
    type: "deck",
    weight: deckWeight,
  }));

  if (retroEnabled) {
    entries.push({
      label: RETRO_LABEL,
      value: RETRO_LABEL,
      type: "retro",
      weight: RETRO_CHANCE,
    });
  }

  return entries;
}

function getRetroDecksForPlayer(playerName) {
  const deckCopiesByName = new Map();

  retroDeckData.sharedDecks.forEach((deck) => {
    deckCopiesByName.set(deck.name, deck.copies);
  });

  const playerDecks = retroDeckData.playerDecks[playerName] || [];
  playerDecks.forEach((deckName) => {
    const existingCopies = deckCopiesByName.get(deckName) || 0;
    deckCopiesByName.set(deckName, existingCopies + 1);
  });

  return Array.from(deckCopiesByName, ([name, copies]) => ({ name, copies }));
}

function createRetroWheelEntries(playerName) {
  const retroDecks = getRetroDecksForPlayer(playerName);

  return retroDecks.map((deck) => ({
    label: deck.name,
    value: deck.name,
    type: "retro-deck",
    weight: 1,
  }));
}

function createRetroChoiceEntries(playerName, blockedDecks = []) {
  return createRetroWheelEntries(playerName).filter(
    (entry) => !blockedDecks.includes(entry.value)
  );
}

function getRetroPlanningOrder(playerNames) {
  if (playerNames.includes("Andrew") && playerNames.includes("Mark")) {
    return [
      "Andrew",
      ...playerNames.filter((playerName) => playerName !== "Andrew"),
    ];
  }

  return playerNames;
}

function getTotalEntryWeight(entries) {
  return entries.reduce((sum, entry) => sum + entry.weight, 0);
}

function getBlockedRetroDecks(playerName, selectedResults = retroResults) {
  if (!elements.disableRetroMirror.checked) {
    return [];
  }

  return Object.entries(selectedResults)
    .filter(([resultPlayerName]) => resultPlayerName !== playerName)
    .map(([, deckName]) => deckName);
}

function areRetroResultsComplete(triggerPlayers) {
  return triggerPlayers.every((playerName) => retroResults[playerName]);
}

function formatRetroResultSummary(triggerPlayers) {
  if (triggerPlayers.length === 0) {
    return "Waiting to spin";
  }

  return triggerPlayers
    .map((playerName) => `${playerName}: ${retroResults[playerName] || "waiting"}`)
    .join(" | ");
}

function setRetroResultPill(element, playerName) {
  if (isRetroSpinning) {
    element.dataset.state = "spinning";
    element.textContent = "Spinning...";
    return;
  }

  if (retroResults[playerName]) {
    element.dataset.state = "active";
    element.textContent = retroResults[playerName];
    return;
  }

  element.dataset.state = "idle";
  element.textContent = "Waiting to spin";
}

function setRetroSummaryPill(element, triggerPlayers) {
  if (isRetroSpinning) {
    element.dataset.state = "spinning";
    element.textContent = "Spinning RETRO wheels...";
    return;
  }

  const hasAnyResult = triggerPlayers.some((playerName) => retroResults[playerName]);
  element.dataset.state = hasAnyResult ? "active" : "idle";
  element.textContent = formatRetroResultSummary(triggerPlayers);
}

function isValidChosenResult(resultText, decks, retroEnabled) {
  if (!resultText) {
    return true;
  }

  if (resultText === RETRO_LABEL) {
    return retroEnabled;
  }

  return decks.includes(resultText);
}

function getCurrentState() {
  return {
    player1: elements.player1.value,
    player2: elements.player2.value,
    retroEnabled: elements.retroEnabled.checked,
    disableRetroMirror: elements.disableRetroMirror.checked,
    sharedDecks: parseDeckList(elements.sharedDecks.value),
    markDecks: parseDeckList(elements.markDecks.value),
    player1Deck: appState.player1Deck,
    player2Deck: appState.player2Deck,
  };
}

function applyState(state) {
  const nextState = {
    ...DEFAULT_STATE,
    ...state,
  };

  elements.player1.value = isValidPlayer(nextState.player1)
    ? nextState.player1
    : DEFAULT_STATE.player1;
  elements.player2.value = isValidPlayer(nextState.player2)
    ? nextState.player2
    : DEFAULT_STATE.player2;
  elements.retroEnabled.checked = Boolean(nextState.retroEnabled);
  elements.disableRetroMirror.checked = Boolean(nextState.disableRetroMirror);
  elements.sharedDecks.value = Array.isArray(nextState.sharedDecks)
    ? nextState.sharedDecks.join("\n")
    : "";
  elements.markDecks.value = Array.isArray(nextState.markDecks)
    ? nextState.markDecks.join("\n")
    : "";
  appState.player1Deck = typeof nextState.player1Deck === "string" ? nextState.player1Deck : "";
  appState.player2Deck = typeof nextState.player2Deck === "string" ? nextState.player2Deck : "";

  render();
}

function getSpinContext() {
  const sharedDeckList = parseDeckList(elements.sharedDecks.value);
  const markDeckList = parseDeckList(elements.markDecks.value);
  const player1Name = elements.player1.value;
  const player2Name = elements.player2.value;
  const retroEnabled = elements.retroEnabled.checked;
  const player1PoolKey = PLAYER_POOLS[player1Name];
  const player2PoolKey = PLAYER_POOLS[player2Name];
  const bothUseSharedPool =
    player1PoolKey === "shared" && player2PoolKey === "shared";
  const player1Decks = getDecksForPlayer(player1Name, sharedDeckList, markDeckList);
  const player2Decks = getDecksForPlayer(player2Name, sharedDeckList, markDeckList);
  const player1WheelEntries = createMainWheelEntries(player1Decks, retroEnabled);
  const player2WheelEntries = createMainWheelEntries(player2Decks, retroEnabled);

  return {
    sharedDeckList,
    markDeckList,
    player1Name,
    player2Name,
    retroEnabled,
    player1PoolKey,
    player2PoolKey,
    bothUseSharedPool,
    player1Decks,
    player2Decks,
    player1WheelEntries,
    player2WheelEntries,
  };
}

function syncChosenDecks(context) {
  let didChange = false;

  if (
    !isValidChosenResult(
      appState.player1Deck,
      context.player1Decks,
      context.retroEnabled
    )
  ) {
    appState.player1Deck = "";
    didChange = true;
  }

  if (
    !isValidChosenResult(
      appState.player2Deck,
      context.player2Decks,
      context.retroEnabled
    )
  ) {
    appState.player2Deck = "";
    didChange = true;
  }

  if (context.player1Name === context.player2Name) {
    if (appState.player1Deck || appState.player2Deck) {
      appState.player1Deck = "";
      appState.player2Deck = "";
      didChange = true;
    }
  } else if (
    context.bothUseSharedPool &&
    appState.player1Deck &&
    appState.player1Deck !== RETRO_LABEL &&
    appState.player1Deck === appState.player2Deck
  ) {
    appState.player2Deck = "";
    didChange = true;
  }

  return didChange;
}

function getSpinAvailability(context) {
  if (context.player1Name === context.player2Name) {
    return {
      canSpin: false,
      reason: "Choose two different players before spinning both wheels.",
    };
  }

  if (context.player1Decks.length === 0 || context.player2Decks.length === 0) {
    return {
      canSpin: false,
      reason: "Add at least one deck to each active pool before spinning.",
    };
  }

  if (context.bothUseSharedPool && context.sharedDeckList.length < 2) {
    return {
      canSpin: false,
      reason: "Andrew and Kirsten need at least two shared decks to spin both wheels.",
    };
  }

  return {
    canSpin: true,
    reason: "",
  };
}

function setResultPill(element, resultText, spinning = isSpinning) {
  if (spinning) {
    element.dataset.state = "spinning";
    element.textContent = "Spinning...";
    return;
  }

  if (resultText) {
    element.dataset.state = resultText === RETRO_LABEL ? "retro" : "active";
    element.textContent = resultText;
    return;
  }

  element.dataset.state = "idle";
  element.textContent = "Waiting to spin";
}

function getWheelRotationForEntry(entries, selectedIndex) {
  if (selectedIndex < 0 || selectedIndex >= entries.length) {
    return null;
  }

  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const weightBeforeEntry = entries
    .slice(0, selectedIndex)
    .reduce((sum, entry) => sum + entry.weight, 0);
  const centerRatio =
    (weightBeforeEntry + entries[selectedIndex].weight / 2) / totalWeight;

  return normalizeAngle(-(centerRatio * FULL_CIRCLE));
}

function getWheelRotationForResult(entries, selectedResult) {
  if (!selectedResult) {
    return null;
  }

  const selectedIndex = entries.findIndex(
    (entry) => entry.value === selectedResult
  );

  return getWheelRotationForEntry(entries, selectedIndex);
}

function syncWheelRestPositions(context) {
  const targetRotations = [
    getWheelRotationForResult(context.player1WheelEntries, appState.player1Deck),
    getWheelRotationForResult(context.player2WheelEntries, appState.player2Deck),
  ];

  wheelViews.forEach((wheelView, index) => {
    const targetRotation = targetRotations[index];

    if (typeof targetRotation === "number") {
      wheelView.rotation = targetRotation;
      return;
    }

    wheelView.rotation = normalizeAngle(wheelView.rotation);
  });
}

function getSegmentColor(index, totalSegments, entry) {
  if (entry.type === "retro") {
    return "#6b3fc9";
  }

  if (entry.type === "retro-deck") {
    return RETRO_DECK_COLORS[entry.value.toLowerCase()] || "#4c6ef5";
  }

  const hue = (18 + (index * 360) / Math.max(totalSegments, 1)) % 360;
  return `hsl(${hue} 82% 61%)`;
}

function fitText(ctx, label, maxWidth) {
  const words = label.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (ctx.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    let shortenedWord = word;

    while (shortenedWord.length > 3 && ctx.measureText(`${shortenedWord}...`).width > maxWidth) {
      shortenedWord = shortenedWord.slice(0, -1);
    }

    lines.push(`${shortenedWord}...`);
    currentLine = "";
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= 2) {
    return lines;
  }

  return [lines[0], `${lines[1].slice(0, 16)}...`];
}

function drawPlaceholderWheel(ctx, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.44;

  ctx.beginPath();
  ctx.fillStyle = "rgba(25, 57, 98, 0.16)";
  ctx.arc(centerX, centerY, radius, 0, FULL_CIRCLE);
  ctx.fill();

  ctx.lineWidth = Math.max(4, radius * 0.03);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.arc(centerX, centerY, radius * 0.22, 0, FULL_CIRCLE);
  ctx.fill();

  ctx.fillStyle = "#234674";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.max(18, radius * 0.1)}px Trebuchet MS`;
  ctx.fillText("Add decks", centerX, centerY - 10);
  ctx.font = `600 ${Math.max(12, radius * 0.055)}px Trebuchet MS`;
  ctx.fillText("to spin", centerX, centerY + 18);
}

function drawWheel(wheelView, entries, centerLabel) {
  const rect = wheelView.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const nextWidth = Math.max(320, Math.round(rect.width * dpr));
  const nextHeight = Math.max(320, Math.round(rect.height * dpr));

  if (wheelView.canvas.width !== nextWidth || wheelView.canvas.height !== nextHeight) {
    wheelView.canvas.width = nextWidth;
    wheelView.canvas.height = nextHeight;
  }

  const ctx = wheelView.canvas.getContext("2d");
  const width = wheelView.canvas.width / dpr;
  const height = wheelView.canvas.height / dpr;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.44;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, wheelView.canvas.width, wheelView.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (entries.length === 0) {
    drawPlaceholderWheel(ctx, width, height);
    return;
  }

  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let angleCursor = 0;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(wheelView.rotation);

  entries.forEach((entry, index) => {
    const segmentAngle = (entry.weight / totalWeight) * FULL_CIRCLE;
    const startAngle = -Math.PI / 2 + angleCursor;
    const endAngle = startAngle + segmentAngle;
    const labelAngle = startAngle + segmentAngle / 2;
    const labelRadius = entry.type === "retro" ? radius * 0.72 : radius * 0.64;
    const baseFontSize =
      entry.type === "retro"
        ? Math.max(10, radius * 0.045)
        : Math.max(11, Math.min(18, 220 / entries.length));

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = getSegmentColor(index, entries.length, entry);
    ctx.fill();

    ctx.lineWidth = Math.max(2, radius * 0.015);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.stroke();

    ctx.save();
    ctx.translate(
      Math.cos(labelAngle) * labelRadius,
      Math.sin(labelAngle) * labelRadius
    );

    let textRotation = labelAngle + Math.PI / 2;
    const normalizedLabelAngle = normalizeAngle(labelAngle);

    if (normalizedLabelAngle > Math.PI / 2 && normalizedLabelAngle < (3 * Math.PI) / 2) {
      textRotation += Math.PI;
    }

    ctx.rotate(textRotation);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fffdf8";
    ctx.font = `800 ${baseFontSize}px Trebuchet MS`;
    ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
    ctx.shadowBlur = 5;

    const labelMaxWidth = entry.type === "retro" ? radius * 0.25 : radius * 0.34;
    const textLines = fitText(ctx, entry.label, labelMaxWidth);

    textLines.forEach((line, lineIndex) => {
      const lineOffset = (lineIndex - (textLines.length - 1) / 2) * (baseFontSize + 2);
      ctx.fillText(line, 0, lineOffset);
    });

    ctx.restore();
    angleCursor += segmentAngle;
  });

  ctx.restore();

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + radius * 0.018, 0, FULL_CIRCLE);
  ctx.lineWidth = Math.max(5, radius * 0.03);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.94)";
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 253, 248, 0.96)";
  ctx.arc(centerX, centerY, radius * 0.22, 0, FULL_CIRCLE);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "#13263f";
  ctx.arc(centerX, centerY, radius * 0.07, 0, FULL_CIRCLE);
  ctx.fill();

  ctx.fillStyle = "#365278";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.max(12, radius * 0.055)}px Trebuchet MS`;
  ctx.fillText(centerLabel, centerX, centerY);
}

function drawAllWheels(context) {
  drawWheel(
    wheelViews[0],
    context.player1WheelEntries,
    formatDeckCount(context.player1Decks.length)
  );
  drawWheel(
    wheelViews[1],
    context.player2WheelEntries,
    formatDeckCount(context.player2Decks.length)
  );
}

function getRetroTriggerPlayers(context) {
  const triggerPlayers = [];

  if (appState.player1Deck === RETRO_LABEL) {
    triggerPlayers.push(context.player1Name);
  }

  if (appState.player2Deck === RETRO_LABEL) {
    triggerPlayers.push(context.player2Name);
  }

  return triggerPlayers;
}

function resetRetroOverlayState() {
  activeRetroAnimationFrameIds.forEach((frameId) =>
    window.cancelAnimationFrame(frameId)
  );

  isRetroOverlayOpen = false;
  isRetroSpinning = false;
  retroTriggerPlayers = [];
  retroHitPlayers = [];
  retroResults = {};
  activeRetroAnimationFrameIds = [];
}

function openRetroOverlay(triggerPlayers, hitPlayers = triggerPlayers) {
  const uniqueTriggerPlayers = Array.from(new Set(triggerPlayers));
  const uniqueHitPlayers = Array.from(new Set(hitPlayers));

  isRetroOverlayOpen = true;
  isRetroSpinning = false;
  retroTriggerPlayers = uniqueTriggerPlayers;
  retroHitPlayers = uniqueHitPlayers;
  retroResults = {};
  retroWheelViews.forEach((wheelView) => {
    wheelView.rotation = normalizeAngle(wheelView.rotation);
  });
}

function closeRetroOverlay() {
  if (isRetroSpinning) {
    return;
  }

  resetRetroOverlayState();
  render();
}

function renderRetroOverlay(triggerPlayers) {
  const shouldShow = isRetroOverlayOpen && triggerPlayers.length > 0;
  const retroPanels = [elements.retroPanel1, elements.retroPanel2];
  const retroNameElements = [elements.retroPlayer1Name, elements.retroPlayer2Name];
  const retroResultElements = [elements.retroResult1, elements.retroResult2];

  elements.retroOverlay.hidden = !shouldShow;
  elements.retroOverlay.setAttribute("aria-hidden", String(!shouldShow));

  if (!shouldShow) {
    return;
  }

  retroTriggerPlayers = triggerPlayers;
  const isComplete = areRetroResultsComplete(triggerPlayers);
  const hasEmptyWheel = triggerPlayers.some(
    (playerName) => createRetroWheelEntries(playerName).length === 0
  );

  elements.retroPlayerList.textContent = isComplete
    ? "RETRO decks assigned."
    : `${formatNameList(retroHitPlayers)} hit ${RETRO_LABEL}.`;
  setRetroSummaryPill(elements.retroSummary, triggerPlayers);
  elements.spinRetroButton.disabled =
    isRetroSpinning || isComplete || hasEmptyWheel;
  elements.spinRetroButton.textContent = isRetroSpinning
    ? "Spinning..."
    : isComplete
      ? "Retro Complete"
      : "Spin Retro";
  elements.closeRetroOverlayButton.disabled = isRetroSpinning;

  retroWheelViews.forEach((wheelView, index) => {
    const playerName = triggerPlayers[index];
    const panel = retroPanels[index];

    panel.hidden = !playerName;

    if (!playerName) {
      return;
    }

    const retroEntries = createRetroWheelEntries(playerName);

    retroNameElements[index].textContent = playerName;
    setRetroResultPill(retroResultElements[index], playerName);
    drawWheel(
      wheelView,
      retroEntries,
      formatDeckCount(getTotalEntryWeight(retroEntries))
    );
  });
}

function render() {
  const context = getSpinContext();
  syncChosenDecks(context);
  const landedRetroTriggers = getRetroTriggerPlayers(context);
  const activeRetroTriggers =
    isRetroOverlayOpen ? retroTriggerPlayers : landedRetroTriggers;
  const statusRetroTriggers =
    isRetroOverlayOpen && retroHitPlayers.length > 0
      ? retroHitPlayers
      : activeRetroTriggers;

  if (activeRetroTriggers.length === 0 && isRetroOverlayOpen) {
    resetRetroOverlayState();
  }

  elements.sharedCount.textContent = formatDeckCount(context.sharedDeckList.length);
  elements.markCount.textContent = formatDeckCount(context.markDeckList.length);

  elements.player1Heading.textContent = context.player1Name;
  elements.player2Heading.textContent = context.player2Name;
  elements.player1Pool.textContent = `Uses ${getPoolName(context.player1Name)}`;
  elements.player2Pool.textContent = `Uses ${getPoolName(context.player2Name)}`;

  setResultPill(elements.player1Result, appState.player1Deck);
  setResultPill(elements.player2Result, appState.player2Deck);

  if (context.player1Name === context.player2Name) {
    setStatus(
      elements.matchStatus,
      "Player 1 and Player 2 need to be different people.",
      "warning"
    );
  } else if (context.bothUseSharedPool) {
    setStatus(
      elements.matchStatus,
      "Andrew and Kirsten share one pool, so Spin Both will force two different deck results.",
      "info"
    );
  } else {
    setStatus(
      elements.matchStatus,
      `${context.player1Name} and ${context.player2Name} are using separate deck pools.`,
      "success"
    );
  }

  const spinAvailability = getSpinAvailability(context);

  if (context.player1Name === context.player2Name) {
    setStatus(
      elements.deckStatus,
      "Choose two different players before spinning.",
      "warning"
    );
  } else if (context.player1Decks.length === 0 || context.player2Decks.length === 0) {
    setStatus(
      elements.deckStatus,
      "Add decks to the active pool or pools before spinning both wheels.",
      "warning"
    );
  } else if (context.bothUseSharedPool && context.sharedDeckList.length < 2) {
    setStatus(
      elements.deckStatus,
      "Andrew and Kirsten need at least two shared decks to get two unique results.",
      "warning"
    );
  } else if (isSpinning) {
    setStatus(
      elements.deckStatus,
      "Spinning both wheels...",
      "info"
    );
  } else if (activeRetroTriggers.length > 0) {
    setStatus(
      elements.deckStatus,
      `${formatNameList(statusRetroTriggers)} hit ${RETRO_LABEL}. Use the retro wheels to choose the retro decks.`,
      "success"
    );
  } else if (appState.player1Deck && appState.player2Deck) {
    setStatus(
      elements.deckStatus,
      `${context.player1Name} drew ${appState.player1Deck}. ${context.player2Name} drew ${appState.player2Deck}.`,
      "success"
    );
  } else {
    setStatus(
      elements.deckStatus,
      "Press Spin Both to randomly choose a deck for each player.",
      "info"
    );
  }

  const controlsLocked = isSpinning || isRetroSpinning;

  elements.spinBothButton.disabled = !spinAvailability.canSpin || controlsLocked;
  elements.spinBothButton.title = spinAvailability.reason;
  elements.spinBothButton.textContent = isSpinning ? "Spinning..." : "Spin Both";
  elements.retroOverrideButton.disabled = controlsLocked;

  [
    elements.player1,
    elements.player2,
    elements.retroEnabled,
    elements.disableRetroMirror,
    elements.sharedDecks,
    elements.markDecks,
  ].forEach((element) => {
    element.disabled = controlsLocked;
  });

  if (!isSpinning) {
    syncWheelRestPositions(context);
  }

  drawAllWheels(context);
  renderRetroOverlay(activeRetroTriggers);
}

function scheduleSave() {
  if (isHydrating) {
    return;
  }

  setStatus(elements.saveStatus, "Saving deck data to data/decks.json...", "info");
  window.clearTimeout(saveTimerId);
  saveTimerId = window.setTimeout(saveState, SAVE_DELAY_MS);
}

async function saveState() {
  const requestId = ++lastSaveRequestId;

  try {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getCurrentState()),
    });

    if (!response.ok) {
      throw new Error("Save request failed.");
    }

    const savedState = await response.json();

    if (requestId !== lastSaveRequestId) {
      return;
    }

    const savedAtText = formatSavedTime(savedState.updatedAt);
    const successMessage = savedAtText
      ? `Saved to data/decks.json on ${savedAtText}.`
      : "Saved to data/decks.json.";

    setStatus(elements.saveStatus, successMessage, "success");
  } catch (error) {
    if (requestId !== lastSaveRequestId) {
      return;
    }

    setStatus(
      elements.saveStatus,
      "Could not save to the project file. Start the site with npm run dev, npm start, or node server.js.",
      "warning"
    );
  }
}

async function loadSavedState() {
  setStatus(elements.saveStatus, "Loading saved deck data...", "info");

  try {
    const response = await fetch("/api/state");

    if (!response.ok) {
      throw new Error("Load request failed.");
    }

    const savedState = await response.json();
    applyState(savedState);

    const savedAtText = formatSavedTime(savedState.updatedAt);
    const readyMessage = savedAtText
      ? `Loaded deck data from data/decks.json. Last saved ${savedAtText}.`
      : "Loaded deck data from data/decks.json.";

    setStatus(elements.saveStatus, readyMessage, "success");
  } catch (error) {
    applyState(DEFAULT_STATE);
    setStatus(
      elements.saveStatus,
      "Could not load the project file. Start the site with npm run dev, npm start, or node server.js.",
      "warning"
    );
  } finally {
    isHydrating = false;
  }
}

async function loadRetroDeckData() {
  try {
    const response = await fetch("/data/retro.json");

    if (!response.ok) {
      throw new Error("Retro deck data request failed.");
    }

    const loadedRetroData = await response.json();
    retroDeckData = normalizeRetroDeckData(loadedRetroData);
  } catch (error) {
    retroDeckData = normalizeRetroDeckData(DEFAULT_RETRO_DATA);
  }

  render();
}

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

function chooseWeightedEntry(entries) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const selectedWeight = Math.random() * totalWeight;
  let weightCursor = 0;

  for (let index = 0; index < entries.length; index += 1) {
    weightCursor += entries[index].weight;

    if (selectedWeight < weightCursor) {
      return {
        index,
        entry: entries[index],
      };
    }
  }

  return {
    index: entries.length - 1,
    entry: entries[entries.length - 1],
  };
}

function chooseSpinResults(context) {
  const player1Result = chooseWeightedEntry(context.player1WheelEntries);
  let player2Result = chooseWeightedEntry(context.player2WheelEntries);

  if (
    context.bothUseSharedPool &&
    player1Result.entry.type === "deck" &&
    player2Result.entry.type === "deck" &&
    player1Result.entry.value === player2Result.entry.value
  ) {
    const availableEntries = context.player2WheelEntries
      .map((entry, index) => ({ entry, index }))
      .filter(
        (option) =>
          option.entry.type === "deck" &&
          option.entry.value !== player1Result.entry.value
      );

    player2Result = availableEntries[randomIndex(availableEntries.length)];
  }

  return {
    player1Index: player1Result.index,
    player2Index: player2Result.index,
    player1Deck: player1Result.entry.value,
    player2Deck: player2Result.entry.value,
  };
}

function getSpinTargetRotation(currentRotation, entries, winnerIndex) {
  const desiredRotation = getWheelRotationForEntry(entries, winnerIndex);
  const currentNormalized = normalizeAngle(currentRotation);
  const deltaToTarget = normalizeAngle(desiredRotation - currentNormalized);
  const extraTurns = (5 + Math.floor(Math.random() * 3)) * FULL_CIRCLE;

  return currentRotation + extraTurns + deltaToTarget;
}

function easeOutQuint(progress) {
  return 1 - Math.pow(1 - progress, 5);
}

function spinBothWheels() {
  if (isSpinning) {
    return;
  }

  const context = getSpinContext();
  const spinAvailability = getSpinAvailability(context);

  if (!spinAvailability.canSpin) {
    render();
    return;
  }

  const results = chooseSpinResults(context);
  const animationSpecs = [
    {
      wheelView: wheelViews[0],
      targetRotation: getSpinTargetRotation(
        wheelViews[0].rotation,
        context.player1WheelEntries,
        results.player1Index
      ),
      duration: 3800,
    },
    {
      wheelView: wheelViews[1],
      targetRotation: getSpinTargetRotation(
        wheelViews[1].rotation,
        context.player2WheelEntries,
        results.player2Index
      ),
      duration: 4400,
    },
  ].map((spec) => ({
    ...spec,
    startRotation: spec.wheelView.rotation,
  }));

  isSpinning = true;
  render();

  const animationStart = performance.now();

  function step(now) {
    const elapsed = now - animationStart;
    let isAnimationRunning = false;

    animationSpecs.forEach((spec) => {
      const progress = Math.min(elapsed / spec.duration, 1);
      const easedProgress = easeOutQuint(progress);

      spec.wheelView.rotation =
        spec.startRotation +
        (spec.targetRotation - spec.startRotation) * easedProgress;

      if (progress < 1) {
        isAnimationRunning = true;
      }
    });

    drawAllWheels(context);

    if (isAnimationRunning) {
      activeAnimationFrameId = window.requestAnimationFrame(step);
      return;
    }

    appState.player1Deck = results.player1Deck;
    appState.player2Deck = results.player2Deck;
    isSpinning = false;
    activeAnimationFrameId = 0;
    const retroWinners = [];

    if (results.player1Deck === RETRO_LABEL) {
      retroWinners.push(context.player1Name);
    }

    if (results.player2Deck === RETRO_LABEL) {
      retroWinners.push(context.player2Name);
    }

    if (retroWinners.length > 0) {
      openRetroOverlay(
        [context.player1Name, context.player2Name],
        retroWinners
      );
    } else {
      resetRetroOverlayState();
    }

    render();
    scheduleSave();
  }

  if (activeAnimationFrameId) {
    window.cancelAnimationFrame(activeAnimationFrameId);
  }

  activeAnimationFrameId = window.requestAnimationFrame(step);
}

function spinRetroWheel() {
  if (isRetroSpinning) {
    return;
  }

  if (areRetroResultsComplete(retroTriggerPlayers)) {
    return;
  }

  const plannedResults = {};
  const planningOrder = getRetroPlanningOrder(retroTriggerPlayers);

  planningOrder.forEach((playerName) => {
    const choiceEntries = createRetroChoiceEntries(
      playerName,
      getBlockedRetroDecks(playerName, plannedResults)
    );

    if (choiceEntries.length === 0) {
      return;
    }

    const retroResult = chooseWeightedEntry(choiceEntries);
    plannedResults[playerName] = retroResult.entry.value;
  });

  const animationSpecs = retroTriggerPlayers.map((playerName, index) => {
    const retroEntries = createRetroWheelEntries(playerName);
    const winnerDeck = plannedResults[playerName];

    if (!winnerDeck || retroEntries.length === 0) {
      return null;
    }

    const winnerIndex = retroEntries.findIndex(
      (entry) => entry.value === winnerDeck
    );

    if (winnerIndex === -1) {
      return null;
    }

    return {
      playerName,
      retroEntries,
      wheelView: retroWheelViews[index],
      winnerIndex,
      winnerDeck,
      duration: 3400,
    };
  });

  if (animationSpecs.some((spec) => !spec)) {
    return;
  }

  const readyAnimationSpecs = animationSpecs.map((spec) => ({
    ...spec,
    startRotation: spec.wheelView.rotation,
    targetRotation: getSpinTargetRotation(
      spec.wheelView.rotation,
      spec.retroEntries,
      spec.winnerIndex
    ),
  }));

  isRetroSpinning = true;
  render();

  const animationStart = performance.now();

  function step(now) {
    const elapsed = now - animationStart;
    let isAnimationRunning = false;

    readyAnimationSpecs.forEach((spec) => {
      const progress = Math.min(elapsed / spec.duration, 1);
      const easedProgress = easeOutQuint(progress);

      spec.wheelView.rotation =
        spec.startRotation +
        (spec.targetRotation - spec.startRotation) * easedProgress;

      drawWheel(
        spec.wheelView,
        spec.retroEntries,
        formatDeckCount(getTotalEntryWeight(spec.retroEntries))
      );

      if (progress < 1) {
        isAnimationRunning = true;
      }
    });

    if (isAnimationRunning) {
      activeRetroAnimationFrameIds = [window.requestAnimationFrame(step)];
      return;
    }

    readyAnimationSpecs.forEach((spec) => {
      retroResults[spec.playerName] = spec.winnerDeck;
    });
    isRetroSpinning = false;
    activeRetroAnimationFrameIds = [];
    render();
  }

  activeRetroAnimationFrameIds.forEach((frameId) =>
    window.cancelAnimationFrame(frameId)
  );

  activeRetroAnimationFrameIds = [window.requestAnimationFrame(step)];
}

function openRetroOverride() {
  if (isSpinning || isRetroSpinning) {
    return;
  }

  openRetroOverlay([elements.player1.value, elements.player2.value]);
  render();
}

function handleFieldChange() {
  render();
  scheduleSave();
}

function handleResize() {
  render();
}

[
  elements.player1,
  elements.player2,
  elements.retroEnabled,
  elements.disableRetroMirror,
].forEach((element) => element.addEventListener("change", handleFieldChange));

[elements.sharedDecks, elements.markDecks].forEach((element) =>
  element.addEventListener("input", handleFieldChange)
);

elements.spinBothButton.addEventListener("click", spinBothWheels);
elements.retroOverrideButton.addEventListener("click", openRetroOverride);
elements.spinRetroButton.addEventListener("click", spinRetroWheel);
elements.closeRetroOverlayButton.addEventListener("click", closeRetroOverlay);
elements.retroOverlay.addEventListener("click", (event) => {
  if (event.target === elements.retroOverlay) {
    closeRetroOverlay();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isRetroOverlayOpen) {
    closeRetroOverlay();
  }
});
window.addEventListener("resize", handleResize);

loadSavedState();
loadRetroDeckData();
