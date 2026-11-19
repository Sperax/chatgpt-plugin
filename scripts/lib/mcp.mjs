/**
 * Minimal MCP client over streamable HTTP (JSON-RPC POST, JSON or SSE responses).
 * Shared by scripts/build.mjs (validator) and scripts/site.mjs (Pages site).
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18';
const MCP_TIMEOUT_MS = 30_000;

const parseRpcBody = (contentType, body) => {
  if (contentType.includes('text/event-stream')) {
    const messages = body
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .map((data) => JSON.parse(data));
    return messages.find((m) => 'result' in m || 'error' in m);
  }
  return JSON.parse(body);
};

export const createMcpClient = (url) => {
  let sessionId;
  let nextId = 1;

  return async (method, params) => {
    const headers = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    let response;
    try {
      response = await fetch(url, {
        body: JSON.stringify({ id: nextId++, jsonrpc: '2.0', method, params }),
        headers,
        method: 'POST',
        signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`MCP ${method} request to ${url} failed: ${error.message}`);
    }

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`MCP ${method} returned HTTP ${response.status}: ${body.slice(0, 200)}`);
    }
    sessionId = response.headers.get('mcp-session-id') ?? sessionId;

    let message;
    try {
      message = parseRpcBody(response.headers.get('content-type') ?? '', body);
    } catch {
      throw new Error(`MCP ${method} returned a body that is not JSON-RPC: ${body.slice(0, 200)}`);
    }
    if (!message) throw new Error(`MCP ${method} returned no JSON-RPC response`);
    if (message.error) {
      throw new Error(`MCP ${method} error ${message.error.code}: ${message.error.message}`);
    }
    return message.result;
  };
};

/**
 * Runs initialize and pages through tools/list.
 * Returns the server's capabilities, instructions, serverInfo and every tool definition.
 */
export const fetchLiveMetadata = async (url, clientName) => {
  const rpc = createMcpClient(url);
  const init = await rpc('initialize', {
    capabilities: {},
    clientInfo: { name: clientName, version: '1.0.0' },
    protocolVersion: MCP_PROTOCOL_VERSION,
  });

  const tools = [];
  let cursor;
  do {
    const page = await rpc('tools/list', cursor ? { cursor } : {});
    tools.push(...(page.tools ?? []));
    cursor = page.nextCursor;
  } while (cursor);

  return {
    capabilities: init.capabilities ?? {},
    instructions: init.instructions,
    protocolVersion: init.protocolVersion,
    serverInfo: init.serverInfo,
    tools,
  };
};
