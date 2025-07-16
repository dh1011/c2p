import * as vscode from 'vscode';
import { ErrorInfo } from '../types';

export class ErrorService {
  private static readonly LOG_PREFIX = '[C2P]';

  public static handleError(error: unknown, context?: string): ErrorInfo {
    const errorInfo = this.parseError(error, context);
    this.logError(errorInfo, error);
    return errorInfo;
  }

  public static async showError(errorInfo: ErrorInfo): Promise<void> {
    const message = errorInfo.action 
      ? `${errorInfo.message}\n\n${errorInfo.action}`
      : errorInfo.message;

    switch (errorInfo.severity) {
      case 'error':
        await vscode.window.showErrorMessage(message);
        break;
      case 'warning':
        await vscode.window.showWarningMessage(message);
        break;
      case 'info':
        await vscode.window.showInformationMessage(message);
        break;
    }
  }

  public static async showErrorWithAction(
    errorInfo: ErrorInfo, 
    actionLabel: string, 
    action: () => void
  ): Promise<void> {
    const selection = await vscode.window.showErrorMessage(
      errorInfo.message,
      actionLabel
    );
    
    if (selection === actionLabel) {
      action();
    }
  }

  private static parseError(error: unknown, context?: string): ErrorInfo {
    let message = 'An unexpected error occurred';
    let code: string | undefined;
    let severity: 'error' | 'warning' | 'info' = 'error';
    let action: string | undefined;

    if (error instanceof Error) {
      message = error.message;
      
      // Parse specific VS Code errors
      if (error.message.includes('ENOENT')) {
        message = 'File or directory not found';
        action = 'Please check if the file exists and try again.';
        code = 'FILE_NOT_FOUND';
      } else if (error.message.includes('EACCES')) {
        message = 'Permission denied';
        action = 'Please check file permissions and try again.';
        code = 'PERMISSION_DENIED';
      } else if (error.message.includes('EMFILE') || error.message.includes('ENFILE')) {
        message = 'Too many files open';
        action = 'Please close some files and try again.';
        code = 'TOO_MANY_FILES';
      } else if (error.message.includes('ENOTDIR')) {
        message = 'Invalid directory path';
        action = 'Please check the directory path and try again.';
        code = 'INVALID_DIRECTORY';
      } else if (error.message.includes('Maximum call stack')) {
        message = 'Directory structure too deep';
        action = 'Please exclude deeply nested directories and try again.';
        code = 'STACK_OVERFLOW';
      }
    } else if (typeof error === 'string') {
      message = error;
    }

    if (context) {
      message = `${context}: ${message}`;
    }

    return { message, code, severity, action };
  }

  private static logError(errorInfo: ErrorInfo, originalError: unknown): void {
    const logMessage = `${this.LOG_PREFIX} ${errorInfo.severity.toUpperCase()}: ${errorInfo.message}`;
    
    if (errorInfo.code) {
      console.log(`${logMessage} (Code: ${errorInfo.code})`);
    } else {
      console.log(logMessage);
    }

    if (originalError instanceof Error && originalError.stack) {
      console.log(`${this.LOG_PREFIX} Stack trace:`, originalError.stack);
    }
  }

  public static createProgressError(current: number, total: number, failedFile?: string): ErrorInfo {
    const message = failedFile 
      ? `Failed to process file: ${failedFile} (${current}/${total})`
      : `Failed to process files (${current}/${total})`;
    
    return {
      message,
      severity: 'warning',
      code: 'PROGRESS_ERROR',
      action: 'Some files may be skipped. Check the console for details.'
    };
  }

  public static createValidationError(field: string, value: any, expected: string): ErrorInfo {
    return {
      message: `Invalid ${field}: ${value}. Expected ${expected}.`,
      severity: 'error',
      code: 'VALIDATION_ERROR',
      action: `Please provide a valid ${expected} for ${field}.`
    };
  }
}