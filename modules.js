// other Module yes
export function observeElement(selector, onFound, options = {}) {
    const { onRemove } = options;
    
    const observeDOM = () => {
        const element = document.querySelector(selector);
        if (element && !element.dataset.observed) {
            element.dataset.observed = 'true';
            onFound?.(element);
            
            if (onRemove) {
                const observer = new MutationObserver(() => {
                    if (!document.querySelector(selector)) {
                        onRemove?.();
                        observer.disconnect();
                    }
                });
                observer.observe(element.parentNode || document.body, {
                    childList: true,
                    subtree: true
                });
            }
        }
    };
    
    observeDOM();
    
    const observer = new MutationObserver(observeDOM);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// nice Module
export async function callRobloxApiJson({ subdomain = 'apis', endpoint }) {
    try {
        const url = new URL(endpoint, `https://${subdomain}.roblox.com`);
        const response = await fetch(url.toString(), {
            method: 'GET',
            credentials: 'include',
        });
        
        if (response.status === 429) {
            const error = new Error('Rate limited');
            error.status = 429;
            throw error;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        if (error.status) throw error;
        throw new Error(error.message);
    }
}

// UI Components Module
export function createButton(text, variant = 'primary', options = {}) {
    const button = document.createElement('button');
    button.textContent = text;
    button.id = options.id || '';
    
    // Apply variant styles
    button.style.padding = '8px 16px';
    button.style.borderRadius = '4px';
    button.style.border = 'none';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';
    button.style.fontWeight = '600';
    button.style.transition = 'all 0.2s ease';
    
    if (variant === 'primary') {
        button.style.background = '#00b06f';
        button.style.color = 'white';
        button.onmouseover = () => button.style.background = '#009d62';
        button.onmouseout = () => button.style.background = '#00b06f';
    } else if (variant === 'secondary') {
        button.style.background = '#393b3d';
        button.style.color = 'white';
        button.style.border = '1px solid #4a4d50';
        button.onmouseover = () => button.style.background = '#4a4d50';
        button.onmouseout = () => button.style.background = '#393b3d';
    }
    
    if (options.onClick) {
        button.addEventListener('click', options.onClick);
    }
    
    return button;
}

export function createOverlay({ title, bodyContent, actions = [], showLogo, onClose }) {
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.className = 'salestrack-global-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0, 0, 0, 0.6)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '100000';
    
    // Create modal dialog
    const modal = document.createElement('div');
    modal.style.background = '#1a1d1f';
    modal.style.borderRadius = '8px';
    modal.style.color = 'white';
    modal.style.maxWidth = '600px';
    modal.style.width = '90%';
    modal.style.maxHeight = '80vh';
    modal.style.overflow = 'auto';
    modal.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.8)';
    modal.style.border = '1px solid #393b3d';
    
    // Header
    const header = document.createElement('div');
    header.style.padding = '20px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderBottom = '1px solid #393b3d';
    
    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    titleEl.style.margin = '0';
    titleEl.style.fontSize = '18px';
    titleEl.style.fontWeight = 'bold';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#aaa';
    closeBtn.style.fontSize = '28px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0';
    closeBtn.style.width = '30px';
    closeBtn.style.height = '30px';
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.onclick = () => closeOverlay();
    
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    
    // Body
    const body = document.createElement('div');
    body.style.padding = '20px';
    if (typeof bodyContent === 'string') {
        body.innerHTML = bodyContent;
    } else {
        body.appendChild(bodyContent);
    }
    
    // Footer with actions
    let footer;
    if (actions.length > 0) {
        footer = document.createElement('div');
        footer.style.padding = '20px';
        footer.style.borderTop = '1px solid #393b3d';
        footer.style.display = 'flex';
        footer.style.gap = '10px';
        footer.style.justifyContent = 'flex-end';
        
        actions.forEach(action => {
            footer.appendChild(action);
        });
    }
    
    modal.appendChild(header);
    modal.appendChild(body);
    if (footer) modal.appendChild(footer);
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Close on background click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeOverlay();
    });
    
    const closeOverlay = () => {
        overlay.remove();
        onClose?.();
    };
    
    return {
        close: closeOverlay,
        element: overlay
    };
}
