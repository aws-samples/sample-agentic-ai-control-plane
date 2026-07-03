/**
 * Filters a list of MCP tools down to those whose target-name prefix (the
 * segment before the first `___` separator) is in the allowed set.
 *
 * Tool names from the AgentCore Gateway follow the convention:
 *   <TargetName>___<tool_name>
 *
 * e.g. "Calculator___add" → target prefix "Calculator"
 */
export function filterToolsByTargets<T extends { name: string }>(
  tools: T[],
  allowedTargetNames: Set<string>,
): T[] {
  return tools.filter((t) => {
    const idx = t.name.indexOf("___");
    if (idx === -1) return false;
    const prefix = t.name.slice(0, idx);
    return allowedTargetNames.has(prefix);
  });
}
