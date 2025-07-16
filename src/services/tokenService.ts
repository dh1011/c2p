import { countTokens } from '@anthropic-ai/tokenizer';
import * as vscode from 'vscode';
import { TokenCache, ProgressCallback, FileDetail } from '../types';
import { ErrorService } from './errorService';

export class TokenService {
  private static cache: TokenCache = {};
  private static readonly CACHE_KEY = 'c2p.tokenCache';
  private static readonly MAX_CACHE_SIZE = 1000;
  private static readonly BATCH_SIZE = 10;

  public static async initialize(context: vscode.ExtensionContext): Promise<void> {
    try {
      const cachedData = context.globalState.get<TokenCache>(this.CACHE_KEY, {});
      this.cache = cachedData;
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to load token cache');
      console.warn('Token cache initialization failed:', errorInfo.message);
      this.cache = {};
    }
  }

  public static async saveCache(context: vscode.ExtensionContext): Promise<void> {
    try {
      await context.globalState.update(this.CACHE_KEY, this.cache);
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to save token cache');
      console.warn('Token cache save failed:', errorInfo.message);
    }
  }

  public static async countTokensForFiles(
    files: FileDetail[],
    progressCallback?: ProgressCallback
  ): Promise<FileDetail[]> {
    const results: FileDetail[] = [];
    let processed = 0;

    // Process files in batches to avoid blocking the UI
    for (let i = 0; i < files.length; i += this.BATCH_SIZE) {
      const batch = files.slice(i, i + this.BATCH_SIZE);
      
      try {
        const batchResults = await this.processBatch(batch, processed, files.length, progressCallback);
        results.push(...batchResults);
        processed += batch.length;

        // Allow other tasks to run
        await this.delay(1);
      } catch (error) {
        const errorInfo = ErrorService.handleError(error, `Failed to process batch ${i / this.BATCH_SIZE + 1}`);
        console.warn(errorInfo.message);
        
        // Add files with null tokens for failed batch
        batch.forEach(file => {
          results.push({ ...file, tokens: null });
        });
        processed += batch.length;
      }
    }

    return results;
  }

  public static countTokensSync(content: string): number {
    try {
      return countTokens(content);
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to count tokens');
      console.warn(errorInfo.message);
      return 0;
    }
  }

  public static getCachedTokens(filePath: string, lastModified: number): number | null {
    const cached = this.cache[filePath];
    if (!cached) {
      return null;
    }

    // Check if file has been modified since cache
    if (cached.lastModified !== lastModified) {
      delete this.cache[filePath];
      return null;
    }

    return cached.tokens;
  }

  public static setCachedTokens(filePath: string, tokens: number, lastModified: number): void {
    // Manage cache size
    if (Object.keys(this.cache).length >= this.MAX_CACHE_SIZE) {
      this.cleanupCache();
    }

    this.cache[filePath] = {
      tokens,
      lastModified,
      contentHash: this.simpleHash(filePath + lastModified)
    };
  }

  public static clearCache(): void {
    this.cache = {};
  }

  public static getCacheStats(): { size: number; maxSize: number } {
    return {
      size: Object.keys(this.cache).length,
      maxSize: this.MAX_CACHE_SIZE
    };
  }

  private static async processBatch(
    batch: FileDetail[],
    startIndex: number,
    total: number,
    progressCallback?: ProgressCallback
  ): Promise<FileDetail[]> {
    const results: FileDetail[] = [];

    for (const file of batch) {
      try {
        progressCallback?.(startIndex + results.length + 1, total, file.path);

        let tokens: number | null = null;
        
        if (file.lastModified) {
          tokens = this.getCachedTokens(file.path, file.lastModified);
        }

        if (tokens === null && file.content) {
          tokens = this.countTokensSync(file.content);
          
          if (file.lastModified && tokens !== null) {
            this.setCachedTokens(file.path, tokens, file.lastModified);
          }
        }

        results.push({ ...file, tokens });
      } catch (error) {
        const errorInfo = ErrorService.handleError(error, `Failed to process file: ${file.path}`);
        console.warn(errorInfo.message);
        results.push({ ...file, tokens: null });
      }
    }

    return results;
  }

  private static cleanupCache(): void {
    const entries = Object.entries(this.cache);
    
    // Sort by last modified (oldest first) and remove oldest 25%
    entries.sort((a, b) => a[1].lastModified - b[1].lastModified);
    const toRemove = Math.floor(entries.length * 0.25);
    
    for (let i = 0; i < toRemove; i++) {
      delete this.cache[entries[i][0]];
    }
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static validatePromptSize(content: string, maxTokens: number): { isValid: boolean; tokenCount: number; error?: string } {
    try {
      const tokenCount = this.countTokensSync(content);
      const isValid = tokenCount <= maxTokens;
      
      return {
        isValid,
        tokenCount,
        error: isValid ? undefined : `Prompt exceeds maximum token limit: ${tokenCount}/${maxTokens} tokens`
      };
    } catch (error) {
      const errorInfo = ErrorService.handleError(error, 'Failed to validate prompt size');
      return {
        isValid: false,
        tokenCount: 0,
        error: errorInfo.message
      };
    }
  }
}