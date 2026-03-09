import axios from "axios";
import * as cheerio from "cheerio";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages"; 


const NEWS_SOURCES = {
  zeit: {
    url: "https://www.zeit.de/index",
    selector: "article h2, article h3",
    name: "ZEIT Online"
  },
  spiegel: {
    url: "https://www.spiegel.de",
    selector: "article h2",
    name: "DER SPIEGEL"
  },
  faz: {
    url: "https://www.faz.net/aktuell",
    selector: ".tsr-Base_HeadlineText, article h2",
    name: "FAZ.NET"
  },
  welt: {
    url: "https://www.welt.de",
    selector: "article h2",
    name: "WELT"
  }
};


// Beide Modelle vorbereiten
const googleModel = new ChatGoogleGenerativeAI({ 
  model: "gemini-2.0-flash", 
  apiKey: process.env.GOOGLE_API_KEY 
});

const localModel = new ChatOllama({ 
  model: "llama3", 
  baseUrl: "http://localhost:11434" 
});


export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<any[]>({ reducer: (x, y) => x.concat(y), default: () => [] }),
  costTracking: Annotation<number>({ reducer: (x, y) => y, default: () => 0 }),
  isSafe: Annotation<boolean>({ reducer: (x, y) => y, default: () => true }),
  scrapedData: Annotation<string>({ reducer: (x, y) => y, default: () => "" }),
  sourceName: Annotation<string>({ reducer: (x, y) => y, default: () => "ZEIT Online" }),
  provider: Annotation<"google" | "local">({ reducer: (x, y) => y, default: () => "google" }),
});

export type AgentState = typeof AgentStateAnnotation.State;


function routeInput(state: AgentState) {
  const userQuery = state.messages[state.messages.length - 1].content.toLowerCase();
  const newsKeywords = ["news", "schlagzeilen", "nachrichten", "zeit", "spiegel", "faz", "welt"];
  
  // Wenn ein News-Keyword gefunden wird -> Scraper-Pfad
  if (newsKeywords.some(keyword => userQuery.includes(keyword))) {
    console.log("🛤️ Route gewählt: NEWS-SERVICE");
    return "news_route";
  }
  
  // Ansonsten -> Normaler Chat-Pfad
  console.log("🛤️ Route gewählt: SIMPLE-CHAT");
  return "chat_route";
}

async function scrapeNewsNode(state: AgentState) {
  const userQuery = state.messages[0].content.toLowerCase();
  
  // 1. Quelle identifizieren (Standard ist ZEIT)
  let sourceKey: keyof typeof NEWS_SOURCES = "zeit";
  if (userQuery.includes("spiegel")) sourceKey = "spiegel";
  if (userQuery.includes("faz")) sourceKey = "faz";
  if (userQuery.includes("welt")) sourceKey = "welt";

  const source = NEWS_SOURCES[sourceKey];
  console.log(`🌐 Scrape ${source.name}...`);

  try {
    const { data } = await axios.get(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...' }
    });

    const $ = cheerio.load(data);
    let headlines: string[] = [];

    $(source.selector).each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 25 && headlines.length < 8) {
        headlines.push(text);
      }
    });

    // Wir speichern auch den Namen der Quelle im State für die Action-Node
    return { 
      scrapedData: headlines.join(" | "),
      sourceName: source.name
    };
  } catch (error) {
    return { scrapedData: "FEHLER" };
  }
}

async function reasoningNode(state: AgentState) {
  const model = state.provider === "local" ? localModel : googleModel;
  
  // 3. Wir prüfen, ob Daten da sind, und passen den Prompt an
  let prompt = "";
  if (state.scrapedData === "KEINE_NEWS_GEFUNDEN" || state.scrapedData === "FEHLER_BEIM_LESEN") {
    prompt = "Entschuldige dich höflich beim User, dass du gerade keine News von zeit.de lesen konntest (wahrscheinlich technisches Problem).";
  } else {
    prompt = `
      Du bist ein erfahrener Nachrichten-Redakteur. 
      Hier sind die aktuellen Top-Themen von einem News Portal:
      ${state.scrapedData}

      Erstelle daraus ein kurzes, professionelles Briefing für Discord.
      Regeln:
      1. Max. 3 Sätze insgesamt.
      2. Nutze einen sachlichen, informativen Ton.
      3. Ignoriere alles, was nicht nach einer echten Nachricht klingt.
      4. Antworte nur mit der Zusammenfassung, ohne Einleitungssätze.
      `;

  }
  
  console.log(`🧠 KI (${state.provider}) generiert Zusammenfassung...`);
  const response = await model.invoke([new HumanMessage(prompt)]);
  return { messages: [response] };
}

// NODE 3: Discord Action
async function actionNode(state: AgentState) {
  const summary = state.messages[state.messages.length - 1].content;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const sourceName = state.sourceName || "News-Update";

  const discordMessage = {
    embeds: [{
      title: `🗞️ ${sourceName} News-Update`,
      description: summary,
      color: sourceName.includes("SPIEGEL") ? 16711680 : 3447003, // Rot für Spiegel, Blau für den Rest
      footer: { text: `KI-Modell: ${state.provider} | Stand: ${new Date().toLocaleTimeString()}` },
      timestamp: new Date().toISOString()
    }]
  };

  await axios.post(webhookUrl!, discordMessage);
  return { messages: [new AIMessage("✅ Discord-Update gesendet.")] };
}

async function chatNode(state: AgentState) {
  const model = state.provider === "local" ? localModel : googleModel;
  console.log(`💬 Normaler Chat-Modus (${state.provider})...`);
  
  // Einfacher Durchlauf ohne News-Prompt
  const response = await model.invoke(state.messages);
  return { messages: [response] };
}

async function guardrailNode(state: AgentState) {
  console.log("🛡️ Sicherheits-Check aktiv...");

  // Hilfsfunktion, um Content sicher in einen Lowercase-String zu verwandeln
  const getContentAsString = (content: any): string => {
    if (typeof content === 'string') return content.toLowerCase();
    return JSON.stringify(content).toLowerCase();
  };

  // 1. Hole den User-Befehl (Erste Nachricht)
  const userQuery = getContentAsString(state.messages[0].content);
  
  // 2. Hole die KI-Antwort (Letzte Nachricht)
  const aiResponse = getContentAsString(state.messages[state.messages.length - 1].content);

  // 3. Logik: Prüfe auf gefährliche Kombinationen im User-Input
  const isDestructive = userQuery.includes("lösche") || userQuery.includes("delete") || userQuery.includes("prune");
  const isProduction = userQuery.includes("prod") || userQuery.includes("produktion");

  if (isDestructive && isProduction) {
    console.warn("🚨 BLOCKIERT: Destruktiver Befehl auf Produktion erkannt!");
    
    // Wir setzen isSafe auf false UND fügen eine Warn-Nachricht für den User hinzu
    return { 
      isSafe: false,
      messages: [new AIMessage("STOPP: Diese Aktion wurde aus Sicherheitsgründen blockiert. Keine Änderungen an der Produktion erlaubt.")]
    };
  }

  console.log("✅ Check bestanden.");
  return { isSafe: true };
}


const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("scrape", scrapeNewsNode)
  .addNode("reason", reasoningNode)
  .addNode("chat", chatNode)
  .addNode("guardrail", guardrailNode)
  .addNode("action", actionNode)
  .addConditionalEdges(START, routeInput, {
    "news_route": "scrape",            // Gehe zum Scraper
    "chat_route": "chat"               // Gehe zum normalen Chat
  })

  // Pfad für News
  .addEdge("scrape", "reason")
  .addEdge("reason", "guardrail")
  .addConditionalEdges("guardrail", (s) => s.isSafe ? "action" : END)
  .addEdge("action", END)

  // Pfad für normalen Chat (endet sofort nach der Antwort)
  .addEdge("chat", END);

export const graph = workflow.compile();
