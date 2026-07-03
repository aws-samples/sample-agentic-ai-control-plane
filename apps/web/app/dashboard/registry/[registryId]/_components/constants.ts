export const SKILL_MD_EXAMPLE = `---
name: pdf-processor
description: Extract text, tables, and metadata from PDF documents.
---
# PDF Processor

This skill helps extract structured data from PDF documents, including:

- Plain text content with layout preservation
- Tables as structured JSON
- Document metadata (author, created date, page count)
- Embedded images and their positions

## When to use

Use this skill when a user asks to analyze, summarize, or extract specific
information from a PDF file. It handles scanned PDFs via OCR and supports
multi-page documents up to 500 pages.

## Example prompts

- "Summarize the key findings in this report.pdf"
- "Extract all tables from invoice-2024.pdf as CSV"
- "Find every mention of 'revenue' in the 10-K filing"
`;

export const MCP_SERVER_PLACEHOLDER =
  '{\n  "name": "io.example/my-server",\n  "description": "Brief description of server functionality",\n  "version": "1.0.0"\n}';

export const MCP_TOOL_PLACEHOLDER =
  '{\n  "tools": [\n    {\n      "name": "my_tool",\n      "description": "A brief description",\n      "inputSchema": { "type": "object" }\n    }\n  ]\n}';

export const A2A_AGENT_CARD_PLACEHOLDER =
  '{\n  "name": "My Agent",\n  "description": "Brief description of what this agent does",\n  "url": "https://api.example.com/a2a",\n  "version": "1.0.0",\n  "protocolVersion": "0.3"\n}';

export const CUSTOM_PLACEHOLDER =
  '{\n  "name": "my-service",\n  "description": "...",\n  "endpoint": "https://..."\n}';

export const AGENT_SKILLS_DEFINITION_PLACEHOLDER =
  '{\n  "repository": { "url": "...", "source": "github" },\n  "packages": []\n}';
