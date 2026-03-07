
// import express from "express"; 
// import { createServer } from "http";
// import { Server } from "socket.io";
// import { graph, AgentState } from "./agent/graph";
// import { HumanMessage } from "@langchain/core/messages";


// //dotenv.config();
// const app = express();
// const httpServer = createServer(app);
// const io = new Server(httpServer, { cors: { origin: "*" } });

// const latencies: number[] = [];
// let totalOverallCost = 0;

// const getP95 = (arr: number[]) => {
//   if (arr.length === 0) return 0;
//   const sorted = [...arr].sort((a, b) => a - b);
//   const pos = Math.floor(sorted.length * 0.95);
//   return sorted[pos];
// };

// io.on("connection", (socket) => {
//   console.log("Client connected:", socket.id);

//   socket.on("run_optimization", async (input: string) => {
//     const startTime = Date.now();
    
//     try {
//       // Nutze new HumanMessage(input) statt { role: "user", ... }
//       const result = (await graph.invoke({ 
//         messages: [new HumanMessage(input)], 
//         costTracking: 0, 
//         isSafe: true 
//       })) as unknown as AgentState;
      
//       const duration = Date.now() - startTime;
//       latencies.push(duration);
      
//       const currentCost = result.costTracking || 0;
//       totalOverallCost += currentCost;

//       const lastMessage = result.messages.length > 0 
//         ? result.messages[result.messages.length - 1].content 
//         : "No response";

//       socket.emit("update", {
//         result: lastMessage,
//         metrics: {
//           p95: getP95(latencies),
//           cost: currentCost,
//           totalCost: totalOverallCost
//         }
//       });
//     } catch (err: any) {
//       console.error("Agent Error:", err);
//       socket.emit("error", err.message);
//     }
//   });
// });

// app.get("/", (req, res) => {
//   res.send("Cloud-Cost-Optimizer API is running. Connect via Socket.io on port 3000.");
// });
// httpServer.listen(3000, () => console.log("Server running on http://localhost:3000"));


// src/server.ts

import "dotenv/config";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first"); // Zwingt Node, IPv4 zu nutzen

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

  socket.on("run_optimization", async (input: string) => {
    console.log("📩 Frage erhalten:", input);
    const startTime = Date.now();
    
    try {
      console.log("🧠 Agent startet Workflow...");
      const result = (await graph.invoke({ 
        messages: [new HumanMessage(input)], 
        costTracking: 0, 
        isSafe: true 
      })) as unknown as AgentState;
      
      console.log("✅ Agent fertig. Nachrichten im State:", result.messages.length);
      
      const duration = Date.now() - startTime;
      const currentCost = result.costTracking || 0;
      totalOverallCost += currentCost;

      const lastMessage = result.messages.length > 0 
        ? result.messages[result.messages.length - 1].content 
        : "Keine Antwort vom Agenten.";

      console.log("📤 Sende Antwort an Frontend:", lastMessage);

      socket.emit("update", {
        result: lastMessage,
        metrics: {
          p95: duration, // Vereinfacht für Test
          cost: currentCost,
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
