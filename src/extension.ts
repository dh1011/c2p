import * as vscode from 'vscode';
import { ConfigService } from './services/configService';
import { TokenService } from './services/tokenService';
import { ErrorService } from './services/errorService';
import { WebviewProvider } from './webview/webviewProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Initialize services
    await TokenService.initialize(context);
    
    // Register the main command
    const c2pControlPanelCommand = vscode.commands.registerCommand('c2p.controlPanel', async () => {
      try {
        await handleControlPanelCommand(context);
      } catch (error) {
        const errorInfo = ErrorService.handleError(error, 'Failed to open control panel');
        await ErrorService.showError(errorInfo);
      }
    });

    context.subscriptions.push(c2pControlPanelCommand);

    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(word-wrap) C2P';
    statusBarItem.tooltip = 'Click to display the C2P control panel';
    statusBarItem.command = 'c2p.controlPanel';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Listen for configuration changes
    const configListener = ConfigService.onConfigurationChanged(() => {
      // Token cache might be affected by configuration changes
      TokenService.clearCache();
    });
    context.subscriptions.push(configListener);

    // Save token cache on extension deactivation
    context.subscriptions.push({
      dispose: async () => {
        await TokenService.saveCache(context);
      }
    });

  } catch (error) {
    const errorInfo = ErrorService.handleError(error, 'Failed to activate C2P extension');
    await ErrorService.showError(errorInfo);
  }
}

async function handleControlPanelCommand(context: vscode.ExtensionContext): Promise<void> {
  // Check if workspace is open
  if (!vscode.workspace.workspaceFolders) {
    await vscode.window.showWarningMessage('No workspace is open. Please open a folder or workspace to use C2P.');
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders[0];
  const config = ConfigService.getConfig();

  // Create and show the webview panel
  const webviewProvider = await WebviewProvider.create(context, workspaceFolder.uri, config);
  
  // Handle panel disposal
  webviewProvider.panel.onDidDispose(() => {
    webviewProvider.dispose();
  });
}

export function deactivate() {}
