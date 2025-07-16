import { FileDetail, TreeNode } from '../types';

export class TreeUtils {
  public static buildFileTree(details: FileDetail[]): TreeNode {
    const root: TreeNode = { name: '', isFile: false, children: {} };
    
    details.forEach(detail => {
      const parts = detail.path.split(/[\/\\]/);
      let current = root;
      
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // This is a file
          current.children[part] = {
            name: part,
            isFile: true,
            tokens: detail.tokens,
            content: detail.content,
            children: {}
          };
        } else {
          // This is a directory
          if (!current.children[part]) {
            current.children[part] = { 
              name: part, 
              isFile: false, 
              children: {} 
            };
          }
          current = current.children[part];
        }
      });
    });
    
    return root;
  }

  public static treeToHtml(node: TreeNode, parentPath: string = ''): string {
    const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    
    if (node.isFile) {
      const tokenDisplay = (node.tokens !== null && node.tokens !== undefined) ? node.tokens.toString() : '-';
      return `<li>
        <vscode-checkbox class="node-checkbox" data-path="${this.escapeHtml(currentPath)}" data-tokens="${tokenDisplay}" checked>
          ${this.escapeHtml(node.name)} <vscode-badge>${tokenDisplay}</vscode-badge>
        </vscode-checkbox>
      </li>`;
    } else {
      const keys = Object.keys(node.children).sort();
      const childrenHtml = keys.map(key => 
        this.treeToHtml(node.children[key], currentPath)
      ).join('');
      
      return `<li>
        <vscode-checkbox class="node-checkbox" data-path="${this.escapeHtml(currentPath)}" checked>
          <strong>${this.escapeHtml(node.name)}</strong>
        </vscode-checkbox>
        ${childrenHtml ? `<ul>${childrenHtml}</ul>` : ''}
      </li>`;
    }
  }

  public static treeToText(node: TreeNode, currentPath: string = ''): string[] {
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
        lines = lines.concat(this.treeToText(child, newPath));
      }
    }
    
    return lines;
  }

  public static getSelectedFiles(fileDetails: FileDetail[], selectedPaths: string[]): FileDetail[] {
    const selectedSet = new Set(selectedPaths);
    return fileDetails.filter(file => selectedSet.has(file.path));
  }

  public static calculateTotalTokens(fileDetails: FileDetail[], selectedPaths: string[]): number {
    const selectedFiles = this.getSelectedFiles(fileDetails, selectedPaths);
    return selectedFiles.reduce((total, file) => {
      return total + (file.tokens || 0);
    }, 0);
  }

  private static escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (match) => {
      switch (match) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#039;';
        default: return match;
      }
    });
  }
}