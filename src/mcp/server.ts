import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "cloud-optimizer-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_infrastructure_costs",
      description: "Fetches current cloud cost and resource usage.",
      inputSchema: { type: "object", properties: { region: { type: "string" } } }
    },
    {
      name: "apply_cost_optimization",
      description: "Executes a script to downscale or delete resources.",
      inputSchema: { type: "object", properties: { action_id: { type: "string" }, resource_id: { type: "string" } } }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "get_infrastructure_costs") {
    // Simulated cloud data
    return { content: [{ type: "text", text: JSON.stringify([{ id: "ec2-01", type: "t3.large", cost: 45.0, idle: true }, { id: "s3-01", type: "standard", cost: 12.0, idle: false }]) }] };
  }
  return { content: [{ type: "text", text: "Action executed successfully." }] };
});

const transport = new StdioServerTransport();
server.connect(transport);
