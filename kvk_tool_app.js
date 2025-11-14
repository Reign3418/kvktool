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
    let tableHTML = `
        <table class="snapshot-table">
            <thead>
                <tr>
                    <th class="compare-checkbox-cell"></th>
                    <th data-sort="Governor Name">Name</th>
                    <th data-sort="numeric_kvk_kp">KvK KP</th>
                    <th data-sort="numeric_t4t5">T4/T5 Kills</th>
                    <th data-sort="numeric_deads">Deads</th>
                    <th data-sort="numeric_dkp_percent">DKP %</th>
                </tr>
            </thead>
            <tbody>
    `;

    playerData.forEach(player => {
        const govId = player['Governor ID'];
        const isChecked = selectedPlayers.includes(govId);

        // Calculate heatmap opacity
        const kpOpacity = normalize(player.numeric_kvk_kp, max.kp_min, max.kp);
        const t4t5Opacity = normalize(player.numeric_t4t5, max.t4t5_min, max.t4t5);
        const deadsOpacity = normalize(player.numeric_deads, max.deads_min, max.deads);
        const dkpOpacity = normalize(player.numeric_dkp_percent, max.dkp_min, max.dkp);

        tableHTML += `
            <tr data-id="${govId}" data-name="${player['Governor Name'].toLowerCase()}">
                <td class="compare-checkbox-cell">
                    <input type="checkbox" class="compare-checkbox" data-id="${govId}" ${isChecked ? 'checked' : ''} title="Select to Compare">
                </td>
                <td title="${govId}">${player['Governor Name']}</td>
                <td data-heatmap-color="green" style="--heatmap-opacity: ${kpOpacity};">${formatShort(player.numeric_kvk_kp)}</td>
                <td data-heatmap-color="green" style="--heatmap-opacity: ${t4t5Opacity};">${formatShort(player.numeric_t4t5)}</td>
                <td data-heatmap-color="red" style="--heatmap-opacity: ${deadsOpacity};">${formatNumber(player.numeric_deads)}</td>
                <td data-heatmap-color="blue" style="--heatmap-opacity: ${dkpOpacity};">${player.numeric_dkp_percent}%</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    snapshotTableWrapper.innerHTML = tableHTML;
    
    // 4. Add event listeners
    snapshotTableWrapper.querySelectorAll('.compare-checkbox').forEach(box => {
        box.addEventListener('change', handleCheck);
    });
    snapshotTableWrapper.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', handleSort);
        // Add sort indicator
        if (th.dataset.sort === currentSort.column) {
            th.innerHTML += currentSort.direction === 'desc' ? ' &darr;' : ' &uarr;';
        }
    });
}

/**
 * Renders the grid of player cards
 */
function renderPlayerCards() {
    let gridHTML = ''; // Build HTML in a string
    playerData.forEach(player => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player.numeric_dkp_percent;

        const isChecked = selectedPlayers.includes(govId);

        gridHTML += `
            <div class="player-card" data-id="${govId}" data-name="${govName.toLowerCase()}">
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
            </div>
        `;
    });
    playerGrid.innerHTML = gridHTML; // Insert all at once
    
    // Add event listeners to new checkboxes
    playerGrid.querySelectorAll('.compare-checkbox').forEach(box => {
        box.addEventListener('change', handleCheck);
    });
}

/**
 * Renders the grid of "Fighter" cards
 */
function renderFighterCards() {
    if (fighterData.length === 0) {
        fighterGrid.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">No fighters found. (Min 20M Power & >0 KvK KP)</p>';
        return;
    }

    let gridHTML = ''; // Build HTML in a string
    fighterData.forEach((player, index) => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player.numeric_dkp_percent;
        const power = player.numeric_power;

        const isChecked = selectedPlayers.includes(govId);

        gridHTML += `
            <div class="player-card" data-id="${govId}" data-name="${govName.toLowerCase()}">
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
            </div>
        `;
    });
    fighterGrid.innerHTML = gridHTML; // Insert all at once

    // Add event listeners to new checkboxes
    fighterGrid.querySelectorAll('.compare-checkbox').forEach(box => {
        box.addEventListener('change', handleCheck);
    });
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
        .domain(
