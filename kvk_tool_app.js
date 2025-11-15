// --- App State ---
let allPlayerData = []; // Raw data from the sheet
let calculatedPlayerData = []; // Processed data after calculations
let fighterData = [];
let selectedPlayers = []; // Array of Governor IDs
let currentSort = { column: 'numeric_dkp_percent', direction: 'desc' };

// --- DKP Settings ---
let dkpSettings = {
    t4Mult: 10,
    t5Mult: 20,
    deadsMult: 50,
    targetPercent: 300
};

// --- Google Sheet URL ---
// THIS IS NOW POINTING TO YOUR "FORMULA" SHEET
const sheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSLu0NZqFyPM9SuOG3g8E6PawHhKAo_C7uqrg6OYpn3XqyFk12zwvGZf-6tho2zrMG8fQN_KAaXLfLK/pub?gid=257458671&single=true&output=csv';

// --- DOM Element Refs ---
const loadStatus = document.getElementById('load-status');
const forceRefreshBtn = document.getElementById('force-refresh');

const tabs = {
    snapshot: { btn: document.getElementById('btn-snapshot'), content: document.getElementById('content-snapshot') },
    playerCards: { btn: document.getElementById('btn-player-cards'), content: document.getElementById('content-player-cards') },
    fighters: { btn: document.getElementById('btn-fighters'), content: document.getElementById('content-fighters') },
    compare: { btn: document.getElementById('btn-compare'), content: document.getElementById('content-compare') },
    chart: { btn: document.getElementById('btn-chart'), content: document.getElementById('content-chart') },
    settings: { btn: document.getElementById('btn-settings'), content: document.getElementById('content-settings') }
};

const searchBars = {
    snapshot: document.getElementById('search-bar-snapshot'),
    playerCards: document.getElementById('search-bar-player-cards'),
    fighters: document.getElementById('search-bar-fighters')
};

// DKP Settings Inputs
const settingsInputs = {
    t4Mult: document.getElementById('setting-t4-mult'),
    t5Mult: document.getElementById('setting-t5-mult'),
    deadsMult: document.getElementById('setting-deads-mult'),
    targetPercent: document.getElementById('setting-target-percent')
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

function normalize(val, min, max) {
    if (max === min || isNaN(val) || !isFinite(val)) return 0;
    return (val - min) / (max - min);
}

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
    // We now know the headers are A-M ("Before") and N-W ("After")
    // But the CSV export gives us ALL columns, A, B, C... AP
    const headers = lines.shift().split(',').map(h => h.trim().replace(/"/g, ''));
    
    const rawData = lines.map(line => {
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        let player = {};
        headers.forEach((header, index) => {
            player[header] = (values[index] || '').trim().replace(/"/g, '');
        });
        return player;
    });
    
    // Store raw data and process it
    allPlayerData = rawData;
    calculateAllPlayerData();
}

/**
 * NEW: This function calculates all DKP stats based on settings
 */
function calculateAllPlayerData() {
    calculatedPlayerData = allPlayerData.map(p => {
        // --- Calculate Stats from Before/After ---
        // We use the formulas you provided!
        const startPower = cleanNumber(p['Starting Power']); // Col C
        const startTroopPower = cleanNumber(p['Troop Power']); // Col D
        const startT1 = cleanNumber(p['T1 Kills']); // Col G
        const startT2 = cleanNumber(p['T2 Kills']); // Col H
        const startT3 = cleanNumber(p['T3 Kills']); // Col I
        const startT4 = cleanNumber(p['T4 Kills']); // Col J
        const startT5 = cleanNumber(p['T5 Kills']); // Col K
        const startDeads = cleanNumber(p['Deads']); // Col E
        
        const endPower = cleanNumber(p['Power_end']); // Col O
        const endTroopPower = cleanNumber(p['Troop Power_end']); // Col P
        const endT1 = cleanNumber(p['T1 Kills_end']); // Col S
        const endT2 = cleanNumber(p['T2 Kills_end']); // Col T
        const endT3 = cleanNumber(p['T3 Kills_end']); // Col U
        const endT4 = cleanNumber(p['T4 Kills_end']); // Col V
        const endT5 = cleanNumber(p['T5 Kills_end']); // Col W
        const endDeads = cleanNumber(p['Deads_end']); // Col Q
        
        // These are the KvK-only stats
        const numeric_t1 = endT1 - startT1;
        const numeric_t2 = endT2 - startT2;
        const numeric_t3 = endT3 - startT3;
        const numeric_t4 = endT4 - startT4;
        const numeric_t5 = endT5 - startT5;
        const numeric_deads = endDeads - startDeads;
        const numeric_power_plus = endPower - startPower;
        const numeric_troop_power_plus = endTroopPower - startTroopPower;
        const numeric_t4t5 = numeric_t4 + numeric_t5;

        // --- Calculate DKP Stats from Settings ---
        const { t4Mult, t5Mult, deadsMult, targetPercent } = dkpSettings;
        
        const numeric_kvk_kp = (numeric_t4 * t4Mult) + (numeric_t5 * t5Mult);
        
        // Note: We ignore the AP (bonus) column for now, but could add it later
        const numeric_kvk_dkp = (numeric_deads * deadsMult) + numeric_kvk_kp;
        
        const numeric_target_dkp = startPower * (targetPercent / 100);
        
        let numeric_dkp_percent = 0;
        if (numeric_target_dkp > 0) {
            numeric_dkp_percent = (numeric_kvk_dkp / numeric_target_dkp) * 100;
        }
        
        // Return a new object matching the structure our tabs expect
        return {
            'Governor ID': p['Governor ID'],
            'Governor Name': p['Governor Name'],
            'Starting Power': startPower,
            'Power +/-': numeric_power_plus,
            'Troop Power': numeric_troop_power_plus,
            'T1 Kills': numeric_t1,
            'T2 Kills': numeric_t2,
            'T3 Kills': numeric_t3,
            'T4 Kills': numeric_t4,
            'T5 Kills': numeric_t5,
            'T4+T5 Combined': numeric_t4t5,
            'Kvk only Deads': numeric_deads,
            'kvk only KP': numeric_kvk_kp,
            'KVK DKP': numeric_kvk_dkp,
            'Target DKP': numeric_target_dkp,
            'DKP % Complete': numeric_dkp_percent.toFixed(0), // Use 0 decimals for %
            
            // Keep pre-calculated numerics for sorting
            numeric_kvk_kp: numeric_kvk_kp,
            numeric_deads: numeric_deads,
            numeric_dkp_percent: numeric_dkp_percent,
            numeric_power: startPower,
            numeric_t4t5: numeric_t4t5
        };
    });

    // Re-process fighter data
    processFighterData();
}

/**
 * This re-calculates all data and updates all tabs
 */
function recalculateAndRenderAll() {
    // 1. Get new settings from inputs
    dkpSettings.t4Mult = parseFloat(settingsInputs.t4Mult.value) || 0;
    dkpSettings.t5Mult = parseFloat(settingsInputs.t5Mult.value) || 0;
    dkpSettings.deadsMult = parseFloat(settingsInputs.deadsMult.value) || 0;
    dkpSettings.targetPercent = parseFloat(settingsInputs.targetPercent.value) || 0;
    
    // 2. Re-run all calculations
    calculateAllPlayerData();
    
    // 3. Re-render all tabs with new data
    renderAllTabs();
    
    // 4. Re-render the chart if it's the active one
    if (tabs.chart.content.classList.contains('active')) {
        renderScatterChart();
    }
}


function processFighterData() {
    fighterData = calculatedPlayerData
        .filter(p => p.numeric_kvk_kp > 0 && p.numeric_power >= 20000000)
        .sort((a, b) => b.numeric_dkp_percent - a.numeric_dkp_percent);
}

// --- Tab Rendering Functions ---

function renderAllTabs() {
    renderSnapshotTable();
    renderPlayerCards();
    renderFighterCards();
    renderComparison(); // Also re-render comparison table
}

function renderSnapshotTable() {
    // Get stats for heatmap
    const kps = calculatedPlayerData.map(p => p.numeric_kvk_kp);
    const deads = calculatedPlayerData.map(p => p.numeric_deads);
    const dkps = calculatedPlayerData.map(p => p.numeric_dkp_percent);
    const t4t5s = calculatedPlayerData.map(p => p.numeric_t4t5);

    const max = {
        kp: Math.max(...kps), kp_min: Math.min(...kps),
        deads: Math.max(...deads), deads_min: Math.min(...deads),
        dkp: Math.max(...dkps), dkp_min: Math.min(...dkps),
        t4t5: Math.max(...t4t5s), t4t5_min: Math.min(...t4t5s),
    };

    sortData(calculatedPlayerData);
    
    snapshotTableWrapper.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'snapshot-table';
    
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

    const tbody = document.createElement('tbody');
    calculatedPlayerData.forEach(player => {
        const tr = document.createElement('tr');
        const govId = player['Governor ID'];
        tr.dataset.id = govId;
        tr.dataset.name = player['Governor Name'].toLowerCase();

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

        const tdName = document.createElement('td');
        tdName.textContent = player['Governor Name'];
        tdName.title = govId;
        tr.appendChild(tdName);

        const tdKP = document.createElement('td');
        tdKP.textContent = formatShort(player.numeric_kvk_kp);
        tdKP.dataset.heatmapColor = 'green';
        tdKP.style = `--heatmap-opacity: ${normalize(player.numeric_kvk_kp, max.kp_min, max.kp)}`;
        tr.appendChild(tdKP);

        const tdT4T5 = document.createElement('td');
        tdT4T5.textContent = formatShort(player.numeric_t4t5);
        tdT4T5.dataset.heatmapColor = 'green';
        tdT4T5.style = `--heatmap-opacity: ${normalize(player.numeric_t4t5, max.t4t5_min, max.t4t5)}`;
        tr.appendChild(tdT4T5);

        const tdDeads = document.createElement('td');
        tdDeads.textContent = formatNumber(player.numeric_deads);
        tdDeads.dataset.heatmapColor = 'red';
        tdDeads.style = `--heatmap-opacity: ${normalize(player.numeric_deads, max.deads_min, max.deads)}`;
        tr.appendChild(tdDeads);

        const tdDKP = document.createElement('td');
        tdDKP.textContent = `${player['DKP % Complete']}%`; // Use formatted string
        tdDKP.dataset.heatmapColor = 'blue';
        tdDKP.style = `--heatmap-opacity: ${normalize(player.numeric_dkp_percent, max.dkp_min, max.dkp)}`;
        tr.appendChild(tdDKP);

        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    snapshotTableWrapper.appendChild(table);
}

function renderPlayerCards() {
    playerGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    calculatedPlayerData.forEach(player => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player['DKP % Complete']; // Use formatted string
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

    playerGrid.appendChild(fragment);
}

function renderFighterCards() {
    fighterGrid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    if (fighterData.length === 0) {
        fighterGrid.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">No fighters found. (Min 20M Power & >0 KvK KP)</p>';
        return;
    }

    fighterData.forEach((player, index) => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player['DKP % Complete']; // Use formatted string
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

    fighterGrid.appendChild(fragment);
}

// --- Chart Functions (Updated) ---

function getQuadrant(player, averages) {
    const kills = player.numeric_t4t5;
    const deads = player.numeric_deads;

    if (kills >= averages.kills && deads <= averages.deads) {
        return { name: 'Hero', color: '#3b82f6' }; // Blue
    }
    if (kills >= averages.kills && deads > averages.deads) {
        return { name: 'Warrior', color: '#22c55e' }; // Green
    }
    if (kills < averages.kills && deads > averages.deads) {
        return { name: 'Feeder', color: '#ef4444' }; // Red
    }
    return { name: 'Slacker', color: '#6b7280' }; // Gray
}

function renderScatterChart() {
    const canvas = d3.select("#scatter-chart").node();
    const container = d3.select(".chart-container").node();

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    
    canvas.width = width * 2; 
    canvas.height = height * 2;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(2, 2);

    const chartData = calculatedPlayerData.filter(p => p.numeric_t4t5 > 0 || p.numeric_deads > 0);
    if (chartData.length === 0) return;

    const margin = { top: 30, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Calculate Averages
    const totalKills = d3.sum(chartData, d => d.numeric_t4t5);
    const totalDeads = d3.sum(chartData, d => d.numeric_deads);
    const avgKills = totalKills / chartData.length;
    const avgDeads = totalDeads / chartData.length;
    const averages = { kills: avgKills, deads: avgDeads };

    // Create Plot Data
    const plotData = chartData.map(d => {
        const quadrant = getQuadrant(d, averages);
        return {
            x: d.numeric_t4t5,
            y: d.numeric_deads,
            name: d['Governor Name'],
            dkpPercent: d['DKP % Complete'], // Use formatted string
            quadrant: quadrant.name,
            color: quadrant.color
        };
    });

    // Scales (95th percentile)
    const xMax = d3.quantile(plotData.map(d => d.x).sort(d3.ascending), 0.95) * 1.05 || 1;
    const yMax = d3.quantile(plotData.map(d => d.y).sort(d3.ascending), 0.95) * 1.05 || 1;

    const x = d3.scaleLinear().domain([0, xMax]).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]);
    
    const radius = 5;

    // --- Draw ---
    ctx.save();
    ctx.translate(margin.left, margin.top);
    
    // Quadrant Lines
    const avgX = x(avgKills);
    const avgY = y(avgDeads);
    
    ctx.beginPath();
    ctx.strokeStyle = '#aaa';
    ctx.setLineDash([5, 5]);
    ctx.moveTo(avgX, 0); ctx.lineTo(avgX, innerHeight);
    ctx.moveTo(0, avgY); ctx.lineTo(innerWidth, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Quadrant Labels
    ctx.font = "bold 14px Inter";
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#3b82f6"; ctx.fillText("Heroes", avgX + 10, avgY + 20);
    ctx.fillStyle = "#22c55e"; ctx.fillText("Warriors", avgX + 10, avgY - 10);
    ctx.fillStyle = "#ef4444"; ctx.fillText("Feeders", avgX - 10, avgY - 10);
    ctx.textAlign = "end";
    ctx.fillStyle = "#6b7280"; ctx.fillText("Slackers", avgX - 10, avgY + 20);
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "start";

    // Draw Points
    plotData.forEach(d => {
        ctx.beginPath();
        const plotX = x(Math.min(d.x, xMax));
        const plotY = y(Math.min(d.y, yMax));
        ctx.arc(plotX, plotY, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = d.color;
        ctx.globalAlpha = 0.7;
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    
    // Draw Axes
    const xAxis = d3.axisBottom(x).ticks(5).tickFormat(d3.format("~s"));
    const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s"));
    drawAxis(ctx, xAxis, 0, innerHeight, innerWidth, innerHeight);
    drawAxis(ctx, yAxis, 0, 0, 0, innerHeight);

    // Axis Labels
    ctx.fillStyle = "#000";
    ctx.font = "14px Inter";
    ctx.textAlign = "center";
    ctx.fillText("T4 + T5 Kills", innerWidth / 2, innerHeight + margin.bottom - 10);
    
    ctx.save();
    ctx.translate(-margin.left + 20, innerHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Kvk Deads", 0, 0);
    ctx.restore();
    
    ctx.restore();

    setupChartInteractions(plotData, x, y, canvas, margin);
    canvas._chartRendered = true;
}

function drawAxis(ctx, axis, x, y, width, height) {
    const tempContainer = d3.select(document.createElement("g"));
    tempContainer.call(axis);
    
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#aaa";
    ctx.fillStyle = "#555";
    ctx.font = "12px Inter";

    tempContainer.selectAll("line").each(function() {
        const line = d3.select(this);
        ctx.beginPath();
        ctx.moveTo(parseFloat(line.attr("x1")), parseFloat(line.attr("y1")));
        ctx.lineTo(parseFloat(line.attr("x2")), parseFloat(line.attr("y2")));
        ctx.stroke();
    });

    tempContainer.selectAll("text").each(function() {
        const text = d3.select(this);
        ctx.textAlign = text.attr("text-anchor") === "middle" ? "center" : text.attr("text-anchor");
        ctx.textBaseline = "middle";
        ctx.fillText(text.text(), parseFloat(text.attr("x")), parseFloat(text.attr("y")));
    });
    
    ctx.restore();
}

function setupChartInteractions(plotData, xScale, yScale, canvas, margin) {
    const tooltip = document.getElementById('chart-tooltip');
    
    const quadtree = d3.quadtree()
        .x(d => xScale(d.x))
        .y(d => yScale(d.y))
        .addAll(plotData);

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);

        const [target] = quadtree.find(
            (x * 2) - margin.left, (y * 2) - margin.top, 10 * 2
        );

        if (target) {
            canvas.style.cursor = 'pointer';
            tooltip.innerHTML = `
                <strong>${target.name}</strong><br>
                <span style="color: ${target.color}; font-weight: 700;">(${target.quadrant})</span><br>
                T4/T5 Kills: ${formatShort(target.x)}<br>
                Deads: ${formatNumber(target.y)}<br>
                DKP %: ${target.dkpPercent}%
            `;
            tooltip.classList.add('show');
            
            let tooltipX = x + 10;
            let tooltipY = y + 10;
            
            if (tooltipX + tooltip.offsetWidth > rect.width) {
                tooltipX = x - tooltip.offsetWidth - 10;
            }
            if (tooltipY + tooltip.offsetHeight > rect.height) {
                tooltipY = y - tooltip.offsetHeight - 10;
            }

            tooltip.style.left = `${tooltipX}px`;
            tooltip.style.top = `${tooltipY}px`;
            
        } else {
            canvas.style.cursor = 'default';
            tooltip.classList.remove('show');
        }
    });

    canvas.addEventListener('mouseleave', () => {
        canvas.style.cursor = 'default';
        tooltip.classList.remove('show');
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
    renderSnapshotTable();
}

function sortData(data) {
    data.sort((a, b) => {
        let valA, valB;
        
        if (currentSort.column === 'Governor Name') {
            valA = a[currentSort.column].toLowerCase();
            valB = b[currentSort.column].toLowerCase();
        } else {
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
        if (searchBars[key]) {
            searchBars[key].addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                filterViews(query, key);
            });
        }
    });
}

function filterViews(query, sourceTab) {
    const rows = snapshotTableWrapper.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const name = row.dataset.name;
        const id = row.dataset.id;
        row.style.display = (name.includes(query) || id.includes(query)) ? '' : 'none';
    });
    
    const cards = playerGrid.querySelectorAll('.player-card');
    cards.forEach(card => {
        const name = card.dataset.name;
        const id = card.dataset.id;
        card.style.display = (name.includes(query) || id.includes(query)) ? 'block' : 'none';
    });

    const fighterCards = fighterGrid.querySelectorAll('.player-card');
    fighterCards.forEach(card => {
        const name = card.dataset.name;
        const id = card.dataset.id;
        card.style.display = (name.includes(query) || id.includes(query)) ? 'block' : 'none';
    });

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
            e.target.checked = false;
        }
    } else {
        selectedPlayers = selectedPlayers.filter(pId => pId !== id);
    }
    updateCompareState();
}

function updateCompareState() {
    compareBtn.textContent = `Compare (${selectedPlayers.length})`;

    const allCheckboxes = document.querySelectorAll('.compare-checkbox');
    allCheckboxes.forEach(box => {
        box.checked = selectedPlayers.includes(box.dataset.id);
    });

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

    const playersToCompare = calculatedPlayerData.filter(p => selectedPlayers.includes(p['Governor ID']));
    
    const metrics = [
        ['Starting Power', true],
        ['Power +/-', true],
        ['Troop Power', true],
        ['T1 Kills', true], ['T2 Kills', true], ['T3 Kills', true],
        ['T4 Kills', true], ['T5 Kills', true],
        ['T4+T5 Combined', true],
        ['Kvk only Deads', false],
        ['kvk only KP', true],
        ['KVK DKP', true],
        ['Target DKP', true],
        ['DKP % Complete', true]
    ];

    compareWrapper.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'compare-table';
    
    const thead = document.createElement('thead');
    let headerRow = '<tr><th>Metric</th>';
    playersToCompare.forEach(p => {
        headerRow += `<th>${p['Governor Name']}</th>`;
    });
    for(let i = 0; i < 3 - playersToCompare.length; i++) headerRow += '<th>-</th>';
    headerRow += '</tr>';
    thead.innerHTML = headerRow;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    metrics.forEach(([metric, higherIsBetter]) => {
        const tr = document.createElement('tr');
        
        const tdMetric = document.createElement('td');
        tdMetric.textContent = metric;
        tr.appendChild(tdMetric);

        let values = [];
        playersToCompare.forEach(p => {
            values.push({
                val: p[metric], // Use pre-calculated number
                formatted: (metric === 'DKP % Complete') ? `${p[metric]}%` : formatNumber(p[metric])
            });
        });

        const numericVals = values.map(v => v.val);
        const targetVal = higherIsBetter ? Math.max(...numericVals) : Math.min(...numericVals);
        const worstVal = higherIsBetter ? Math.min(...numericVals) : Math.max(...numericVals);

        values.forEach(v => {
            const td = document.createElement('td');
            td.textContent = v.formatted || '0';
            
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
            parseCSV(cachedData); // This now populates allPlayerData and calls calculateAllPlayerData
            renderAllTabs();
            
            Object.values(searchBars).forEach(bar => bar.disabled = false);
            forceRefreshBtn.disabled = false;
        } catch (e) {
            console.error("Error parsing cached data:", e);
            localStorage.clear();
            fetchData(true);
            return;
        }
        
        checkRemoteData(cachedData);
    } else {
        loadStatus.textContent = "Fetching live data from Google Sheets...";
        try {
            const response = await fetch(sheetUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const csvData = await response.text();
            
            const newTimestamp = new Date().toISOString();
            localStorage.setItem('kvkData', csvData);
            localStorage.setItem('kvkDataTimestamp', newTimestamp);

            parseCSV(csvData);
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
        if (!response.ok) return;
        const csvData = await response.text();

        if (cachedData === csvData) {
            loadStatus.textContent = `Data is already up to date. (Last check: ${new Date().toLocaleTimeString()})`;
        } else {
            const newTimestamp = new Date().toISOString();
            localStorage.setItem('kvkData', csvData);
            localStorage.setItem('kvkDataTimestamp', newTimestamp);

            parseCSV(csvData);
            renderAllTabs();
            
            loadStatus.textContent = `Data updated! Successfully loaded ${allPlayerData.length} players. (Updated: ${new Date(newTimestamp).toLocaleString()})`;
        }
    } catch (err) {
        console.error("Background fetch failed:", err);
        loadStatus.textContent = `Cached data loaded. Background update failed. (Last check: ${new Date().toLocaleTimeString()})`;
    }
}

// --- Resize Handling ---
function handleResize() {
    if (tabs.chart.content.classList.contains('active')) {
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
    activateTab('snapshot');
    setupSearch();
    
    // Add listeners to settings inputs
    Object.values(settingsInputs).forEach(input => {
        input.addEventListener('change', recalculateAndRenderAll);
    });
    
    fetchData();
    window.addEventListener('resize', debounce(handleResize, 250));
});
