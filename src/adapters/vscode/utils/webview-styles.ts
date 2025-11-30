import * as vscode from 'vscode';

/**
 * Base webview styles shared across all panels
 * Includes VS Code theme-aware colors and common UI components
 */
export function getBaseStyles(): string {
  return `
    :root {
      --container-padding: 20px;
      --input-padding: 8px 12px;
      --border-radius: 4px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      padding: var(--container-padding);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      line-height: 1.5;
    }

    h1, h2, h3 {
      color: var(--vscode-foreground);
      margin-top: 0;
    }

    h1 { font-size: 1.5em; margin-bottom: 1em; }
    h2 { font-size: 1.25em; margin-bottom: 0.75em; }
    h3 { font-size: 1.1em; margin-bottom: 0.5em; }

    /* Form Elements */
    input, select, textarea {
      width: 100%;
      padding: var(--input-padding);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      border-radius: var(--border-radius);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: inherit;
      font-size: inherit;
    }

    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    label {
      display: block;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
      font-weight: 500;
    }

    /* Buttons */
    button {
      padding: 8px 16px;
      border: none;
      border-radius: var(--border-radius);
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      transition: background-color 0.2s, opacity 0.2s;
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover:not(:disabled) {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-danger {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      color: var(--vscode-foreground);
    }

    .btn-danger:hover:not(:disabled) {
      opacity: 0.9;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }

    th, td {
      padding: 8px 12px;
      text-align: left;
      border: 1px solid var(--vscode-panel-border);
    }

    th {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      font-weight: 600;
    }

    tr:hover {
      background-color: var(--vscode-list-hoverBackground);
    }

    /* Messages */
    .error {
      color: var(--vscode-inputValidation-errorForeground, #f48771);
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      padding: 10px;
      border-radius: var(--border-radius);
      margin: 10px 0;
    }

    .success {
      color: var(--vscode-testing-iconPassed, #89d185);
      background-color: rgba(137, 209, 133, 0.1);
      padding: 10px;
      border-radius: var(--border-radius);
      margin: 10px 0;
    }

    .warning {
      color: var(--vscode-editorWarning-foreground, #cca700);
      background-color: rgba(204, 167, 0, 0.1);
      padding: 10px;
      border-radius: var(--border-radius);
      margin: 10px 0;
    }

    .info {
      color: var(--vscode-editorInfo-foreground, #75beff);
      background-color: rgba(117, 190, 255, 0.1);
      padding: 10px;
      border-radius: var(--border-radius);
      margin: 10px 0;
    }

    /* Loading Spinner */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Form Groups */
    .form-group {
      margin-bottom: 16px;
    }

    .form-row {
      display: flex;
      gap: 16px;
    }

    .form-row > * {
      flex: 1;
    }

    /* Toolbar */
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 16px;
      padding: 8px 0;
    }

    .toolbar-spacer {
      flex: 1;
    }

    /* Card */
    .card {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: var(--border-radius);
      padding: 16px;
      margin-bottom: 16px;
    }

    /* Code Block */
    .code-block {
      font-family: var(--vscode-editor-font-family);
      background-color: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: var(--border-radius);
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Pagination */
    .pagination {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
    }

    .pagination button {
      padding: 4px 12px;
    }

    .pagination-info {
      color: var(--vscode-descriptionForeground);
    }
  `;
}

/**
 * Generate Content Security Policy for webviews
 */
export function getContentSecurityPolicy(webview: vscode.Webview, nonce: string): string {
  return `
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} data:;
  `;
}

/**
 * Generate base HTML template for webviews
 */
export function getBaseHtmlTemplate(options: {
  webview: vscode.Webview;
  nonce: string;
  title: string;
  styles?: string;
  body: string;
  scripts?: string;
}): string {
  const { webview, nonce, title, styles = '', body, scripts = '' } = options;
  const csp = getContentSecurityPolicy(webview, nonce);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>${title}</title>
  <style>
    ${getBaseStyles()}
    ${styles}
  </style>
</head>
<body>
  ${body}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    ${scripts}
  </script>
</body>
</html>`;
}
