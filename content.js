// Content script that runs on Google Slides pages
console.log('AI Slides Assistant loaded');

let sidePanel = null;
let apiKey = null;

// Load API key from storage
chrome.storage.sync.get(['apiKey'], (result) => {
    apiKey = result.apiKey;
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openPanel') {
        openSidePanel();
        sendResponse({ success: true });
    } else if (request.action === 'updateApiKey') {
        apiKey = request.apiKey;
        sendResponse({ success: true });
    }
    return true;
});

function openSidePanel() {
    if (sidePanel) {
        sidePanel.remove();
    }
    
    // Create side panel
    sidePanel = document.createElement('div');
    sidePanel.id = 'ai-slides-panel';
    sidePanel.innerHTML = `
        <div class="panel-header">
            <h2>🤖 AI Slides Assistant</h2>
            <button id="closePanel" class="close-btn">✕</button>
        </div>
        
        <div class="panel-content">
            <div class="section">
                <h3>📝 Assignment Content</h3>
                <textarea id="assignmentContent" placeholder="Paste your assignment answers, research notes, or content here...

Example:
Q1: Market Analysis
A: The market shows 15% growth...

Q2: Key Challenges
A: Legacy systems, customer satisfaction..."></textarea>
            </div>
            
            <div class="section">
                <h3>⚙️ Options</h3>
                <label>
                    <input type="checkbox" id="autoFormat" checked>
                    Auto-format content
                </label>
                <label>
                    <input type="checkbox" id="preserveStyle" checked>
                    Preserve template styling
                </label>
                <label>
                    <input type="checkbox" id="smartMapping" checked>
                    Smart content mapping
                </label>
            </div>
            
            <div class="button-group">
                <button id="analyzeBtn" class="btn btn-primary">🔍 Analyze Template</button>
                <button id="generateBtn" class="btn btn-success" disabled>🚀 Generate Slides</button>
            </div>
            
            <div id="panelStatus" class="status"></div>
            
            <div id="preview" class="preview-section" style="display: none;">
                <h3>📊 Preview</h3>
                <div id="previewContent"></div>
            </div>
        </div>
    `;
    
    document.body.appendChild(sidePanel);
    
    // Add event listeners
    document.getElementById('closePanel').addEventListener('click', () => {
        sidePanel.remove();
    });
    
    document.getElementById('analyzeBtn').addEventListener('click', analyzeTemplate);
    document.getElementById('generateBtn').addEventListener('click', generateSlides);
}

async function analyzeTemplate() {
    const statusEl = document.getElementById('panelStatus');
    statusEl.className = 'status info';
    statusEl.textContent = 'Analyzing template...';
    statusEl.style.display = 'block';
    
    try {
        // Get presentation ID from URL
        const presentationId = extractPresentationId();
        if (!presentationId) {
            throw new Error('Could not detect presentation ID');
        }
        
        // Get template structure using Google Slides API
        const templateData = await fetchPresentationData(presentationId);
        
        // Store template data
        window.templateData = templateData;
        
        // Show preview
        displayTemplateStructure(templateData);
        
        document.getElementById('generateBtn').disabled = false;
        statusEl.className = 'status success';
        statusEl.textContent = `✓ Template analyzed: ${templateData.slides.length} slides found`;
        
    } catch (error) {
        console.error(error);
        statusEl.className = 'status error';
        statusEl.textContent = 'Error: ' + error.message;
    }
}

async function generateSlides() {
    const content = document.getElementById('assignmentContent').value;
    if (!content.trim()) {
        alert('Please enter your assignment content');
        return;
    }
    
    if (!apiKey) {
        alert('Please set your API key in the extension popup');
        return;
    }
    
    const statusEl = document.getElementById('panelStatus');
    statusEl.className = 'status info';
    statusEl.textContent = 'Generating slides with AI...';
    
    try {
        // Get options
        const options = {
            autoFormat: document.getElementById('autoFormat').checked,
            preserveStyle: document.getElementById('preserveStyle').checked,
            smartMapping: document.getElementById('smartMapping').checked
        };
        
        // Use AI to analyze content and map to template
        const slideUpdates = await analyzeContentWithAI(content, window.templateData, options);
        
        // Preview updates
        displayPreview(slideUpdates);
        
        statusEl.textContent = 'Applying to slides...';
        
        // Apply updates to actual Google Slides
        await applyUpdatesToSlides(slideUpdates);
        
        statusEl.className = 'status success';
        statusEl.textContent = '✓ Slides generated successfully! Refresh the page to see changes.';
        
    } catch (error) {
        console.error(error);
        statusEl.className = 'status error';
        statusEl.textContent = 'Error: ' + error.message;
    }
}

function extractPresentationId() {
    const match = window.location.href.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

async function fetchPresentationData(presentationId) {
    // This uses the Google Slides API via the page's existing auth
    // We'll inject a script to use the page's gapi client
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.textContent = `
            (async function() {
                try {
                    const response = await gapi.client.slides.presentations.get({
                        presentationId: '${presentationId}'
                    });
                    window.postMessage({
                        type: 'PRESENTATION_DATA',
                        data: response.result
                    }, '*');
                } catch (error) {
                    window.postMessage({
                        type: 'PRESENTATION_ERROR',
                        error: error.message
                    }, '*');
                }
            })();
        `;
        
        window.addEventListener('message', function handler(event) {
            if (event.source !== window) return;
            
            if (event.data.type === 'PRESENTATION_DATA') {
                window.removeEventListener('message', handler);
                document.head.removeChild(script);
                resolve(event.data.data);
            } else if (event.data.type === 'PRESENTATION_ERROR') {
                window.removeEventListener('message', handler);
                document.head.removeChild(script);
                reject(new Error(event.data.error));
            }
        });
        
        document.head.appendChild(script);
    });
}

async function analyzeContentWithAI(content, templateData, options) {
    const templateStructure = templateData.slides.map((slide, idx) => {
        let textContent = '';
        const textElements = [];
        
        if (slide.pageElements) {
            slide.pageElements.forEach(element => {
                if (element.shape && element.shape.text) {
                    const text = element.shape.text.textElements
                        .map(te => te.textRun ? te.textRun.content : '')
                        .join('');
                    textContent += text;
                    textElements.push({
                        objectId: element.objectId,
                        currentText: text
                    });
                }
            });
        }
        
        return {
            slideNumber: idx + 1,
            currentContent: textContent,
            textElements: textElements
        };
    });
    
    const prompt = `You are a consulting deliverable expert. Analyze assignment content and map it to a Google Slides template.

TEMPLATE STRUCTURE:
${JSON.stringify(templateStructure, null, 2)}

ASSIGNMENT CONTENT:
${content}

OPTIONS:
- Auto-format: ${options.autoFormat}
- Preserve style: ${options.preserveStyle}
- Smart mapping: ${options.smartMapping}

Create professional slide content that fits the template. Return ONLY valid JSON:

{
  "slides": [
    {
      "slideNumber": 1,
      "updates": [
        {
          "objectId": "element_id",
          "text": "Professional formatted content"
        }
      ]
    }
  ]
}

Guidelines:
- Extract key insights from assignment answers
- Use professional consulting language
- Create clear bullet points
- Map content intelligently to template sections
- Maintain consistency in tone`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: 'You are a professional consultant. Return ONLY valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.5,
            max_tokens: 3000
        })
    });
    
    const data = await response.json();
    const content_text = data.choices[0].message.content;
    const jsonMatch = content_text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
    }
    
    return JSON.parse(jsonMatch[0]);
}

async function applyUpdatesToSlides(slideUpdates) {
    const presentationId = extractPresentationId();
    
    // Build batch update requests
    const requests = [];
    
    slideUpdates.slides.forEach(slide => {
        slide.updates.forEach(update => {
            // Delete existing text
            requests.push({
                deleteText: {
                    objectId: update.objectId,
                    textRange: { type: 'ALL' }
                }
            });
            
            // Insert new text
            requests.push({
                insertText: {
                    objectId: update.objectId,
                    text: update.text,
                    insertionIndex: 0
                }
            });
        });
    });
    
    // Execute via injected script
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.textContent = `
            (async function() {
                try {
                    const response = await gapi.client.slides.presentations.batchUpdate({
                        presentationId: '${presentationId}',
                        requests: ${JSON.stringify(requests)}
                    });
                    window.postMessage({ type: 'UPDATE_SUCCESS' }, '*');
                } catch (error) {
                    window.postMessage({ 
                        type: 'UPDATE_ERROR', 
                        error: error.message 
                    }, '*');
                }
            })();
        `;
        
        window.addEventListener('message', function handler(event) {
            if (event.source !== window) return;
            
            if (event.data.type === 'UPDATE_SUCCESS') {
                window.removeEventListener('message', handler);
                document.head.removeChild(script);
                resolve();
            } else if (event.data.type === 'UPDATE_ERROR') {
                window.removeEventListener('message', handler);
                document.head.removeChild(script);
                reject(new Error(event.data.error));
            }
        });
        
        document.head.appendChild(script);
    });
}

function displayTemplateStructure(templateData) {
    const preview = document.getElementById('preview');
    const content = document.getElementById('previewContent');
    
    content.innerHTML = '';
    
    templateData.slides.forEach((slide, idx) => {
        const slideDiv = document.createElement('div');
        slideDiv.className = 'preview-slide';
        
        let text = `Slide ${idx + 1}:\n`;
        if (slide.pageElements) {
            slide.pageElements.forEach(element => {
                if (element.shape && element.shape.text) {
                    const elementText = element.shape.text.textElements
                        .map(te => te.textRun ? te.textRun.content : '')
                        .join('');
                    text += elementText;
                }
            });
        }
        
        slideDiv.textContent = text || `[Empty slide ${idx + 1}]`;
        content.appendChild(slideDiv);
    });
    
    preview.style.display = 'block';
}

function displayPreview(slideUpdates) {
    const preview = document.getElementById('preview');
    const content = document.getElementById('previewContent');
    
    content.innerHTML = '<h4>Generated Content:</h4>';
    
    slideUpdates.slides.forEach(slide => {
        const slideDiv = document.createElement('div');
        slideDiv.className = 'preview-slide';
        slideDiv.innerHTML = `
            <strong>Slide ${slide.slideNumber}:</strong><br/>
            ${slide.updates.map(u => u.text).join('<br/><br/>')}
        `;
        content.appendChild(slideDiv);
    });
    
    preview.style.display = 'block';
}
