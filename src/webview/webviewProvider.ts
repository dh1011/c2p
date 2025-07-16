import * as vscode from 'vscode';
import { FileDetail, WebviewMessage, ExtensionConfig } from '../types';
import { FileService } from '../services/fileService';
import { TokenService } from '../services/tokenService';
import { ErrorService } from '../services/errorService';
import { TreeUtils } from '../utils/treeUtils';
import { getWebviewContent } from './webviewContent';

export class WebviewProvider {
  public readonly panel: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;
  private workspaceFolder: vscode.Uri;
  private config: ExtensionConfig;
  private fileDetails: FileDetail[] = [];
  private isProcessing = false;

  constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    workspaceFolder: vscode.Uri,
    config: ExtensionConfig
  ) {
    this.panel = panel;
    this.context = context;
    this.workspaceFolder = workspaceFolder;
    this.config = config;

    this.setupMessageListener();
    this.initializeContent();
  }

  private setupMessageListener(): void {
    this.panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      if (this.isProcessing) {
        await ErrorService.showError({
          message: 'Another operation is in progress. Please wait for it to complete.',
          severity: 'warning'
        });
        return;
      }

      try {
        switch (message.command) {
          case 'copyPrompt':
            await this.handleCopyPrompt(message.paths || [], message.llmQuery || '');
            break;
          case 'refresh':
            await this.handleRefresh();
            break;
          case 'countTokens':
            await this.handleCountTokens();
            break;
        }
      } catch (error) {
        const errorInfo = ErrorService.handleError(error, `Failed to handle command: ${message.command}`);
        await ErrorService.showError(errorInfo);
      }
    });
  }

  private async initializeContent(): Promise<void> {
    try {
      this.showProgress(0, 'Initializing...');
      await this.updateWebviewContent(false);
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to initialize webview content');
      await ErrorService.showError(errorInfo);
      this.showError(errorInfo.message);
    }
  }

  private async handleCopyPrompt(selectedPaths: string[], llmQuery: string): Promise<void> {
    this.isProcessing = true;
    
    try {
      // Validate inputs
      if (selectedPaths.length === 0) {
        throw new Error('No files selected. Please select at least one file.');
      }

      if (!llmQuery.trim()) {
        throw new Error('Query is required. Please enter your question or request.');
      }

      // Validate file paths
      for (const path of selectedPaths) {
        if (!FileService.validateFilePath(path)) {
          throw new Error(`Invalid file path: ${path}`);
        }
      }

      this.showProgress(10, 'Preparing selected files...');
      
      const selectedFiles = TreeUtils.getSelectedFiles(this.fileDetails, selectedPaths);
      if (selectedFiles.length === 0) {
        throw new Error('Selected files not found. Please refresh and try again.');
      }

      this.showProgress(50, 'Creating prompt content...');
      const promptText = FileService.createPromptContent(selectedFiles, llmQuery);
      
      this.showProgress(80, 'Validating prompt size...');
      const validation = TokenService.validatePromptSize(promptText, this.config.maxPromptTokens);
      
      if (!validation.isValid) {
        throw new Error(validation.error || 'Prompt validation failed');
      }

      this.showProgress(90, 'Copying to clipboard...');
      await vscode.env.clipboard.writeText(promptText);
      
      this.showProgress(100, 'Complete!');
      this.postMessage({ command: 'promptCopied' });
      
      await vscode.window.showInformationMessage(
        `Prompt copied successfully! (${validation.tokenCount} tokens)`
      );
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to copy prompt');
      await ErrorService.showError(errorInfo);
    } finally {
      this.isProcessing = false;
      this.hideProgress();
    }
  }

  private async handleRefresh(): Promise<void> {
    this.isProcessing = true;
    
    try {
      this.showProgress(0, 'Refreshing workspace...');
      await this.updateWebviewContent(false);
      
      await vscode.window.showInformationMessage('Workspace refreshed successfully!');
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to refresh workspace');
      await ErrorService.showError(errorInfo);
    } finally {
      this.isProcessing = false;
      this.hideProgress();
    }
  }

  private async handleCountTokens(): Promise<void> {
    this.isProcessing = true;
    
    try {
      this.showProgress(0, 'Counting tokens...');
      await this.updateWebviewContent(true);
      
      const totalFiles = this.fileDetails.length;
      const filesWithTokens = this.fileDetails.filter(f => f.tokens !== null).length;
      
      await vscode.window.showInformationMessage(
        `Token counting complete! Processed ${filesWithTokens}/${totalFiles} files.`
      );
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to count tokens');
      await ErrorService.showError(errorInfo);
    } finally {
      this.isProcessing = false;
      this.hideProgress();
    }
  }

  private async updateWebviewContent(computeTokens: boolean): Promise<void> {
    try {
      // Discover files with progress callback
      this.fileDetails = await FileService.discoverFiles(
        this.workspaceFolder,
        this.config,
        (current, total, currentFile) => {
          this.showProgress(
            Math.floor((current / total) * (computeTokens ? 50 : 100)),
            currentFile || `Processing ${current}/${total} files...`
          );
        }
      );

      // Count tokens if requested
      if (computeTokens) {
        this.fileDetails = await TokenService.countTokensForFiles(
          this.fileDetails,
          (current, total, currentFile) => {
            this.showProgress(
              50 + Math.floor((current / total) * 50),
              currentFile || `Counting tokens ${current}/${total}...`
            );
          }
        );
        
        // Save updated cache
        await TokenService.saveCache(this.context);
      }

      // Build and display tree
      this.showProgress(95, 'Building file tree...');
      const fileTree = TreeUtils.buildFileTree(this.fileDetails);
      const treeHtml = `<ul>${Object.keys(fileTree.children)
        .sort()
        .map(child => TreeUtils.treeToHtml(fileTree.children[child], ''))
        .join('')}</ul>`;
      
      this.showProgress(100, 'Complete');
      this.panel.webview.html = getWebviewContent(treeHtml, this.panel, this.context);
      
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to update webview content');
      this.showError(errorInfo.message);
      throw error;
    }
  }

  private showProgress(percentage: number, message: string): void {
    this.postMessage({
      command: 'updateProgress',
      percentage,
      message
    });
  }

  private hideProgress(): void {
    this.postMessage({ command: 'hideProgress' });
  }

  private showError(message: string): void {
    this.postMessage({
      command: 'showError',
      message
    });
  }

  private postMessage(message: any): void {
    this.panel.webview.postMessage(message);
  }

  public dispose(): void {
    this.panel.dispose();
  }

  public static async create(
    context: vscode.ExtensionContext,
    workspaceFolder: vscode.Uri,
    config: ExtensionConfig
  ): Promise<WebviewProvider> {
    const panel = vscode.window.createWebviewPanel(
      'c2pPanel',
      'C2P - Code to Prompt',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist')
        ]
      }
    );

    return new WebviewProvider(panel, context, workspaceFolder, config);
  }
}