import * as vscode from 'vscode';
import { countTokens } from '@anthropic-ai/tokenizer';

export function activate(context: vscode.ExtensionContext) {
  // Register the command to show file names, their content, and token counts.
  const showFileContentCommand = vscode.commands.registerCommand('c2p.showFileContent', async () => {
    if (!vscode.workspace.workspaceFolders) {
      vscode.window.showWarningMessage('No workspace is open.');
      return;
    }

    // Search for all files in the workspace, excluding node_modules.
    const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');

    // Create a TextDecoder to convert file buffers into strings.
    const decoder = new TextDecoder('utf-8');

    // Read each file's content and count tokens.
    const fileDetails = await Promise.all(
      files.map(async file => {
        try {
          const contentBuffer = await vscode.workspace.fs.readFile(file);
          const content = decoder.decode(contentBuffer);
          const tokens = countTokens(content);
          return {
            path: vscode.workspace.asRelativePath(file),
            content,
            tokens
          };
        } catch (error) {
          // Handle errors (e.g., binary files or permission issues)
          return {
            path: vscode.workspace.asRelativePath(file),
            content: '[Unable to read file content]',
            tokens: 0
          };
        }
      })
    );

    // Create a new WebView panel to display the file details.
    const panel = vscode.window.createWebviewPanel(
      'fileContentPanel',
      'Workspace Files, Content & Token Count',
      vscode.ViewColumn.One,
      { enableScripts: false }
    );

    // Set the HTML content for the WebView panel.
    panel.webview.html = getWebviewContent(fileDetails);
  });

  context.subscriptions.push(showFileContentCommand);

  // Create a status bar item with an icon to trigger the file content display.
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(file-directory) Show Files, Content & Tokens';
  statusBarItem.tooltip = 'Click to display file names, their content, and token counts from the workspace';
  statusBarItem.command = 'c2p.showFileContent';
  statusBarItem.show();

  context.subscriptions.push(statusBarItem);
}

// Helper function to escape HTML special characters.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

// Build the HTML content for the WebView.
function getWebviewContent(fileDetails: { path: string, content: string, tokens: number }[]): string {
  let fileListHtml = '';

  if (fileDetails.length === 0) {
    fileListHtml = '<p>No files found in the current workspace.</p>';
  } else {
    for (const file of fileDetails) {
      fileListHtml += `<h2>${escapeHtml(file.path)} (Tokens: ${file.tokens})</h2>`;
      fileListHtml += `<pre style="white-space: pre-wrap; background-color: #f9f9f9; padding: 10px; border: 1px solid #ddd;">${escapeHtml(file.content)}</pre>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspace Files, Content & Token Count</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    h1 { color: #333; }
    h2 { border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 20px; }
    pre { overflow: auto; }
  </style>
</head>
<body>
  <h1>Files, Their Content, and Token Count</h1>
  ${fileListHtml}
</body>
</html>`;
}

export function deactivate() {}
