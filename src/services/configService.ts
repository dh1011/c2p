import * as vscode from 'vscode';
import { ExtensionConfig } from '../types';

export class ConfigService {
  private static readonly CONFIG_SECTION = 'c2p';

  public static getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    
    return {
      maxFiles: config.get<number>('maxFiles', 100),
      maxPromptTokens: config.get<number>('maxPromptTokens', 32000),
      useGitignore: config.get<boolean>('useGitignore', true),
      excludedFolders: config.get<string[]>('excludedFolders', [
        'node_modules',
        'venv',
        '__pycache__',
        '.git',
        'dist',
        'build',
        '.*'
      ]),
      excludedFiles: config.get<string[]>('excludedFiles', [
        '**/.*',
        '**/LICENSE*',
        '**/LICENCE*',
        '**/CODE_OF_CONDUCT*',
        '**/CONTRIBUTING*',
        '**/CHANGELOG*',
        '**/SECURITY*',
        '**/AUTHORS*',
        '**/CONTRIBUTORS*',
        '**/ACKNOWLEDGMENTS*',
        '**/package-lock.json',
        '**/yarn.lock',
        '**/pnpm-lock.yaml',
        '**/composer.lock',
        '**/Gemfile.lock',
        '**/poetry.lock',
        '**/requirements.txt',
        '**/Pipfile.lock',
        '**/cargo.lock',
        '**/.editorconfig',
        '**/.prettierrc*',
        '**/.eslintrc*',
        '**/.stylelintrc*',
        '**/browserslist',
        '**/Dockerfile',
        '**/docker-compose*.yml',
        '**/Makefile',
        '**/README*',
        '**/.dockerignore',
        '**/.env.example',
        '**/.nvmrc',
        '**/.python-version',
        '**/.ruby-version',
        '**/.tool-versions',
        '**/CODEOWNERS',
        '**/robots.txt',
        '**/sitemap.xml',
        '**/manifest.json',
        '**/browserconfig.xml'
      ])
    };
  }

  public static async updateConfig(key: keyof ExtensionConfig, value: any): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }

  public static onConfigurationChanged(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(this.CONFIG_SECTION)) {
        callback();
      }
    });
  }
}