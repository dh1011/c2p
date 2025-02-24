import * as vscode from 'vscode';
import { countTokens } from '@anthropic-ai/tokenizer';

interface FileDetail {
  path: string;
  tokens: number | null;
  content: string;
}

interface TreeNode {
  name: string;
  isFile: boolean;
  tokens?: number | null;
  content?: string;
  children: { [key: string]: TreeNode };
}

export function activate(context: vscode.ExtensionContext) {
  const c2pControlPanelCommand = vscode.commands.registerCommand('c2p.controlPanel', async () => {
    if (!vscode.workspace.workspaceFolders) {
      vscode.window.showWarningMessage('No workspace is open.');
      return;
    }
    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const config = vscode.workspace.getConfiguration('c2p');
    const maxFiles = config.get<number>('maxFiles', 100);
    const maxPromptTokens = config.get<number>('maxPromptTokens', 32000);
    const useGitignore = config.get<boolean>('useGitignore', true);

    // Create the WebView panel.
    const panel = vscode.window.createWebviewPanel(
      'c2pPanel',
      'C2P - Code to Prompt',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    // Initially populate the WebView content without computing token counts.
    await updateWebviewContent(panel, workspaceFolder.uri, config, maxFiles, maxPromptTokens, useGitignore, context);

    // Listen for messages from the WebView.
    panel.webview.onDidReceiveMessage(async message => {
      if (message.command === 'copyPrompt') {
        const selectedPaths: string[] = message.paths; // array of relative paths
        const llmQuery: string = message.llmQuery; // user-entered LLM query

        let promptText = "I am providing you with the codebase for the project. The codebase is organized such that each file is preceded by a header indicating its path (e.g., \"FILE: /src/module/file.py\") followed by its contents.\n\n";
        for (const relPath of selectedPaths) {
          try {
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, relPath);
            const buffer = await vscode.workspace.fs.readFile(fileUri);
            const content = new TextDecoder('utf-8').decode(buffer);
            promptText += `FILE: /${relPath}\n${content}\n\n`;
          } catch (error) {
            console.error(`Failed to read ${relPath}:`, error);
          }
        }
        promptText += llmQuery; // Append the user's query at the end

        const promptTokens = countTokens(promptText);
        if (promptTokens > maxPromptTokens) {
          vscode.window.showErrorMessage(`The prompt token count (${promptTokens}) exceeds the maximum allowed (${maxPromptTokens}). Please deselect some files or adjust the configuration.`);
          return;
        }

        await vscode.env.clipboard.writeText(promptText);
        panel.webview.postMessage({ command: 'promptCopied' });
      } else if (message.command === 'refresh') {
        // Re-scan the workspace and update the WebView content without computing tokens.
        await updateWebviewContent(panel, workspaceFolder.uri, config, maxFiles, maxPromptTokens, useGitignore, context);
      } else if (message.command === 'countTokens') {
        // Re-scan the workspace and update the WebView content while computing token counts.
        await updateWebviewContent(panel, workspaceFolder.uri, config, maxFiles, maxPromptTokens, useGitignore, context, true);
      }
    });
  });

  context.subscriptions.push(c2pControlPanelCommand);

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(word-wrap) C2P';
  statusBarItem.tooltip = 'Click to display the C2P control panel';
  statusBarItem.command = 'c2p.controlPanel';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

// Now update the signature to accept a flag for computing tokens.
async function updateWebviewContent(
  panel: vscode.WebviewPanel,
  workspaceFolder: vscode.Uri,
  config: vscode.WorkspaceConfiguration,
  maxFiles: number,
  maxPromptTokens: number,
  useGitignore: boolean,
  context: vscode.ExtensionContext,
  computeTokens: boolean = false
) {
  // --- Build Ignore Patterns ---
  const excludedFolders = config.get<string[]>('excludedFolders', [
    'node_modules', 
    'venv', 
    '__pycache__', 
    '.git', 
    'dist', 
    'build',
    '.*'
  ]);
  let folderPatterns: string[] = excludedFolders.map(folder => `**/${folder}/**`);
  
  // Always exclude non-textual files
  const nonTextualPatterns = [
    // Images
    '**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.gif', '**/*.bmp', '**/*.ico', '**/*.webp', '**/*.svg', '**/*.tiff',
    // Videos
    '**/*.mp4', '**/*.webm', '**/*.avi', '**/*.mov', '**/*.wmv', '**/*.flv', '**/*.mkv',
    // Audio
    '**/*.mp3', '**/*.wav', '**/*.ogg', '**/*.m4a', '**/*.aac',
    // Documents
    '**/*.pdf', '**/*.doc', '**/*.docx', '**/*.xls', '**/*.xlsx', '**/*.ppt', '**/*.pptx',
    // Archives
    '**/*.zip', '**/*.rar', '**/*.7z', '**/*.tar', '**/*.gz', '**/*.bz2',
    // Other binary files
    '**/*.exe', '**/*.dll', '**/*.so', '**/*.dylib', '**/*.class', '**/*.pyc',
    '**/*.bin', '**/*.dat', '**/*.db', '**/*.sqlite', '**/*.sqlite3',
    // Design files
    '**/*.psd', '**/*.ai', '**/*.sketch', '**/*.fig',
    // Font files
    '**/*.ttf', '**/*.otf', '**/*.woff', '**/*.woff2', '**/*.eot'
  ];

  const excludedFiles = config.get<string[]>('excludedFiles', ['**/.*']);
  let filePatterns: string[] = [...nonTextualPatterns, ...excludedFiles];

  if (useGitignore) {
    try {
      const gitignoreUri = vscode.Uri.joinPath(workspaceFolder, '.gitignore');
      const gitignoreBuffer = await vscode.workspace.fs.readFile(gitignoreUri);
      const gitignoreContent = new TextDecoder('utf-8').decode(gitignoreBuffer);
      const lines = gitignoreContent.split(/\r?\n/);
      for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) {
          continue;
        }
        if (line.endsWith('/')) {
          let folder = line.slice(0, -1);
          if (folder.startsWith('/')) { folder = folder.slice(1); }
          folderPatterns.push(`**/${folder}/**`);
        } else {
          let pattern = line.startsWith('/') ? line.slice(1) : line;
          filePatterns.push(pattern);
        }
      }
    } catch (err) {
      // No .gitignore found; continue with defaults.
    }
  }
  // Always ignore the .gitignore file itself.
  filePatterns.push('.gitignore');

  const combinedPatterns = [...folderPatterns, ...filePatterns];
  const ignorePattern = combinedPatterns.length > 0 ? `{${combinedPatterns.join(',')}}` : '';

  // --- Find Files ---
  const files = await vscode.workspace.findFiles('**/*', ignorePattern);
  if (files.length > maxFiles) {
    vscode.window.showErrorMessage(
      `Too many files in the workspace. Maximum allowed is ${maxFiles}, but found ${files.length}.`
    );
    return;
  }

  const decoder = new TextDecoder('utf-8');
  const fileDetails: FileDetail[] = await Promise.all(
    files.map(async file => {
      try {
        const contentBuffer = await vscode.workspace.fs.readFile(file);
        const content = decoder.decode(contentBuffer);
        // Compute tokens only if requested; otherwise, leave as null.
        const tokens = computeTokens ? countTokens(content) : null;
        return { path: vscode.workspace.asRelativePath(file), tokens, content };
      } catch (error) {
        return { path: vscode.workspace.asRelativePath(file), tokens: null, content: '' };
      }
    })
  );

  // --- Build File Tree ---
  const fileTree = buildFileTree(fileDetails);
  const treeHtml = `<ul>${Object.keys(fileTree.children)
    .sort()
    .map(child => treeToHtml(fileTree.children[child], ''))
    .join('')}</ul>`;
  const textLines = treeToText(fileTree).join('\n');

  // Update the WebView HTML.
  panel.webview.html = getWebviewContent(treeHtml, textLines, panel, context);
}

function buildFileTree(details: FileDetail[]): TreeNode {
  const root: TreeNode = { name: '', isFile: false, children: {} };
  details.forEach(detail => {
    const parts = detail.path.split(/[\/\\]/);
    let current = root;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        current.children[part] = {
          name: part,
          isFile: true,
          tokens: detail.tokens,
          content: detail.content,
          children: {}
        };
      } else {
        if (!current.children[part]) {
          current.children[part] = { name: part, isFile: false, children: {} };
        }
        current = current.children[part];
      }
    });
  });
  return root;
}

// Convert the tree to an HTML list with checkboxes.  
// If a file's token count is not computed, display a placeholder “–”.
function treeToHtml(node: TreeNode, parentPath: string): string {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  if (node.isFile) {
    return `<li>
      <vscode-checkbox class="node-checkbox" data-path="${currentPath}" data-tokens="${node.tokens !== null ? node.tokens : '-'}" checked>
        ${escapeHtml(node.name)} <vscode-badge>${node.tokens !== null ? node.tokens : '-'}</vscode-badge>
      </vscode-checkbox>
    </li>`;
  } else {
    let childrenHtml = '';
    const keys = Object.keys(node.children).sort();
    keys.forEach(key => {
      childrenHtml += treeToHtml(node.children[key], currentPath);
    });
    return `<li>
      <vscode-checkbox class="node-checkbox" data-path="${currentPath}" checked>
        <strong>${escapeHtml(node.name)}</strong>
      </vscode-checkbox>
      ${childrenHtml ? `<ul>${childrenHtml}</ul>` : ''}
    </li>`;
  }
}

// Convert the tree to a text representation (only file paths; token counts are not included).
function treeToText(node: TreeNode, currentPath: string = ''): string[] {
  let lines: string[] = [];
  if (!node.isFile && currentPath !== '') {
    lines.push(currentPath);
  }
  const keys = Object.keys(node.children).sort();
  for (const key of keys) {
    const child = node.children[key];
    const newPath = currentPath ? `${currentPath}/${child.name}` : child.name;
    if (child.isFile) {
      lines.push(newPath);
    } else {
      lines = lines.concat(treeToText(child, newPath));
    }
  }
  return lines;
}

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

// Build the WebView HTML content.
function getWebviewContent(
  treeHtml: string, 
  defaultText: string, 
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script type="module" src="${panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js')
  )}"></script>
  <style>
    body { 
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
    }
    ul { list-style-type: none; padding-left: 20px; }
    li { margin: 4px 0; }
    .section {
      border: 1px solid var(--vscode-panel-border);
      padding: 16px;
      margin-bottom: 16px;
      border-radius: 4px;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .input-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 16px 0;
    }
  </style>
</head>
<body>
  <div class="section">
    <div class="section-header">
      <vscode-button id="refreshBtn">
        Refresh Workspace
      </vscode-button>
      <vscode-button id="countTokensBtn">
        Count Tokens
      </vscode-button>
    </div>
    <div style="margin-top: 8px;">
      <vscode-label>Total Tokens:</vscode-label>
      <vscode-badge id="totalTokens">-</vscode-badge>
    </div>
  </div>

  <div class="section">
    <div id="tree">
      ${treeHtml}
    </div>
    <div class="controls">
      <vscode-button id="copyStructureBtn">Copy File Structure</vscode-button>
    </div>
  </div>

  <div class="section">
    <div class="input-group">
      <vscode-label for="llmCommand">Enter your query</vscode-label>
      <vscode-text-field id="llmCommand" placeholder="e.g., Summarize the codebase"></vscode-text-field>
    </div>
    <vscode-button id="copyPromptBtn" appearance="primary" disabled>Copy Prompt</vscode-button>
  </div>

  <pre id="structureText" style="display:none;"></pre>
  <script>
    const vscodeApi = acquireVsCodeApi();

    // Recalculate total tokens from checked file nodes.
    function recalcTotalTokens() {
      const checkboxes = document.querySelectorAll('.node-checkbox');
      let total = 0;
      let anyCounted = false;
      checkboxes.forEach(cb => {
        if (cb.checked && cb.hasAttribute('data-tokens')) {
          const tokenStr = cb.getAttribute('data-tokens');
          if (tokenStr && tokenStr !== '-' && tokenStr !== null) {
            anyCounted = true;
            total += Number(tokenStr);
          }
        }
      });
      document.getElementById('totalTokens').textContent = anyCounted ? total.toString() : '-';
    }

    // When the DOM content is loaded, recalc tokens (if any are computed).
    document.addEventListener('DOMContentLoaded', recalcTotalTokens);

    // Sync child checkboxes with parent checkbox.
    document.querySelectorAll('.node-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const li = cb.closest('li');
        const childCheckboxes = li.querySelectorAll('ul .node-checkbox');
        childCheckboxes.forEach(childCb => {
          childCb.checked = cb.checked;
        });
        // Update total tokens (will show '-' if tokens are not computed).
        recalcTotalTokens();
      });
    });

    // When "Count Tokens" is clicked, disable and grey out the button while waiting.
    document.getElementById('countTokensBtn').addEventListener('click', () => {
      const btn = document.getElementById('countTokensBtn');
      btn.disabled = true;
      btn.textContent = 'Counting...';
      vscodeApi.postMessage({ command: 'countTokens' });
    });

    // Enable or disable the Copy LLM Context Prompt button based on query input.
    const llmCommandInput = document.getElementById('llmCommand');
    const copyPromptBtn = document.getElementById('copyPromptBtn');
    llmCommandInput.addEventListener('input', () => {
      copyPromptBtn.disabled = llmCommandInput.value.trim().length === 0;
    });

    // Copy file structure as text.
    document.getElementById('copyStructureBtn').addEventListener('click', () => {
      const treeDiv = document.getElementById('tree');
      const ul = treeDiv.querySelector('ul');
      let structureText = '';
      if (ul) {
        const lines = getCheckedStructure(ul);
        structureText = lines.join('\\n');
      }
      navigator.clipboard.writeText(structureText).then(() => {
        const btn = document.getElementById('copyStructureBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy File Structure'; }, 1500);
      }).catch(err => {
        alert('Failed to copy structure: ' + err);
      });
    });

    // Get structure (paths only) from checked nodes.
    function getCheckedStructure(ul) {
      let lines = [];
      const liElements = ul.children;
      for (const li of liElements) {
        const checkbox = li.querySelector('.node-checkbox');
        if (checkbox && checkbox.checked) {
          const path = checkbox.getAttribute('data-path');
          if (path) {
            const childUl = li.querySelector('ul');
            if (childUl) {
              lines = lines.concat(getCheckedStructure(childUl));
            } else {
              lines.push(path);
            }
          }
        }
      }
      return lines;
    }

    // When "Copy LLM Context Prompt" is clicked, gather selected file paths and the query, then send to extension.
    copyPromptBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('.node-checkbox');
      let selectedPaths = [];
      checkboxes.forEach(cb => {
        if (cb.checked && cb.hasAttribute('data-tokens')) {
          selectedPaths.push(cb.getAttribute('data-path'));
        }
      });
      const llmQuery = llmCommandInput.value.trim();
      vscodeApi.postMessage({ command: 'copyPrompt', paths: selectedPaths, llmQuery: llmQuery });
    });

    // When "Refresh Workspace" is clicked, send a refresh command.
    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscodeApi.postMessage({ command: 'refresh' });
    });

    // Listen for messages from the extension host.
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.command === 'promptCopied') {
        const btn = document.getElementById('copyPromptBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy LLM Context Prompt'; }, 1500);
      }
    });
  </script>
</body>
</html>`;
}

export function deactivate() {}
