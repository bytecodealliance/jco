import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const client = new Client(
    { name: 'jco-example-client', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
);

const url = new URL(process.env.MCP_URL ?? 'http://127.0.0.1:3000/mcp');

try {
    await client.connect(new StreamableHTTPClientTransport(url));

    const { tools } = await client.listTools();
    console.log('Tools:', tools.map((tool) => tool.name).join(', '));

    const result = await client.callTool({
        name: 'inspect-text',
        arguments: {
            filename: 'notes/../greeting.txt',
            chunks: ['Hello, ', '🌍!'],
        },
    });

    console.log(JSON.stringify(result.structuredContent, null, 2));
} finally {
    await client.close();
}
