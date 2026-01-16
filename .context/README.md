# .context/ - Claude Code Context Management

This folder helps manage Claude Code's context window efficiently, reducing token usage by up to 47%.

## Folder Structure

```
.context/
├── mcp/           # Large MCP tool responses (>50 lines)
├── history/       # Session chat history and key decisions
└── terminal/      # Build/server logs for debugging
```

### mcp/

Store large MCP tool responses here instead of keeping them in active chat context. Any response greater than 50 lines should be saved to a file.

**Example:**
```bash
# Save large search results
echo "$RESPONSE" > .context/mcp/search-results-$(date +%Y%m%d-%H%M%S).md

# Reference later
cat .context/mcp/search-results-*.md | grep "pattern"
```

### history/

Maintain persistent chat history to recover information lost during automatic compaction.

**Example:**
```bash
# Save session state before /compact or /clear
# Ask Claude: "Write a summary of our progress to '.context/history/session-YYYY-MM-DD.md'"

# Resume later
# Ask Claude: "@.context/history/session-2026-01-16.md Let's continue where we left off"
```

### terminal/

Log terminal output for targeted searching instead of re-running commands.

**Example:**
```bash
# Redirect build output to timestamped log
npm run build 2>&1 | tee .context/terminal/build-$(date +%Y%m%d-%H%M%S).log

# When debugging, search logs instead of re-running:
grep -i "error" .context/terminal/build-*.log

# Or read only the last 20 lines:
tail -20 .context/terminal/build-latest.log
```

## Environment Setup

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, or Windows equivalent):

```bash
# Enable on-demand MCP tool loading (saves ~32k tokens / 47% reduction)
export ENABLE_EXPERIMENTAL_MCP_CLI=true

# Optional: Increase MCP output token limit (default: 25,000)
export MAX_MCP_OUTPUT_TOKENS=50000
```

## Context Management Commands

| Command | Purpose |
|---------|---------|
| `/context` | View current token usage breakdown |
| `/compact` | Compress conversation history (use at 70% capacity) |
| `/clear` | Reset context completely (use between unrelated tasks) |

## Best Practices

1. **Monitor actively**: Run `/context` regularly to check token usage
2. **Compact at 70%**: Don't wait for auto-compaction at 95%
3. **Clear at breakpoints**: After features, before unrelated work, after commits
4. **Save before clearing**: Always save important decisions to history/
5. **Search don't re-run**: Use grep on terminal logs instead of re-running tests

## Strategic Breakpoints

Use `/compact` or `/clear` at these natural points:
- After completing a feature
- Before starting unrelated work
- After making a git commit
- When switching between frontend/backend
- When context meter reaches 70%

## Research Sources

- [Claude Code's Hidden MCP Flag](https://paddo.dev/blog/claude-code-hidden-mcp-flag/) - 32k token savings
- [Managing Claude Code Context](https://mcpcat.io/guides/managing-claude-code-context/) - Best practices
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) - MAX_MCP_OUTPUT_TOKENS
