import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { createRequire } from "module";

import { ObsidianMcpServer } from "../obsidian";

const sessions = new Map();

export async function installMcpRouter(app) {
  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    console.log(`Processing Session`, sessionId);
    // ── Resume existing session ──
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId);
      console.log(`Resuming`, sessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // ── New session: must start with an initialize request ──
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({ error: "Must start with an initialize request" });
      return;
    }
    // Generate ONE session ID used by both the transport and our store
    console.log(`Recreating`, sessionId);
    const newSessionId = req.headers["mcp-session-id"] || randomUUID();

    const transport = new StreamableHTTPServerTransport({
      // Must return the same ID we store — this is what gets sent to the client
      sessionIdGenerator: () => newSessionId,
      // enableServerSentEvents: true,
    });

    const server = ObsidianMcpServer.factory();

    // Store BEFORE connecting so any immediate reconnect attempt can find it
    sessions.set(newSessionId, { server, transport });

    // Clean up when the session ends
    transport.onclose = () => {
      sessions.delete(newSessionId);
      console.log(`Session ${newSessionId} closed`);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const { server } = sessions.get(sessionId);
    await server.close();
    sessions.delete(sessionId);
    res.status(200).json({ message: "Session terminated" });
  });

  app.get("/mcp/tools", (_req, res) => {
    // Grab tools from any live session (they're all identical)
    const session = sessions.values().next().value;
    if (!session) {
      return res.json({ tools: [], note: "No active sessions yet" });
    }
    console.log(session.server);
    const tools = [];
    for (let k of Object.keys(session.server._registeredTools)) {
      const { title, description } = session.server._registeredTools[k];
      tools.push({ name: title, description });
    }
    res.json({ tools });
  });

  //   express.post("/mcp", statelessHandler(serverFactory));
}
