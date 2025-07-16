import * as vscode from 'vscode';
import { FileDetail, ExtensionConfig, ProgressCallback } from '../types';
import { ErrorService } from './errorService';

export class FileService {
  private static readonly NON_TEXTUAL_PATTERNS = [
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

  public static async discoverFiles(
    workspaceFolder: vscode.Uri,
    config: ExtensionConfig,
    progressCallback?: ProgressCallback
  ): Promise<FileDetail[]> {
    try {
      progressCallback?.(0, 100, 'Building ignore patterns...');
      const ignorePattern = await this.buildIgnorePattern(workspaceFolder, config);
      
      progressCallback?.(20, 100, 'Discovering files...');
      const files = await this.findFiles(ignorePattern, config.maxFiles);
      
      if (files.length === 0) {
        throw new Error('No files found matching the criteria');
      }

      progressCallback?.(40, 100, 'Reading file contents...');
      const fileDetails = await this.readFileContents(files, workspaceFolder, progressCallback);
      
      progressCallback?.(100, 100, 'Complete');
      return fileDetails;
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to discover files');
      throw new Error(errorInfo.message);
    }
  }

  public static async readSingleFile(filePath: vscode.Uri): Promise<{ content: string; lastModified: number } | null> {
    try {
      const [contentBuffer, stats] = await Promise.all([
        vscode.workspace.fs.readFile(filePath),
        vscode.workspace.fs.stat(filePath)
      ]);
      
      const content = new TextDecoder('utf-8').decode(contentBuffer);
      return {
        content,
        lastModified: stats.mtime
      };
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, `Failed to read file: ${filePath.fsPath}`);
      console.warn(errorInfo.message);
      return null;
    }
  }

  public static validateFilePath(filePath: string): boolean {
    try {
      // Basic validation to prevent path traversal
      const normalized = vscode.Uri.file(filePath).fsPath;
      return !normalized.includes('..') && !normalized.startsWith('/') && !normalized.includes('\0');
    } catch {
      return false;
    }
  }

  public static isTextFile(fileName: string): boolean {
    const extension = fileName.toLowerCase().split('.').pop();
          if (!extension) {
        return true; // Assume files without extension are text
      }
    
    const binaryExtensions = new Set([
      'jpg', 'jpeg', 'png', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff',
      'mp4', 'webm', 'avi', 'mov', 'wmv', 'flv', 'mkv',
      'mp3', 'wav', 'ogg', 'm4a', 'aac',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
      'exe', 'dll', 'so', 'dylib', 'class', 'pyc',
      'bin', 'dat', 'db', 'sqlite', 'sqlite3',
      'psd', 'ai', 'sketch', 'fig',
      'ttf', 'otf', 'woff', 'woff2', 'eot'
    ]);
    
    return !binaryExtensions.has(extension);
  }

  private static async buildIgnorePattern(
    workspaceFolder: vscode.Uri,
    config: ExtensionConfig
  ): Promise<string> {
    const folderPatterns = config.excludedFolders.map(folder => `**/${folder}/**`);
    const filePatterns = [...this.NON_TEXTUAL_PATTERNS, ...config.excludedFiles];

    if (config.useGitignore) {
      try {
        const gitignorePatterns = await this.parseGitignore(workspaceFolder);
        folderPatterns.push(...gitignorePatterns.folders);
        filePatterns.push(...gitignorePatterns.files);
      } catch (error) {
        // Gitignore parsing failed, but continue with defaults
        const errorInfo = ErrorService.handleError(error, 'Failed to parse .gitignore');
        console.warn(errorInfo.message);
      }
    }

    // Always ignore the .gitignore file itself
    filePatterns.push('.gitignore');

    const combinedPatterns = [...folderPatterns, ...filePatterns];
    return combinedPatterns.length > 0 ? `{${combinedPatterns.join(',')}}` : '';
  }

  private static async parseGitignore(
    workspaceFolder: vscode.Uri
  ): Promise<{ folders: string[]; files: string[] }> {
    const folderPatterns: string[] = [];
    const filePatterns: string[] = [];

    try {
      const gitignoreUri = vscode.Uri.joinPath(workspaceFolder, '.gitignore');
      const gitignoreBuffer = await vscode.workspace.fs.readFile(gitignoreUri);
      const gitignoreContent = new TextDecoder('utf-8').decode(gitignoreBuffer);
      
      const lines = gitignoreContent.split(/\r?\n/);
      
      for (let line of lines) {
        line = line.trim();
        
        // Skip empty lines and comments
        if (!line || line.startsWith('#') || line.startsWith('!')) {
          continue;
        }
        
        if (line.endsWith('/')) {
          // Directory pattern
          let folder = line.slice(0, -1);
          if (folder.startsWith('/')) {
            folder = folder.slice(1);
          }
          folderPatterns.push(`**/${folder}/**`);
        } else {
          // File pattern
          let pattern = line.startsWith('/') ? line.slice(1) : line;
          filePatterns.push(pattern);
        }
      }
    } catch (error) {
      // .gitignore not found or unreadable - this is not necessarily an error
      if (!(error instanceof vscode.FileSystemError) || error.code !== 'FileNotFound') {
        throw error;
      }
    }

    return { folders: folderPatterns, files: filePatterns };
  }

  private static async findFiles(ignorePattern: string, maxFiles: number): Promise<vscode.Uri[]> {
    const files = await vscode.workspace.findFiles('**/*', ignorePattern);
    
    if (files.length > maxFiles) {
      throw new Error(
        `Too many files in the workspace. Maximum allowed is ${maxFiles}, but found ${files.length}.`
      );
    }

    return files;
  }

  private static async readFileContents(
    files: vscode.Uri[],
    workspaceFolder: vscode.Uri,
    progressCallback?: ProgressCallback
  ): Promise<FileDetail[]> {
    const fileDetails: FileDetail[] = [];
    const decoder = new TextDecoder('utf-8');
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = vscode.workspace.asRelativePath(file);
      
      try {
        progressCallback?.(40 + Math.floor((i / files.length) * 60), 100, relativePath);
        
        const [contentBuffer, stats] = await Promise.all([
          vscode.workspace.fs.readFile(file),
          vscode.workspace.fs.stat(file)
        ]);
        
        const content = decoder.decode(contentBuffer);
        
        // Validate file content size (prevent memory issues)
        if (content.length > 1024 * 1024) { // 1MB limit
          console.warn(`File ${relativePath} is too large (${content.length} bytes), skipping`);
          continue;
        }
        
        fileDetails.push({
          path: relativePath,
          tokens: null,
          content,
          lastModified: stats.mtime
        });
      } catch (error) {
        const errorInfo = ErrorService.handleError(error, `Failed to read file: ${relativePath}`);
        console.warn(errorInfo.message);
        
        // Add file with empty content to maintain structure
        fileDetails.push({
          path: relativePath,
          tokens: null,
          content: '',
          lastModified: 0
        });
      }
    }

    return fileDetails;
  }

  public static createPromptContent(selectedFiles: FileDetail[], query: string): string {
    let promptText = "I am providing you with the codebase for the project. The codebase is organized such that each file is preceded by a header indicating its path (e.g., \"FILE: /src/module/file.py\") followed by its contents.\n\n";
    
    for (const file of selectedFiles) {
      if (file.content) {
        promptText += `FILE: /${file.path}\n${file.content}\n\n`;
      }
    }
    
    if (query.trim()) {
      promptText += query;
    }
    
    return promptText;
  }
}