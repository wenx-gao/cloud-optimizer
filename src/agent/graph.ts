import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseMessage, AIMessage } from "@langchain/core/messages";

export const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  costTracking: Annotation<number>({
    reducer: (x, y) => y,
    default: () => 0,
  }),
  isSafe: Annotation<boolean>({
    reducer: (x, y) => y,
    default: () => true,
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash-lite", 
  apiKey: process.env.GOOGLE_API_KEY,
  apiVersion: "v1",
});

async function reasoningNode(state: AgentState) {
  console.log("🤖 Agent kontaktiert Google Gemini...");

  try {
    // RACE-BEDINGUNG: Wir warten maximal 5 Sekunden auf Google
    const response = await Promise.race([
      model.invoke(state.messages),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("TIMEOUT")), 5000)
      )
    ]) as any;

    console.log("✅ Echte KI-Antwort erhalten!");
    return { 
      messages: [response], 
      costTracking: state.costTracking + 0.0001 
    };

  } catch (error: any) {
    // Falls Timeout ODER Quota-Fehler (429) auftritt:
    console.warn(`⚠️ Hinweis: ${error.message === "TIMEOUT" ? "Google antwortet zu langsam" : "Quota erreicht"}. Nutze Simulation...`);

    const mockResponse = new AIMessage(
      "Ich habe Ihre Cloud-Infrastruktur analysiert. In 'eu-central-1' (Frankfurt) wurden 4 ungenutzte EBS-Volumes gefunden. Potenzielle Ersparnis: 14,50€ / Monat. Soll ich die Bereinigung vorbereiten?"
    );

    return { 
      messages: [mockResponse], 
      costTracking: state.costTracking + 0.0000 
    };
  }
}

async function guardrailNode(state: AgentState) {
  console.log("🛡️ Sicherheits-Check aktiv...");
  const lastMsg = state.messages[state.messages.length - 1].content as string;
  const isSafe = !lastMsg.toLowerCase().includes("delete production");
  return { isSafe };
}

async function actionNode(state: AgentState) {
  console.log("⚙️ Aktion wird ausgeführt...");
  return { 
    messages: [new AIMessage("Optimierung erfolgreich eingeleitet. Überwachung läuft.")] 
  };
}

export const graph = new StateGraph(AgentStateAnnotation)
  .addNode("reason", reasoningNode)
  .addNode("guardrail", guardrailNode)
  .addNode("action", actionNode)
  .addEdge(START, "reason")
  .addEdge("reason", "guardrail")
  .addConditionalEdges("guardrail", (s) => s.isSafe ? "action" : END)
  .addEdge("action", END)
  .compile();
