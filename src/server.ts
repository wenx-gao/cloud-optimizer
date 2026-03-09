
import "dotenv/config";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first"); 

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { graph, AgentState } from "./agent/graph";
import { HumanMessage } from "@langchain/core/messages";

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
