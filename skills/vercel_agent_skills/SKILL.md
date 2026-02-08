---
description: How to use Vercel Agent Skills to discover and install tools for AI agents.
---

# Vercel Agent Skills (skills.sh)

This skill provides instructions on how to use Vercel's Agent Skills CLI (`npx skills`) to discover, install, and utilize pre-built tools for AI agents.

## Overview

Vercel Agent Skills is like an "App Store" or package manager for AI agent capabilities. Instead of writing tool functions (like web search, crypto price analysis, etc.) from scratch, you can search for and install community-created skills directly into your project.

## Usage

You can use the `npx skills` command directly in your terminal without installing any global package.

### 1. Find a Skill

To search for a skill, use the `find` command with a description of what you need.

```bash
npx skills find "description of capability"
```

**Examples:**
- `npx skills find "search the web"`
- `npx skills find "analyze crypto prices"`
- `npx skills find "get weather"`
- `npx skills find "twitter"`

The CLI will return a list of matching skills (e.g., `@browserbase/browserbase`).

### 2. Install a Skill

Once you've identified a skill package name, use the `add` command to install it.

```bash
npx skills add <package-name>
```

**Example:**
```bash
npx skills add @browserbase/browserbase
```

**What happens:**
- The CLI installs the necessary NPM packages.
- It generates a TypeScript file (usually in `lib/skills/` or similar) containing the tool definition and Zod schema.
- Parameters are automatically configured.

### 3. Use the Skill

After installation, import the tool and pass it to the `tools` object in your Vercel AI SDK function (e.g., `streamText` or `generateText`).

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
// Import the installed skill
import { browserSkill } from '@/lib/skills/browserbase'; 

const result = await generateText({
  model: openai('gpt-4'),
  // Register the tool
  tools: {
    browser: browserSkill,
  },
  prompt: 'Go to example.com and take a screenshot...',
});
```

## Creating Your Own Skill

You can also create and publish your own skills.

```bash
npx skills init my-new-skill
```

This acts as a standardized way to share AI tool logic across different projects and agents.
