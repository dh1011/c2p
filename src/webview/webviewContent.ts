import * as vscode from 'vscode';

export function getWebviewContent(
  treeHtml: string,
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext
): string {
  const toolkitUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'toolkit.min.js')
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${panel.webview.cspSource}; script-src 'unsafe-inline' ${panel.webview.cspSource};">
  <script type="module" src="${toolkitUri}"></script>
  <style>
    body { 
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    
    ul { 
      list-style-type: none; 
      padding-left: 20px; 
    }
    
    li { 
      margin: 4px 0; 
    }
    
    .section {
      border: 1px solid var(--vscode-panel-border);
      padding: 16px;
      margin-bottom: 16px;
      border-radius: 4px;
      background-color: var(--vscode-editor-background);
    }
    
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    
    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    
    .input-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 16px 0;
    }
    
    .progress-container {
      margin-top: 16px;
      display: none;
    }
    
    .progress-bar {
      width: 100%;
      height: 8px;
      background-color: var(--vscode-progressBar-background);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;
    }
    
    .progress-fill {
      height: 100%;
      background-color: var(--vscode-progressBar-foreground);
      transition: width 0.3s ease;
      width: 0%;
    }
    
    .progress-text {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    
    .error-container {
      margin-top: 16px;
      padding: 12px;
      background-color: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      border-radius: 4px;
      color: var(--vscode-inputValidation-errorForeground);
      display: none;
    }
    
    .stats-container {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    
    .stat-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .tree-container {
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 8px;
      background-color: var(--vscode-editor-background);
    }
    
    .node-checkbox {
      margin-right: 8px;
    }
    
    .file-count {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    
    @media (max-width: 600px) {
      .section-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .controls {
        width: 100%;
        justify-content: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="section">
    <div class="section-header">
      <div class="controls">
        <vscode-button id="refreshBtn">
          🔄 Refresh Workspace
        </vscode-button>
        <vscode-button id="countTokensBtn">
          🔢 Count Tokens
        </vscode-button>
      </div>
      <div class="stats-container">
        <div class="stat-item">
          <vscode-label>Total Tokens:</vscode-label>
          <vscode-badge id="totalTokens">-</vscode-badge>
        </div>
        <div class="stat-item">
          <vscode-label>Files:</vscode-label>
          <vscode-badge id="fileCount" class="file-count">0</vscode-badge>
        </div>
      </div>
    </div>
    
    <div class="progress-container" id="progressContainer">
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill"></div>
      </div>
      <div class="progress-text" id="progressText">Loading...</div>
    </div>
    
    <div class="error-container" id="errorContainer">
      <span id="errorMessage"></span>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <vscode-label>Select Files</vscode-label>
      <div class="controls">
        <vscode-button id="selectAllBtn" appearance="secondary">
          ✓ Select All
        </vscode-button>
        <vscode-button id="deselectAllBtn" appearance="secondary">
          ✗ Deselect All
        </vscode-button>
        <vscode-button id="copyStructureBtn" appearance="secondary">
          📋 Copy Structure
        </vscode-button>
      </div>
    </div>
    
    <div class="tree-container" id="treeContainer">
      <div id="tree">
        ${treeHtml}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="input-group">
      <vscode-label for="llmCommand">Enter your query or question:</vscode-label>
      <vscode-text-area 
        id="llmCommand" 
        placeholder="e.g., Summarize the codebase, explain the main functionality, or help me add a new feature..."
        rows="3"
        resize="vertical">
      </vscode-text-area>
    </div>
    <vscode-button id="copyPromptBtn" appearance="primary" disabled>
      📤 Copy Prompt
    </vscode-button>
  </div>

  <script>
    const vscodeApi = acquireVsCodeApi();
    
    // State management
    let isProcessing = false;
    let fileDetails = [];

    // DOM elements
    const elements = {
      totalTokens: document.getElementById('totalTokens'),
      fileCount: document.getElementById('fileCount'),
      refreshBtn: document.getElementById('refreshBtn'),
      countTokensBtn: document.getElementById('countTokensBtn'),
      selectAllBtn: document.getElementById('selectAllBtn'),
      deselectAllBtn: document.getElementById('deselectAllBtn'),
      copyStructureBtn: document.getElementById('copyStructureBtn'),
      copyPromptBtn: document.getElementById('copyPromptBtn'),
      llmCommand: document.getElementById('llmCommand'),
      progressContainer: document.getElementById('progressContainer'),
      progressFill: document.getElementById('progressFill'),
      progressText: document.getElementById('progressText'),
      errorContainer: document.getElementById('errorContainer'),
      errorMessage: document.getElementById('errorMessage'),
      tree: document.getElementById('tree')
    };

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      updateFileCount();
      recalcTotalTokens();
      updateButtonStates();
      setupEventListeners();
    });

    function setupEventListeners() {
      // Button event listeners
      elements.refreshBtn.addEventListener('click', handleRefresh);
      elements.countTokensBtn.addEventListener('click', handleCountTokens);
      elements.selectAllBtn.addEventListener('click', () => setAllCheckboxes(true));
      elements.deselectAllBtn.addEventListener('click', () => setAllCheckboxes(false));
      elements.copyStructureBtn.addEventListener('click', handleCopyStructure);
      elements.copyPromptBtn.addEventListener('click', handleCopyPrompt);
      
      // Input listeners
      elements.llmCommand.addEventListener('input', updateButtonStates);
      
      // Checkbox listeners
      setupCheckboxListeners();
    }

    function setupCheckboxListeners() {
      const checkboxes = document.querySelectorAll('.node-checkbox');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
          handleCheckboxChange(e.target);
          recalcTotalTokens();
          updateButtonStates();
        });
      });
    }

    function handleCheckboxChange(checkbox) {
      const li = checkbox.closest('li');
      const childCheckboxes = li.querySelectorAll('ul .node-checkbox');
      
      // Update child checkboxes
      childCheckboxes.forEach(childCb => {
        childCb.checked = checkbox.checked;
      });

      // Update parent checkboxes
      updateParentCheckboxes(checkbox);
    }

    function updateParentCheckboxes(checkbox) {
      let parentLi = checkbox.closest('li').parentElement.closest('li');
      
      while (parentLi) {
        const parentCheckbox = parentLi.querySelector(':scope > .node-checkbox');
        if (parentCheckbox) {
          const childCheckboxes = parentLi.querySelectorAll('ul .node-checkbox');
          const checkedChildren = parentLi.querySelectorAll('ul .node-checkbox:checked');
          
          parentCheckbox.checked = checkedChildren.length > 0;
          parentCheckbox.indeterminate = checkedChildren.length > 0 && checkedChildren.length < childCheckboxes.length;
        }
        
        parentLi = parentLi.parentElement.closest('li');
      }
    }

    function setAllCheckboxes(checked) {
      const checkboxes = document.querySelectorAll('.node-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = checked;
        cb.indeterminate = false;
      });
      recalcTotalTokens();
      updateButtonStates();
    }

    function recalcTotalTokens() {
      const checkboxes = document.querySelectorAll('.node-checkbox');
      let total = 0;
      let hasValidTokens = false;
      
      checkboxes.forEach(cb => {
        if (cb.checked && cb.hasAttribute('data-tokens')) {
          const tokenStr = cb.getAttribute('data-tokens');
          if (tokenStr && tokenStr !== '-' && !isNaN(tokenStr)) {
            hasValidTokens = true;
            total += parseInt(tokenStr, 10);
          }
        }
      });
      
      elements.totalTokens.textContent = hasValidTokens ? total.toLocaleString() : '-';
    }

    function updateFileCount() {
      const checkboxes = document.querySelectorAll('.node-checkbox[data-tokens]');
      elements.fileCount.textContent = checkboxes.length;
    }

    function updateButtonStates() {
      const hasQuery = elements.llmCommand.value.trim().length > 0;
      const hasSelection = document.querySelectorAll('.node-checkbox[data-tokens]:checked').length > 0;
      
      elements.copyPromptBtn.disabled = !hasQuery || !hasSelection || isProcessing;
      elements.refreshBtn.disabled = isProcessing;
      elements.countTokensBtn.disabled = isProcessing;
    }

    function handleRefresh() {
      if (isProcessing) return;
      isProcessing = true;
      updateButtonStates();
      vscodeApi.postMessage({ command: 'refresh' });
    }

    function handleCountTokens() {
      if (isProcessing) return;
      isProcessing = true;
      updateButtonStates();
      elements.countTokensBtn.textContent = 'Counting...';
      vscodeApi.postMessage({ command: 'countTokens' });
    }

    function handleCopyStructure() {
      const checkedPaths = getCheckedFilePaths();
      if (checkedPaths.length === 0) {
        showError('No files selected. Please select at least one file.');
        return;
      }
      
      const structureText = checkedPaths.join('\\n');
      navigator.clipboard.writeText(structureText).then(() => {
        showTemporaryButtonText(elements.copyStructureBtn, 'Copied!', 'Copy Structure');
      }).catch(err => {
        showError('Failed to copy structure: ' + err.message);
      });
    }

    function handleCopyPrompt() {
      if (isProcessing) return;
      
      const selectedPaths = getCheckedFilePaths();
      const llmQuery = elements.llmCommand.value.trim();
      
      if (selectedPaths.length === 0) {
        showError('No files selected. Please select at least one file.');
        return;
      }
      
      if (!llmQuery) {
        showError('Query is required. Please enter your question or request.');
        elements.llmCommand.focus();
        return;
      }
      
      isProcessing = true;
      updateButtonStates();
      vscodeApi.postMessage({ 
        command: 'copyPrompt', 
        paths: selectedPaths, 
        llmQuery: llmQuery 
      });
    }

    function getCheckedFilePaths() {
      const checkboxes = document.querySelectorAll('.node-checkbox[data-tokens]:checked');
      return Array.from(checkboxes).map(cb => cb.getAttribute('data-path'));
    }

    function showProgress(percentage, message) {
      elements.progressContainer.style.display = 'block';
      elements.progressFill.style.width = percentage + '%';
      elements.progressText.textContent = message;
      elements.errorContainer.style.display = 'none';
    }

    function hideProgress() {
      elements.progressContainer.style.display = 'none';
      isProcessing = false;
      updateButtonStates();
      elements.countTokensBtn.textContent = 'Count Tokens';
    }

    function showError(message) {
      elements.errorContainer.style.display = 'block';
      elements.errorMessage.textContent = message;
      elements.progressContainer.style.display = 'none';
      
      // Auto-hide error after 5 seconds
      setTimeout(() => {
        elements.errorContainer.style.display = 'none';
      }, 5000);
    }

    function showTemporaryButtonText(button, tempText, originalText, duration = 1500) {
      const original = button.textContent;
      button.textContent = tempText;
      setTimeout(() => {
        button.textContent = originalText || original;
      }, duration);
    }

    // Listen for messages from the extension
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.command) {
        case 'promptCopied':
          showTemporaryButtonText(elements.copyPromptBtn, '✅ Copied!', '📤 Copy Prompt');
          hideProgress();
          break;
          
        case 'updateProgress':
          showProgress(message.percentage, message.message);
          break;
          
        case 'hideProgress':
          hideProgress();
          break;
          
        case 'showError':
          showError(message.message);
          hideProgress();
          break;
      }
    });
  </script>
</body>
</html>`;
}