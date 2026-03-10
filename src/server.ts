
import { Client, GatewayIntentBits } from 'discord.js';
//import { HumanMessage } from "@langchain/core/messages";
import "dotenv/config";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first"); 

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { graph, AgentState } from "./agent/graph";
import { HumanMessage } from "@langchain/core/messages";


const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

discordClient.once('clientReady', (c) => {
  console.log(`🤖 Discord Bot ist online! Angemeldet als ${c.user.tag}`);
});


// Wenn jemand eine Nachricht im Discord schreibt
discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!agent')) {
    const userInput = message.content.replace('!agent', '').trim();
    
    try {
      // Hier stand vorher "google", ändere es auf "local"
      const result = await graph.invoke({
        messages: [new HumanMessage(userInput)],
        provider: "local", // <--- Hier auf "local" setzen für Llama3
        sourceName: "Discord-Anfrage",
        isSafe: true,
        costTracking: 0,
        scrapedData: ""
      }) as any;

      // Die KI-Antwort extrahieren (Logik wie beim Frontend)
      const aiResponse = result.messages.find((m: any) => m._getType() === "ai")?.content 
                        || "Ich konnte keine Antwort generieren.";

      message.reply(`### 🤖 KI-Antwort (Lokal)\n${aiResponse}\n\n*Generiert via Ollama & LangGraph*`);

    } catch (error) {
      console.error("Discord Agent Fehler:", error);
      message.reply("❌ Fehler beim Aufruf des lokalen Modells.");
    }
  }
});

// Test-Log hinzufügen
console.log("🔍 Prüfe Discord Token:", process.env.DISCORD_TOKEN ? "Gefunden (Länge: " + process.env.DISCORD_TOKEN.length + ")" : "NICHT GEFUNDEN!");

// Login-Teil
discordClient.login(process.env.DISCORD_TOKEN);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

let totalOverallCost = 0;

io.on("connection", (socket) => {
  console.log("🟢 Client verbunden:", socket.id);

  socket.on("run_optimization", async (data) => {
    const userInput = typeof data === 'string' ? data : data.input;
    const userProvider = data.provider || "google"; 

    const startTime = Date.now();
        
    try {
      console.log("🧠 Agent startet Workflow...");
      const result = (await graph.invoke({ 
        messages: [new HumanMessage(userInput)], 
        costTracking: 0, 
        isSafe: true,
        scrapedData: "",
        provider: userProvider
      })) as unknown as AgentState;
      
      console.log("✅ Agent fertig. Nachrichten im State:", result.messages.length);
      
      const duration = Date.now() - startTime;
      const currentCost = result.costTracking || 0;
      totalOverallCost += currentCost;

    // Wir extrahieren die KI-Antwort sicher
    let mainResponse = "Analyse abgeschlossen.";

    // Wir gehen das Nachrichten-Array von hinten nach vorne durch
    for (let i = result.messages.length - 1; i >= 0; i--) {
      const m = result.messages[i];
      
      // 1. Prüfen, ob es eine KI-Nachricht ist (Typ "ai")
      if (m._getType() === "ai") {
        // 2. Den Content sicher in einen String umwandeln
        const contentStr = typeof m.content === 'string' 
          ? m.content 
          : JSON.stringify(m.content);

        // 3. Wir ignorieren die technische Nachricht der Action-Node
        if (!contentStr.includes("Optimierung") && !contentStr.includes("SYSTEM:")) {
          mainResponse = contentStr;
          break; // Wir haben die eigentliche Analyse gefunden!
        }
      }
    }

    console.log("📤 Sende KI-Antwort an Frontend:", mainResponse);

    socket.emit("update", {
      result: mainResponse,
      metrics: {
        p95: duration,
        cost: result.costTracking,
        totalCost: totalOverallCost
      }
    });
    } catch (err: any) {
      console.error("❌ AGENT FEHLER:", err);
      socket.emit("error", err.message);
    }
  });

  socket.on("disconnect", () => console.log("🔴 Client getrennt"));
});

httpServer.listen(3000, () => console.log("🚀 Server läuft auf http://localhost:3000"));
