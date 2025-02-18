# C2P - Code to Prompt

C2P (Code to Prompt) is a VS Code extension that helps you prepare your codebase for Large Language Model (LLM) interactions. It allows you to select specific files from your workspace, formats them with clear file path headers, and creates a prompt that you can easily copy and paste into your preferred LLM interface.

## Features

- 📁 Interactive file tree view of your workspace
- 🔍 Smart file filtering (respects .gitignore)
- 📊 Token counting for each file and total selection
- 📋 One-click copying of formatted prompts
- ⚙️ Configurable settings for maximum files and tokens

## Installation

1. Open VS Code
2. Go to the Extensions view (Ctrl+Shift+X)
3. Search for "C2P"
4. Click Install

## Usage

1. Click the "C2P - Code to Prompt" button in the status bar or use the command palette (Ctrl+Shift+P) and search for "C2P: Open Control Panel"

2. In the control panel:
   - Select the files you want to include in your prompt
   - Monitor the total token count
   - Enter your query/question for the LLM
   - Click "Copy Prompt" to copy the formatted content to your clipboard

3. Paste the generated prompt into your preferred LLM interface

## Configuration

The extension provides several configuration options:

- `c2p.maxFiles`: Maximum number of files that can be processed (default: 100)
- `c2p.maxPromptTokens`: Maximum allowed tokens in the final prompt (default: 32000)
- `c2p.useGitignore`: Whether to respect .gitignore patterns (default: true)
- `c2p.excludedFolders`: Additional folders to exclude
- `c2p.excludedFiles`: Additional file patterns to exclude

## Notes

- The extension automatically excludes binary files and common non-text formats
- Token counting uses the Claude/Anthropic tokenizer
- File paths are formatted as headers (e.g., "FILE: /src/index.js") for clear organization

## License

MIT
