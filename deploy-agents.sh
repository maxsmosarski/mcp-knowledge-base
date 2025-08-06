#!/bin/bash

# Deploy the Agents SDK version to Cloudflare Workers
echo "Deploying MCP server with Agents SDK to Cloudflare Workers..."
wrangler deploy --config wrangler-agents.toml

# Get the deployed URL
echo ""
echo "Deployment complete!"
echo "Your MCP server is available at your worker URL"
echo ""
echo "Test endpoints:"
echo "  - Health check: https://[your-worker].workers.dev/"
echo "  - SSE endpoint: https://[your-worker].workers.dev/sse"
echo "  - MCP endpoint: https://[your-worker].workers.dev/mcp"