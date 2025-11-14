// --- App State ---
let playerData = [];
let fighterData = [];
let selectedPlayers = []; // Array of Governor IDs
let currentSort = { column: 'numeric_dkp_percent', direction: 'desc' };

// --- Google Sheet URL ---
// This is a proxy to bypass CORS issues when fetching from Google Sheets directly
const sheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSLu0NZqFyPM9SuOG3g8E6PawHhKAo_C7uqrg6OYpn3XqyFk12zwvGZf-6tho2zrMG8fQN_KAaXLfLK/pub?output=csv&gid=195486311';

// --- DOM Element Refs ---
const loadStatus = document.getElementById('load-status');
const forceRefreshBtn = document.getElementById('force-refresh');

const tabs = {
    snapshot: { btn: document.getElementById('btn-snapshot'), content: document.getElementById('content-snapshot') },
    playerCards: { btn: document.getElementById('btn-player-cards'), content: document.getElementById('content-player-cards') },
    fighters: { btn: document.getElementById('btn-fighters'), content: document.getElementById('content-fighters') },
    compare: { btn: document.getElementById('btn-compare'), content: document.getElementById('content-compare') },
    chart: { btn: document.getElementById('btn-chart'), content: document.getElementById('content-chart') }
};

const searchBars = {
    snapshot: document.getElementById('search-bar-snapshot'),
    playerCards: document.getElementById('search-bar-player-cards'),
    fighters: document.getElementById('search-bar-fighters')
};

const playerGrid = document.getElementById('player-grid');
const fighterGrid = document.getElementById('fighter-grid');
const snapshotTableWrapper = document.getElementById('snapshot-table-wrapper');

const compareBtn = document.getElementById('btn-compare');
const clearBtn = document.getElementById('clear-selection-btn');
const compareWrapper = document.getElementById('compare-table-wrapper');

// --- Utility Functions ---

function cleanNumber(str) {
    if (typeof str !== 'string') return 0;
    return parseInt(str.replace(/,/g, '').replace(/"/g, ''), 10) || 0;
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
}

function formatShort(num) {
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k';
    return num.toString();
}

/**
 * Normalizes a value to a 0-1 range for heatmaps
 */
function normalize(val, min, max) {
    if (max === min) return 1; // Avoid division by zero
    return (val - min) / (max - min);
}

/**
 * NEW: Debounce utility to prevent rapid-firing of resize events
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


// --- Data Parsing & Processing ---

function parseCSV(data) {
    const lines = data.trim().split('\n');
    const headers = lines.shift().split(',').map(h => h.trim().replace(/"/g, ''));
    
    return lines.map(line => {
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        let player = {};
        headers.forEach((header, index) => {
            player[header] = (values[index] || '').trim().replace(/"/g, '');
        });
        // Pre-calculate numeric values for sorting and filtering
        player.numeric_kvk_kp = cleanNumber(player['kvk only KP']);
        player.numeric_deads = cleanNumber(player['Kvk only Deads']);
        player.numeric_dkp_percent = parseFloat(player['DKP % Complete']) || 0;
        player.numeric_power = cleanNumber(player['Starting Power']);
        player.numeric_t4t5 = cleanNumber(player['T4+T5 Combined']);
        return player;
    });
}

function processFighterData() {
    fighterData = playerData
        .filter(p => p.numeric_kvk_kp > 0 && p.numeric_power >= 20000000)
        .sort((a, b) => b.numeric_dkp_percent - a.numeric_dkp_percent);
}

// --- Tab Rendering Functions ---

/**
 * Renders all tabs *except* the chart, which is rendered on-demand
 */
function renderAllTabs() {
    renderSnapshotTable();
    renderPlayerCards();
    renderFighterCards();
    // renderScatterChart(); // MOVED to activateTab
}

/**
 * Renders the main snapshot table with heatmaps
 */
function renderSnapshotTable() {
    // 1. Get stats for heatmap normalization
    const kps = playerData.map(p => p.numeric_kvk_kp);
    const deads = playerData.map(p => p.numeric_deads);
    const dkps = playerData.map(p => p.numeric_dkp_percent);
    const t4t5s = playerData.map(p => p.numeric_t4t5);

    const max = {
        kp: Math.max(...kps), kp_min: Math.min(...kps),
        deads: Math.max(...deads), deads_min: Math.min(...deads),
        dkp: Math.max(...dkps), dkp_min: Math.min(...dkps),
        t4t5: Math.max(...t4t5s), t4t5_min: Math.min(...t4t5s),
    };

    // 2. Sort data
    sortData(playerData);
    
    // 3. Generate Table HTML
    // NEW: Using DOM manipulation instead of innerHTML
    snapshotTableWrapper.innerHTML = ''; // Clear wrapper
    const table = document.createElement('table');
    table.className = 'snapshot-table';
    
    // Create Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = [
        { text: '', sort: null, class: 'compare-checkbox-cell' },
        { text: 'Name', sort: 'Governor Name', class: '' },
        { text: 'KvK KP', sort: 'numeric_kvk_kp', class: '' },
        { text: 'T4/T5 Kills', sort: 'numeric_t4t5', class: '' },
        { text: 'Deads', sort: 'numeric_deads', class: '' },
        { text: 'DKP %', sort: 'numeric_dkp_percent', class: '' }
    ];
    
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h.text;
        if (h.class) th.className = h.class;
        if (h.sort) {
            th.dataset.sort = h.sort;
            th.addEventListener('click', handleSort);
            if (h.sort === currentSort.column) {
                th.innerHTML += currentSort.direction === 'desc' ? ' &darr;' : ' &uarr;';
            }
        }
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create Body
    const tbody = document.createElement('tbody');
    playerData.forEach(player => {
        const tr = document.createElement('tr');
        const govId = player['Governor ID'];
        tr.dataset.id = govId;
        tr.dataset.name = player['Governor Name'].toLowerCase();

        // Checkbox Cell
        const tdCheck = document.createElement('td');
        tdCheck.className = 'compare-checkbox-cell';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'compare-checkbox';
        checkbox.dataset.id = govId;
        checkbox.checked = selectedPlayers.includes(govId);
        checkbox.title = 'Select to Compare';
        checkbox.addEventListener('change', handleCheck);
        tdCheck.appendChild(checkbox);
        tr.appendChild(tdCheck);

        // Name Cell
        const tdName = document.createElement('td');
        tdName.textContent = player['Governor Name'];
        tdName.title = govId;
        tr.appendChild(tdName);

        // KP Cell
        const tdKP = document.createElement('td');
        tdKP.textContent = formatShort(player.numeric_kvk_kp);
        tdKP.dataset.heatmapColor = 'green';
        tdKP.style = `--heatmap-opacity: ${normalize(player.numeric_kvk_kp, max.kp_min, max.kp)}`;
        tr.appendChild(tdKP);

        // T4/T5 Cell
        const tdT4T5 = document.createElement('td');
        tdT4T5.textContent = formatShort(player.numeric_t4t5);
        tdT4T5.dataset.heatmapColor = 'green';
        tdT4T5.style = `--heatmap-opacity: ${normalize(player.numeric_t4t5, max.t4t5_min, max.t4t5)}`;
        tr.appendChild(tdT4T5);

        // Deads Cell
        const tdDeads = document.createElement('td');
        tdDeads.textContent = formatNumber(player.numeric_deads);
        tdDeads.dataset.heatmapColor = 'red';
        tdDeads.style = `--heatmap-opacity: ${normalize(player.numeric_deads, max.deads_min, max.deads)}`;
        tr.appendChild(tdDeads);

        // DKP % Cell
        const tdDKP = document.createElement('td');
        tdDKP.textContent = `${player.numeric_dkp_percent}%`;
        tdDKP.dataset.heatmapColor = 'blue';
        tdDKP.style = `--heatmap-opacity: ${normalize(player.numeric_dkp_percent, max.dkp_min, max.dkp)}`;
        tr.appendChild(tdDKP);

        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    snapshotTableWrapper.appendChild(table);
}

/**
 * Renders the grid of player cards
 */
function renderPlayerCards() {
    playerGrid.innerHTML = ''; // Clear grid
    const fragment = document.createDocumentFragment(); // Use a fragment for performance

    playerData.forEach(player => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player.numeric_dkp_percent;
        const isChecked = selectedPlayers.includes(govId);

        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.id = govId;
        card.dataset.name = govName.toLowerCase();

        card.innerHTML = `
            <input type="checkbox" class="compare-checkbox" data-id="${govId}" ${isChecked ? 'checked' : ''} title="Select to Compare">
            <h3 class="player-name" title="${govName}">${govName}</h3>
            <p class="player-id">${govId}</p>
            <div class="grid grid-cols-2 gap-2 mt-4">
                <div>
                    <span class="stat-label">KvK KP</span>
                    <p class="player-stat">${formatShort(kvkKP)}</p>
                </div>
                <div>
                    <span class="stat-label">DKP %</span>
                    <p class="player-stat">${dkpPercent}%</p>
                </div>
            </div>
        `;
        
        card.querySelector('.compare-checkbox').addEventListener('change', handleCheck);
        fragment.appendChild(card);
    });

    playerGrid.appendChild(fragment); // Append all cards at once
}

/**
 * Renders the grid of "Fighter" cards
 */
function renderFighterCards() {
    fighterGrid.innerHTML = ''; // Clear grid
    const fragment = document.createDocumentFragment(); // Use a fragment

    if (fighterData.length === 0) {
        fighterGrid.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">No fighters found. (Min 20M Power & >0 KvK KP)</p>';
        return;
    }

    fighterData.forEach((player, index) => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player.numeric_dkp_percent;
        const power = player.numeric_power;
        const isChecked = selectedPlayers.includes(govId);

        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.id = govId;
        card.dataset.name = govName.toLowerCase();
        
        card.innerHTML = `
            <input type="checkbox" class="compare-checkbox" data-id="${govId}" ${isChecked ? 'checked' : ''} title="Select to Compare">
            <span class="absolute top-2 left-2 text-xl font-bold text-gray-400">#${index + 1}</span>
            <h3 class="player-name" title="${govName}">${govName}</h3>
            <p class="player-id">${govId}</p>
            <div class="grid grid-cols-3 gap-1 mt-4 text-xs">
                <div>
                    <span class="stat-label">DKP %</span>
                    <p class="player-stat text-blue-600">${dkpPercent}%</p>
                </div>
                <div>
                    <span class="stat-label">KvK KP</span>
                    <p class="player-stat">${formatShort(kvkKP)}</p>
                </div>
                <div>
                    <span class="stat-label">Power</span>
                    <p class="player-stat">${formatShort(power)}</p>
                </div>
            </div>
        `;

        card.querySelector('.compare-checkbox').addEventListener('change', handleCheck);
        fragment.appendChild(card);
    });

    fighterGrid.appendChild(fragment); // Append all cards at once
}

/**
 * Renders the D3 scatter chart.
 */
function renderScatterChart() {
    const canvas = d3.select("#scatter-chart").node();
    const container = d3.select(".chart-container").node();

    // Clear previous canvas content if any
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get size from container, which is now responsive
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) {
        console.error("Chart container has no size. Cannot render.");
        return; // Don't render if container isn't visible
    }
    
    // Set canvas dimensions for High-DPI
    canvas.width = width * 2; 
    canvas.height = height * 2;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(2, 2); // Scale context for High-DPI

    const chartData = playerData.filter(p => p.numeric_kvk_kp > 0 || p.numeric_deads > 0);

    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Data for chart
    const plotData = chartData.map(d => ({
        x: d.numeric_kvk_kp,
        y: d.numeric_deads,
        dkpPercent: d.numeric_dkp_percent,
        name: d['Governor Name']
    }));

    // Scales
    const x = d3.scaleLinear()
        .domain([0, d3.max(plotData, d => d.x) * 1.05])
        .range([0, innerWidth]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(plotData, d => d.y) * 1.05])
        .range([innerHeight, 0]);

    const color = d3.scaleSequential(d3.interpolateRdBu)
        .domain([d3.max(plotData, d => d.dkpPercent), 0]); // Red (0) to Blue (Max)
    
    const radius = 5;

    // --- Draw Chart ---
    ctx.save();
    ctx.translate(margin.left, margin.top);
    
    // Draw Points
    plotData.forEach(d => {
        ctx.beginPath();
        ctx.arc(x(d.x), y(d.y), radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = color(d.dkpPercent);
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });
    
    // Draw Axes
    const xAxis = d3.axisBottom(x).ticks(5).tickFormat(d3.format("~s"));
    const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s"));

    // Custom axis drawing on canvas
    drawAxis(ctx, xAxis, 0, innerHeight, innerWidth, innerHeight);
    drawAxis(ctx, yAxis, 0, 0, 0, innerHeight);

    // Axis Labels
    ctx.fillStyle = "#000";
    ctx.font = "14px Inter";
    ctx.textAlign = "center";
    ctx.fillText("KvK Kill Points", innerWidth / 2, innerHeight + margin.bottom - 10);
    
    ctx.save();
    ctx.translate(-margin.left + 20, innerHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("KvK Deads", 0, 0);
    ctx.restore();
    
    ctx.restore();

    setupChartInteractions(plotData, x, y, canvas, margin);
    canvas._chartRendered = true; // Mark as rendered
}

/**
 * Helper to draw D3 axes on Canvas
 */
function drawAxis(ctx, axis, x, y, width, height) {
    const tempContainer = d3.select(document.createElement("g"));
    tempContainer.call(axis);
    
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#aaa";
    ctx.fillStyle = "#555";
    ctx.font = "12px Inter";

    // Ticks and lines
    tempContainer.selectAll("line").each(function() {
        const line = d3.select(this);
        ctx.beginPath();
        ctx.moveTo(parseFloat(line.attr("x1")), parseFloat(line.attr("y1")));
        ctx.lineTo(parseFloat(line.attr("x2")), parseFloat(line.attr("y2")));
        ctx.stroke();
    });

    // Text
    tempContainer.selectAll("text").each(function() {
        const text = d3.select(this);
        ctx.textAlign = text.attr("text-anchor") === "middle" ? "center" : text.attr("text-anchor");
        ctx.textBaseline = "middle";
        ctx.fillText(text.text(), parseFloat(text.attr("x")), parseFloat(text.attr("y")));
    });
    
    ctx.restore();
}

/**
 * Sets up hover/tooltip for the chart
 */
function setupChartInteractions(plotData, xScale, yScale, canvas, margin) {
    const tooltip = document.getElementById('chart-tooltip');
    
    // Use D3 quadtree for fast point finding
    const quadtree = d3.quadtree()
        .x(d => xScale(d.x))
        .y(d => yScale(d.y))
        .addAll(plotData);

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        
        // Correct position relative to the canvas element
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);

        // Find nearest point in the data space
        const [target] = quadtree.find(
            (x * 2) - margin.left, // Adjust for DPI and margin
            (y * 2) - margin.top, 
            10 * 2 // Search radius adjusted for DPI
        );

        if (target) {
            canvas.style.cursor = 'pointer';
            tooltip.innerHTML = `
                <strong>${target.name}</strong><br>
                KvK KP: ${formatShort(target.x)}<br>
                Deads: ${formatNumber(target.y)}<br>
                DKP %: ${target.dkpPercent}%
            `;
            tooltip.classList.remove('hidden');
            
            // Position 10px to the right and 10px below the cursor *relative to the canvas*
            let tooltipX = x + 10;
            let tooltipY = y + 10;
            
            // Prevent tooltip from going off the right edge of the chart
            if (tooltipX + tooltip.offsetWidth > rect.width) {
                tooltipX = x - tooltip.offsetWidth - 10;
            }
            
            // Prevent tooltip from going off the bottom edge of the chart
            if (tooltipY + tooltip.offsetHeight > rect.height) {
                tooltipY = y - tooltip.offsetHeight - 10;
            }

            tooltip.style.left = `${tooltipX}px`;
            tooltip.style.top = `${tooltipY}px`;
            
        } else {
            canvas.style.cursor = 'default';
            tooltip.classList.add('hidden');
        }
    });

    canvas.addEventListener('mouseleave', () => {
        canvas.style.cursor = 'default';
        tooltip.classList.add('hidden');
    });
}


// --- Data Sorting ---

function handleSort(e) {
    const newColumn = e.target.dataset.sort;
    if (currentSort.column === newColumn) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = newColumn;
        currentSort.direction = 'desc';
    }
    renderSnapshotTable(); // Re-render the table with new sort
}

function sortData(data) {
    data.sort((a, b) => {
        let valA, valB;
        
        if (currentSort.column === 'Governor Name') {
            valA = a[currentSort.column].toLowerCase();
            valB = b[currentSort.column].toLowerCase();
        } else {
            // Use pre-calculated numeric fields
            valA = a[currentSort.column];
            valB = b[currentSort.column];
        }

        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}


// --- Search Functionality ---

function setupSearch() {
    Object.keys(searchBars).forEach(key => {
        // Ensure the search bar exists before adding listener
        if (searchBars[key]) {
            searchBars[key].addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                filterViews(query, key);
            });
        }
    });
}

function filterViews(query, sourceTab) {
    // Filter Snapshot Table
    const rows = snapshotTableWrapper.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const name = row.dataset.name;
        const id = row.dataset.id;
        row.style.display = (name.includes(query) || id.includes(query)) ? '' : 'none';
    });
    
    // Filter Player Cards
    const cards = playerGrid.querySelectorAll('.player-card');
    cards.forEach(card => {
        const name = card.dataset.name;
        const id = card.dataset.id;
        card.style.display = (name.includes(query) || id.includes(query)) ? 'block' : 'none';
    });

    // Filter Fighter Cards
    const fighterCards = fighterGrid.querySelectorAll('.player-card');
    fighterCards.forEach(card => {
        const name = card.dataset.name;
        const id = card.dataset.id;
        card.style.display = (name.includes(query) || id.includes(query)) ? 'block' : 'none';
    });

    // Sync other search bars
    Object.keys(searchBars).forEach(key => {
        if (key !== sourceTab && searchBars[key]) {
            searchBars[key].value = query;
        }
    });
}

// --- Comparison Functionality ---

function handleCheck(e) {
    const id = e.target.dataset.id;
    if (e.target.checked) {
        if (selectedPlayers.length < 3) {
            selectedPlayers.push(id);
        } else {
            e.target.checked = false; // Don't allow more than 3
        }
    } else {
        selectedPlayers = selectedPlayers.filter(pId => pId !== id);
    }
    updateCompareState();
}

function updateCompareState() {
    // Update compare button text
    compareBtn.textContent = `Compare (${selectedPlayers.length})`;

    // Sync checkboxes across all tabs
    const allCheckboxes = document.querySelectorAll('.compare-checkbox');
    allCheckboxes.forEach(box => {
        box.checked = selectedPlayers.includes(box.dataset.id);
    });

    // Disable/enable checkboxes
    if (selectedPlayers.length >= 3) {
        allCheckboxes.forEach(box => {
            if (!box.checked) box.disabled = true;
        });
    } else {
        allCheckboxes.forEach(box => box.disabled = false);
    }
    
    renderComparison();
}

clearBtn.addEventListener('click', () => {
    selectedPlayers = [];
    document.querySelectorAll('.compare-checkbox').forEach(box => {
        box.checked = false;
    });
    updateCompareState();
});

function renderComparison() {
    if (selectedPlayers.length === 0) {
        compareWrapper.innerHTML = '<p class="text-gray-500 text-center p-8">Select players from any tab to compare them here.</p>';
        return;
    }

    const playersToCompare = playerData.filter(p => selectedPlayers.includes(p['Governor ID']));
    
    // Define metrics to compare: [CSV Header, Higher is better?]
    const metrics = [
        ['Starting Power', true],
        ['Power +/-', true], // Usually negative, so "less negative" is better
        ['Troop Power', true], // Same as above
        ['T1 Kills', true], ['T2 Kills', true], ['T3 Kills', true],
        ['T4 Kills', true], ['T5 Kills', true],
        ['T4+T5 Combined', true],
        ['Kvk only Deads', false], // Lower is better
        ['kvk only KP', true],
        ['KVK DKP', true],
        ['Target DKP', true],
        ['DKP % Complete', true]
    ];

    // NEW: Using DOM manipulation for the compare table
    compareWrapper.innerHTML = ''; // Clear wrapper
    const table = document.createElement('table');
    table.className = 'compare-table';
    
    // Table Header (Player Names)
    const thead = document.createElement('thead');
    let headerRow = '<tr><th>Metric</th>';
    playersToCompare.forEach(p => {
        headerRow += `<th>${p['Governor Name']}</th>`;
    });
    for(let i = 0; i < 3 - playersToCompare.length; i++) headerRow += '<th>-</th>';
    headerRow += '</tr>';
    thead.innerHTML = headerRow;
    table.appendChild(thead);

    // Table Body (Stats)
    const tbody = document.createElement('tbody');
    metrics.forEach(([metric, higherIsBetter]) => {
        const tr = document.createElement('tr');
        
        const tdMetric = document.createElement('td');
        tdMetric.textContent = metric;
        tr.appendChild(tdMetric);

        let values = [];
        playersToCompare.forEach(p => {
            values.push({
                val: cleanNumber(p[metric]),
                formatted: p[metric] || '0' // The original string with commas
            });
        });

        // Find winner/loser
        const numericVals = values.map(v => v.val);
        const targetVal = higherIsBetter ? Math.max(...numericVals) : Math.min(...numericVals);
        const worstVal = higherIsBetter ? Math.min(...numericVals) : Math.max(...numericVals);

        values.forEach(v => {
            const td = document.createElement('td');
            td.textContent = v.formatted;
            
            if (v.val === targetVal) td.className = 'stat-winner';
            else if (v.val === worstVal && values.length > 1 && targetVal !== worstVal) td.className = 'stat-loser';
            
            tr.appendChild(td);
        });
        
        for(let i = 0; i < 3 - playersToCompare.length; i++) {
            const tdEmpty = document.createElement('td');
            tdEmpty.textContent = '-';
            tr.appendChild(tdEmpty);
        }
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    compareWrapper.appendChild(table);
}

// --- Tab Switching ---

function activateTab(tabName) {
    Object.keys(tabs).forEach(key => {
        const isTarget = key === tabName;
        tabs[key].btn.classList.toggle('active', isTarget);
        tabs[key].content.classList.toggle('active', isTarget);

        // FIX: Check if we are activating the chart tab
        if (key === 'chart' && isTarget) {
            renderScatterChart();
        }
    });
}

Object.keys(tabs).forEach(key => {
    tabs[key].btn.addEventListener('click', () => activateTab(key));
});

// --- Data Fetching & Caching ---

async function fetchData(force = false) {
    loadStatus.textContent = "Checking for data updates...";
    
    const cachedData = localStorage.getItem('kvkData');
    const cachedTime = localStorage.getItem('kvkDataTimestamp');

    if (cachedData && cachedTime && !force) {
        loadStatus.textContent = `Loading cached data from ${new Date(cachedTime).toLocaleString()}`;
        try {
            playerData = parseCSV(cachedData);
            processFighterData(); 
            renderAllTabs();
            
            Object.values(searchBars).forEach(bar => bar.disabled = false);
            forceRefreshBtn.disabled = false;
        } catch (e) {
            console.error("Error parsing cached data:", e);
            localStorage.clear(); // Clear bad cache
            fetchData(true); // Force fetch new data
            return;
        }
        
        // After loading cache, check for new data
        checkRemoteData(cachedData);
    } else {
        // No cache or force refresh
        loadStatus.textContent = "Fetching live data from Google Sheets...";
        try {
            const response = await fetch(sheetUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const csvData = await response.text();
            
            const newTimestamp = new Date().toISOString();
            localStorage.setItem('kvkData', csvData);
            localStorage.setItem('kvkDataTimestamp', newTimestamp);

            playerData = parseCSV(csvData);
            processFighterData(); 
            renderAllTabs();
            
            Object.values(searchBars).forEach(bar => bar.disabled = false);
            forceRefreshBtn.disabled = false;
            loadStatus.textContent = `Data loaded and saved. (Updated: ${new Date(newTimestamp).toLocaleString()})`;

        } catch (err) {
            console.error("Fetch Error:", err);
            loadStatus.textContent = "Error loading data. Please try refreshing the page.";
        }
    }
}

async function checkRemoteData(cachedData) {
    try {
        const response = await fetch(sheetUrl);
        if (!response.ok) return; // Don't bother if fetch fails
        const csvData = await response.text();

        if (cachedData === csvData) {
            loadStatus.textContent = `Data is already up to date. (Last check: ${new Date().toLocaleTimeString()})`;
        } else {
            const newTimestamp = new Date().toISOString();
            localStorage.setItem('kvkData', csvData);
            localStorage.setItem('kvkDataTimestamp', newTimestamp);

            playerData = parseCSV(csvData);
            processFighterData(); 
            renderAllTabs();
            
            loadStatus.textContent = `Data updated! Successfully loaded ${playerData.length} players. (Updated: ${new Date(newTimestamp).toLocaleString()})`;
        }
    } catch (err) {
        console.error("Background fetch failed:", err);
        loadStatus.textContent = `Cached data loaded. Background update failed. (Last check: ${new Date().toLocaleTimeString()})`;
    }
}

// --- NEW: Resize Handling ---
function handleResize() {
    // Check if the chart tab is active
    if (tabs.chart.content.classList.contains('active')) {
        const canvas = d3.select("#scatter-chart").node();
        canvas._chartRendered = false; // Mark for redraw
        renderScatterChart();
    }
}

// --- App Entry Point ---

forceRefreshBtn.addEventListener('click', () => {
    loadStatus.textContent = "Forcing data refresh...";
    forceRefreshBtn.disabled = true;
    fetchData(true);
});

document.addEventListener('DOMContentLoaded', () => {
    activateTab('snapshot'); // Start on snapshot tab
    setupSearch();
    fetchData();

    // NEW: Add the debounced resize listener
    window.addEventListener('resize', debounce(handleResize, 250));
});
