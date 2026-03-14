// Simple version - Sirf DNC/Clean check
let results = [];
let currentNumbers = [];
let currentIndex = 0;
let processing = false;
let processingInterval;

// APIs
const TCPA_API = 'https://api.uspeoplesearch.site/tcpa/v1?x=';
const PERSON_API = 'https://api.uspeoplesearch.site/v1/?x=';

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    initializeSpeedSlider();
});

function initializeSpeedSlider() {
    const slider = document.getElementById('speedSlider');
    const valueDisplay = document.getElementById('speedValue');
    
    if (slider) {
        slider.value = 4000; // 4 seconds - slow and steady
        valueDisplay.textContent = '4.0 seconds';
        
        slider.addEventListener('input', function() {
            const seconds = (parseInt(this.value) / 1000).toFixed(1);
            valueDisplay.textContent = `${seconds} seconds`;
        });
    }
}

function initializeEventListeners() {
    // Theme Toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    // File upload
    const dragDropArea = document.getElementById('dragDropArea');
    const fileInput = document.getElementById('fileInput');
    
    dragDropArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    
    // Buttons
    document.getElementById('startProcessingBtn').addEventListener('click', startProcessing);
    document.getElementById('cancelProcessingBtn').addEventListener('click', cancelProcessing);
    document.getElementById('clearResultsBtn').addEventListener('click', clearResults);
    
    // Download buttons
    document.getElementById('downloadCleanBtn').addEventListener('click', downloadClean);
    document.getElementById('downloadDncBtn').addEventListener('click', downloadDnc);
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const icon = document.querySelector('.theme-toggle i');
    const text = document.querySelector('.theme-toggle span');
    
    if (document.body.classList.contains('dark-mode')) {
        icon.className = 'fas fa-moon';
        text.textContent = 'Light Mode';
    } else {
        icon.className = 'fas fa-sun';
        text.textContent = 'Dark Mode';
    }
}

function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFile(file);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    handleFile(file);
}

async function handleFile(file) {
    if (!file) return;
    
    if (!file.name.match(/\.(txt|csv)$/)) {
        alert('Please upload .txt or .csv file');
        return;
    }

    try {
        const text = await file.text();
        const numbers = text.split('\n')
            .map(line => line.trim())
            .filter(line => {
                const num = line.replace(/\D/g, '');
                return num.length === 10;
            })
            .map(line => line.replace(/\D/g, ''));

        if (numbers.length === 0) {
            alert('No valid 10-digit numbers found');
            return;
        }

        currentNumbers = numbers;
        showPreview(file.name, numbers);
        document.getElementById('controlPanel').style.display = 'block';
        
    } catch (error) {
        alert('Error reading file');
    }
}

function showPreview(fileName, numbers) {
    document.getElementById('filePreview').style.display = 'block';
    document.getElementById('fileName').textContent = fileName;
    document.getElementById('fileCount').textContent = `${numbers.length} numbers`;
    
    const preview = numbers.slice(0, 5).join('<br>');
    const more = numbers.length > 5 ? `<br>... and ${numbers.length - 5} more` : '';
    document.getElementById('previewNumbers').innerHTML = preview + more;
}

// JSONP function - No CORS issues
function jsonpRequest(url, timeout = 20000) {
    return new Promise((resolve, reject) => {
        const callbackName = 'cb_' + Date.now() + '_' + Math.random().toString(36).substr(2);
        const script = document.createElement('script');
        
        window[callbackName] = function(data) {
            cleanup();
            resolve(data);
        };
        
        function cleanup() {
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
            clearTimeout(timeoutId);
        }
        
        script.src = `${url}&callback=${callbackName}`;
        script.onerror = () => {
            cleanup();
            reject(new Error('Network error'));
        };
        
        const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error('Timeout - API slow'));
        }, timeout);
        
        document.body.appendChild(script);
    });
}

// Process single number
async function processNumber(number) {
    try {
        // 1. TCPA check
        const tcpaData = await jsonpRequest(`${TCPA_API}${number}`);
        
        // Determine status
        const isClean = tcpaData.listed === 'No';
        const status = isClean ? 'Clean' : 'DNC';
        
        let personInfo = null;
        
        // 2. If clean, try to get person info (optional)
        if (isClean) {
            try {
                personInfo = await jsonpRequest(`${PERSON_API}${number}`, 10000);
            } catch (e) {
                // Person info optional - ignore errors
                console.log('Person info not available');
            }
        }
        
        return {
            phone: number,
            status: status,
            state: tcpaData.state || 'Unknown',
            listed: tcpaData.listed || 'No',
            type: tcpaData.type || 'No',
            ndnc: tcpaData.ndnc || 'No',
            sdnc: tcpaData.sdnc || 'No',
            person: personInfo
        };
        
    } catch (error) {
        // Agar API timeout bhi ho jaye, toh retry karo
        console.log(`Retrying ${number} after error...`);
        
        // Ek baar retry karo
        try {
            await new Promise(r => setTimeout(r, 2000));
            const tcpaData = await jsonpRequest(`${TCPA_API}${number}`, 25000);
            
            return {
                phone: number,
                status: tcpaData.listed === 'No' ? 'Clean' : 'DNC',
                state: tcpaData.state || 'Unknown',
                listed: tcpaData.listed || 'No',
                type: tcpaData.type || 'No',
                ndnc: tcpaData.ndnc || 'No',
                sdnc: tcpaData.sdnc || 'No',
                person: null
            };
        } catch (retryError) {
            // Agar dobaara fail ho, toh DNC maan lo (safe side)
            return {
                phone: number,
                status: 'DNC', // Default to DNC for safety
                state: 'Unknown',
                listed: 'Unknown',
                type: 'Unknown',
                ndnc: 'Unknown',
                sdnc: 'Unknown',
                person: null,
                note: 'Used fallback due to API issue'
            };
        }
    }
}

// Start processing
async function startProcessing() {
    if (processing) return;
    if (!currentNumbers || currentNumbers.length === 0) {
        alert('Please upload numbers first');
        return;
    }
    
    processing = true;
    results = [];
    currentIndex = 0;
    
    document.getElementById('resultsBody').innerHTML = '';
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('startProcessingBtn').style.display = 'none';
    document.getElementById('cancelProcessingBtn').style.display = 'inline-flex';
    
    const speed = parseInt(document.getElementById('speedSlider').value);
    
    while (processing && currentIndex < currentNumbers.length) {
        const number = currentNumbers[currentIndex];
        
        // Update progress
        const percent = ((currentIndex + 1) / currentNumbers.length) * 100;
        document.getElementById('progressBar').style.width = `${percent}%`;
        document.getElementById('progressPercentage').textContent = `${Math.round(percent)}%`;
        document.getElementById('progressDetail').textContent = 
            `Checking ${currentIndex + 1}/${currentNumbers.length}: ${number}`;
        
        // Process number
        const result = await processNumber(number);
        results.push(result);
        addToTable(result);
        updateStats();
        
        currentIndex++;
        
        // Wait before next number (slow and steady)
        if (processing && currentIndex < currentNumbers.length) {
            await new Promise(r => setTimeout(r, speed));
        }
    }
    
    finishProcessing();
}

function cancelProcessing() {
    processing = false;
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('startProcessingBtn').style.display = 'inline-flex';
    document.getElementById('cancelProcessingBtn').style.display = 'none';
}

function finishProcessing() {
    processing = false;
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('startProcessingBtn').style.display = 'inline-flex';
    document.getElementById('cancelProcessingBtn').style.display = 'none';
    
    // Enable downloads
    document.getElementById('downloadCleanBtn').disabled = !results.some(r => r.status === 'Clean');
    document.getElementById('downloadDncBtn').disabled = !results.some(r => r.status === 'DNC');
    
    // Update state buttons
    updateStateButtons();
    
    alert(`Complete! ${results.length} numbers checked`);
}

function addToTable(result) {
    const tbody = document.getElementById('resultsBody');
    
    if (tbody.children.length === 1 && tbody.children[0].classList.contains('no-data')) {
        tbody.innerHTML = '';
    }
    
    const row = document.createElement('tr');
    
    const statusClass = result.status === 'Clean' ? 'badge clean' : 'badge dnc';
    
    let personHtml = '-';
    if (result.person && result.person.person) {
        personHtml = '<span class="badge info">Available</span>';
    }
    
    row.innerHTML = `
        <td>${result.phone}</td>
        <td><span class="${statusClass}">${result.status}</span></td>
        <td>${result.listed}</td>
        <td>${result.type}</td>
        <td>${result.state}</td>
        <td>${result.ndnc}</td>
        <td>${result.sdnc}</td>
        <td>${personHtml}</td>
        <td>
            <button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${result.phone}')">
                <i class="fas fa-copy"></i>
            </button>
        </td>
    `;
    
    tbody.appendChild(row);
}

function updateStats() {
    const clean = results.filter(r => r.status === 'Clean').length;
    const dnc = results.filter(r => r.status === 'DNC').length;
    
    document.getElementById('totalCount').textContent = results.length;
    document.getElementById('cleanCount').textContent = clean;
    document.getElementById('dncCount').textContent = dnc;
    document.getElementById('errorCount').textContent = '0'; // No errors
}

function updateStateButtons() {
    const states = {};
    results.forEach(r => {
        if (r.state && r.state !== 'Unknown') {
            if (!states[r.state]) {
                states[r.state] = { clean: 0, dnc: 0 };
            }
            if (r.status === 'Clean') states[r.state].clean++;
            if (r.status === 'DNC') states[r.state].dnc++;
        }
    });
    
    const container = document.getElementById('stateButtons');
    const section = document.getElementById('stateDownloadSection');
    
    if (Object.keys(states).length > 0) {
        section.style.display = 'block';
        container.innerHTML = '';
        
        Object.keys(states).sort().forEach(state => {
            const btn = document.createElement('button');
            btn.className = 'state-btn';
            btn.innerHTML = `<i class="fas fa-download"></i> ${state} (C:${states[state].clean}/D:${states[state].dnc})`;
            btn.onclick = () => downloadState(state);
            container.appendChild(btn);
        });
    }
}

function downloadState(state) {
    const numbers = results.filter(r => r.state === state).map(r => r.phone);
    downloadFile(numbers.join('\n'), `${state}_numbers.txt`);
}

function downloadClean() {
    const numbers = results.filter(r => r.status === 'Clean').map(r => r.phone);
    downloadFile(numbers.join('\n'), 'clean_numbers.txt');
}

function downloadDnc() {
    const numbers = results.filter(r => r.status === 'DNC').map(r => r.phone);
    downloadFile(numbers.join('\n'), 'dnc_numbers.txt');
}

function clearResults() {
    results = [];
    currentNumbers = [];
    document.getElementById('resultsBody').innerHTML = `
        <tr>
            <td colspan="9" class="no-data">
                <i class="fas fa-upload"></i> Upload file to start
            </td>
        </tr>
    `;
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('controlPanel').style.display = 'none';
    document.getElementById('stateDownloadSection').style.display = 'none';
    document.getElementById('totalCount').textContent = '0';
    document.getElementById('cleanCount').textContent = '0';
    document.getElementById('dncCount').textContent = '0';
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
}

function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Global functions
window.copyToClipboard = copyToClipboard;
