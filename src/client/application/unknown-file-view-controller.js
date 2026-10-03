import { resolveApiUrl } from '../domain/runtime-paths.js';

export class UnknownFileViewController {
  constructor() {
    this.renderToken = 0;
  }

  async render({ filePath, renderHost }) {
    this.cancel();
    const token = this.renderToken;

    const container = document.createElement('div');
    container.className = 'unknown-file-view';
    container.setAttribute('role', 'document');
    container.setAttribute('aria-label', `${filePath} file preview not available`);

    const fileName = String(filePath).split('/').pop() || filePath;
    const extension = fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : '';

    container.innerHTML = `
      <div class="unknown-file-content">
        <div class="unknown-file-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <h2 class="unknown-file-name">${escapeHtml(fileName)}</h2>
        ${extension ? `<p class="unknown-file-type">${escapeHtml(extension)} file</p>` : ''}
        <p class="unknown-file-message">Preview not available</p>
        <a
          href="${resolveApiUrl(`/download/file?path=${encodeURIComponent(filePath)}`)}"
          download="${escapeHtml(fileName)}"
          class="unknown-file-download-button"
        >
          Download file
        </a>
      </div>
    `;

    if (token !== this.renderToken) return;
    renderHost.replaceChildren(container);
  }

  cancel() {
    this.renderToken += 1;
  }

  destroy() {
    this.cancel();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
