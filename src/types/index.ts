export interface FileDetail {
  path: string;
  tokens: number | null;
  content: string;
  lastModified?: number;
}

export interface TreeNode {
  name: string;
  isFile: boolean;
  tokens?: number | null;
  content?: string;
  children: { [key: string]: TreeNode };
}

export interface ExtensionConfig {
  maxFiles: number;
  maxPromptTokens: number;
  useGitignore: boolean;
  excludedFolders: string[];
  excludedFiles: string[];
}

export interface WebviewMessage {
  command: 'copyPrompt' | 'refresh' | 'countTokens';
  paths?: string[];
  llmQuery?: string;
}

export interface TokenCache {
  [filePath: string]: {
    tokens: number;
    lastModified: number;
    contentHash?: string;
  };
}

export interface ProgressCallback {
  (current: number, total: number, currentFile?: string): void;
}

export interface ErrorInfo {
  message: string;
  code?: string;
  severity: 'error' | 'warning' | 'info';
  action?: string;
}