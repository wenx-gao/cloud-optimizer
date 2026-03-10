import axios from "axios";
import * as cheerio from "cheerio";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages"; 
import Parser from "rss-parser";


const rssParser = new Parser();

const TECH_SOURCES = {
  techcrunch: {
    // Stabile TechCrunch AI URL
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    name: "TechCrunch AI"
  },
  verge: {
    // Die stabilste URL für The Verge (Main Feed)
    url: "https://www.theverge.com/rss/index.xml",
    name: "The Verge AI"
  }
};

// const NEWS_SOURCES = {
//   zeit: {
//     url: "https://www.zeit.de/index",
//     selector: "article h2, article h3",
//     name: "ZEIT Online"
//   },
//   spiegel: {
//     url: "https://www.spiegel.de",
//     selector: "article h2",
//     name: "DER SPIEGEL"
//   },
//   faz: {
//     url: "https://www.faz.net/aktuell",
//     selector: ".tsr-Base_HeadlineText, article h2",
//     name: "FAZ.NET"
//   },
//   welt: {
//     url: "https://www.welt.de",
//     selector: "article h2",
//     name: "WELT"
//   }
// };


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
  // Wir holen die letzte Nachricht des Users
  const lastMessage = state.messages[state.messages.length - 1];
  const userQuery = typeof lastMessage.content === 'string' 
    ? lastMessage.content.toLowerCase() 
    : JSON.stringify(lastMessage.content).toLowerCase();

  // ERWEITERTE KEYWORD-LISTE
  const newsKeywords = [
    "news", "schlagzeilen", "nachrichten", "update", "bericht", "neues", 
    "zeit", "spiegel", "faz", "welt", "verge", "techcrunch", "rss"
  ];
  
  // Prüfen, ob IRGENDEINES der Keywords im Text vorkommt
  const isNewsRequest = newsKeywords.some(keyword => userQuery.includes(keyword));

  console.log("  [UserQuery] ", userQuery);

  if (isNewsRequest) {
    console.log("🛤️ Route gewählt: NEWS-SERVICE (Tech-Update)");
    return "news_route";
  }
  
  console.log("🛤️ Route gewählt: SIMPLE-CHAT");
  return "chat_route";
}


async function scrapeNewsNode(state: AgentState) {
  const userQuery = state.messages[state.messages.length - 1].content.toLowerCase();
  
  let sourceKey: keyof typeof TECH_SOURCES = "techcrunch";
  if (userQuery.includes("verge")) sourceKey = "verge";

  const source = TECH_SOURCES[sourceKey];
  console.log(`📡 Rufe RSS-Feed ab: ${source.name}...`);

  try {
    const feed = await rssParser.parseURL(source.url);
    
    const articles = feed.items.slice(0, 5).map(item => {
      return `TITLE: ${item.title}\nSUMMARY: ${item.contentSnippet || item.content}\n---`;
    });

    return { 
      scrapedData: articles.join("\n"),
      sourceName: source.name // Erfolg: Name wird gesetzt
    };
  } catch (error: any) {
    console.error(`❌ RSS Fehler bei ${source.name}:`, error.message);
    return { 
      scrapedData: `FEHLER_BEIM_RSS_FEED: ${error.message}`,
      sourceName: source.name // WICHTIG: Name auch im Fehlerfall mitschicken!
    };
  }
}


async function reasoningNode(state: AgentState) {
  const model = state.provider === "local" ? localModel : googleModel;
  
  // Falls ein Fehler im Scraper aufgetreten ist
  if (state.scrapedData.startsWith("FEHLER")) {
    return { 
      messages: [new AIMessage(`Leider gab es ein Problem beim Abrufen der News von ${state.sourceName}.`)] 
    };
  }

  const prompt = `
    Du bist ein Senior AI Specialist. Hier sind die neuesten Schlagzeilen von ${state.sourceName}:
    ${state.scrapedData}
    ... (Rest des Prompts wie gehabt)
  `;
  
  const response = await model.invoke([new HumanMessage(prompt)]);
  return { messages: [response] };
}

// NODE 3: Discord Action
async function actionNode(state: AgentState) {
  // Nur wenn es wirklich News-Daten gibt, nutzen wir den Webhook
  if (state.scrapedData && state.scrapedData.length > 0) {
    const summary = state.messages[state.messages.length - 1].content;
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    
    // Optional: Hier könntest du prüfen, ob die Anfrage von Discord kam,
    // um Dopplungen zu vermeiden.
    if (webhookUrl && !state.messages[0].content.includes("!agent")) {
        await axios.post(webhookUrl, { content: summary });
    }
  }
  return { messages: [new AIMessage("Aktion abgeschlossen.")] };
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
    "news_route": "scrape",            // goto Scraper
    "chat_route": "chat"               // goto normalen Chat
  })

  // Path for News
  .addEdge("scrape", "reason")
  .addEdge("reason", "guardrail")
  .addConditionalEdges("guardrail", (s) => s.isSafe ? "action" : END)
  .addEdge("action", END)

  // Path for normal Chat (ends after the answer)
  .addEdge("chat", END);

export const graph = workflow.compile();
