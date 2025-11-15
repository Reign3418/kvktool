/**
 * UNITY - KvK DKP Calculator
 * This is Part 1 of 3 of the main application script.
 */

// --- App State ---
let allPlayerData = []; // Holds the calculated data for the currently loaded profile
let selectedPlayers = []; // Array of Governor IDs for comparison
let currentProfileName = null; // The name of the currently loaded profile
let currentSort = { column: 'dkpPercent', direction: 'desc' }; // Default sort
let currentChart = null; // Holds the D3 chart instance

// --- DOM Element Refs ---
const dom = {
    loadStatus: document.getElementById('load-status'),
    
    // Manage Data Tab
    profileNameInput: document.getElementById('profile-name'),
    startScanFile: document.getElementById('start-scan-file'),
    endScanFile: document.getElementById('end-scan-file'),
    runDKPBtn: document.getElementById('run-dkp-btn'),
    profileSelect: document.getElementById('profile-select'),
    loadProfileBtn: document.getElementById('load-profile-btn'),
    deleteProfileBtn: document.getElementById('delete-profile-btn'),

    // Settings Tab
    settings: {
        t4mult: document.getElementById('setting-t4-mult'),
        t5mult: document.getElementById('setting-t5-mult'),
        deadsMult: document.getElementById('setting-deads-mult'),
        targetPercent: document.getElementById('setting-target-percent')
    },

    // Output Tabs
    tabs: {
        manageData: { btn: document.getElementById('btn-manage-data'), content: document.getElementById('content-manage-data') },
        settings: { btn: document.getElementById('btn-settings'), content: document.getElementById('content-settings') },
        snapshot: { btn: document.getElementById('btn-snapshot'), content: document.getElementById('content-snapshot') },
        playerCards: { btn: document.getElementById('btn-player-cards'), content: document.getElementById('content-player-cards') },
        fighters: { btn: document.getElementById('btn-fighters'), content: document.getElementById('content-fighters') },
        compare: { btn: document.getElementById('btn-compare'), content: document.getElementById('content-compare') },
        chart: { btn: document.getElementById('btn-chart'), content: document.getElementById('content-chart') },
        kdCompare: { btn: document.getElementById('btn-kd-compare'), content: document.getElementById('content-kd-compare') }
    },

    // Search Bars
    searchBars: {
        snapshot: document.getElementById('search-bar-snapshot'),
        playerCards: document.getElementById('search-bar-player-cards'),
        fighters: document.getElementById('search-bar-fighters')
    },

    // Content Wrappers
    playerGrid: document.getElementById('player-grid'),
    fighterGrid: document.getElementById('fighter-grid'),
    snapshotTableWrapper: document.getElementById('snapshot-table-wrapper'),
    
    // Compare Tab
    compareBtn: document.getElementById('btn-compare'),
    clearBtn: document.getElementById('clear-selection-btn'),
    compareWrapper: document.getElementById('compare-table-wrapper'),

    // Chart Tab
    chartContainer: document.querySelector('.chart-container'),
    chartCanvas: document.getElementById('scatter-chart'),
    chartTooltip: document.getElementById('chart-tooltip'),

    // Kd Compare Tab
    kdProfileSelectA: document.getElementById('kd-profile-select-a'),
    kdProfileSelectB: document.getElementById('kd-profile-select-b'),
    runKdCompareBtn: document.getElementById('run-kd-compare-btn'),
    kdCompareResult: document.getElementById('kd-compare-result')
};

// --- DATA MAPPING (From our calibration) ---
// This tells the app what to look for in the raw CSV files.
const DATA_MAP = {
    id: "Governor ID",
    name: "Governor Name",
    power: "Power",
    troopPower: "Troop Power",
    t1kills: "T1 Kills",
    t2kills: "T2 Kills",
    t3kills: "T3 Kills",
    t4kills: "T4 Kills",
    t5kills: "T5 Kills",
    deads: "Deads",
    kp: "Kill Points" // This is the raw KP from the scan
};


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
    if (max === min) return 1; // Avoid division by zero
    return (val - min) / (max - min);
}

// Debounce function to limit how often a function can run
function debounce(func, delay = 250) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// --- CSV Parsing ---
function parseCSV(data) {
    try {
        const lines = data.trim().split('\n');
        // Handle potential BOM (Byte Order Mark) at the start of the file
        if (lines[0].charCodeAt(0) === 0xFEFF) {
            lines[0] = lines[0].substring(1);
        }
        
        const headers = lines.shift().split(',').map(h => h.trim().replace(/"/g, ''));
        
        // --- Data Mapping Check ---
        // Verify that all required headers from DATA_MAP exist in the CSV
        const csvHeaders = new Set(headers);
        let missingHeaders = [];
        Object.values(DATA_MAP).forEach(headerName => {
            if (!csvHeaders.has(headerName)) {
                missingHeaders.push(headerName);
            }
        });

        if (missingHeaders.length > 0) {
            throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
        }
        // --- End Check ---

        return lines.map(line => {
            // Regex to split on commas not inside quotes
            const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            let row = {};
            headers.forEach((header, index) => {
                row[header] = (values[index] || '').trim().replace(/"/g, '');
            });
            return row;
        });
    } catch (e) {
        console.error("Failed to parse CSV", e);
        setStatus(`Error: ${e.message}. Check file format.`, true);
        return null;
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}
/**
 * UNITY - KvK DKP Calculator
 * This is Part 2 of 3 of the main application script.
 * This part contains the DKP calculation and rendering functions.
 */

// --- DKP Calculation Engine ---
function runDKPCalculation(startScanData, endScanData, settings) {
    setStatus("Calculating DKP...");
    
    // 1. Create a "lookup map" from the start scan for fast access
    const startScanMap = new Map();
    for (const player of startScanData) {
        const id = player[DATA_MAP.id];
        if (id) {
            startScanMap.set(id, player);
        }
    }

    const calculatedData = [];
    
    // 2. Loop through the *end* scan (as it's the most current roster)
    for (const endPlayer of endScanData) {
        const id = endPlayer[DATA_MAP.id];
        const startPlayer = startScanMap.get(id);

        // If player isn't in start scan, treat start data as 0
        const getStartStat = (key) => startPlayer ? cleanNumber(startPlayer[DATA_MAP[key]]) : 0;

        // 3. Get "Before" and "After" stats
        const startStats = {
            power: getStartStat('power'),
            troopPower: getStartStat('troopPower'),
            t1: getStartStat('t1kills'),
            t2: getStartStat('t2kills'),
            t3: getStartStat('t3kills'),
            t4: getStartStat('t4kills'),
            t5: getStartStat('t5kills'),
            deads: getStartStat('deads'),
            kp: getStartStat('kp')
        };
        
        const endStats = {
            power: cleanNumber(endPlayer[DATA_MAP.power]),
            troopPower: cleanNumber(endPlayer[DATA_MAP.troopPower]),
            t1: cleanNumber(endPlayer[DATA_MAP.t1kills]),
            t2: cleanNumber(endPlayer[DATA_MAP.t2kills]),
            t3: cleanNumber(endPlayer[DATA_MAP.t3kills]),
            t4: cleanNumber(endPlayer[DATA_MAP.t4kills]),
            t5: cleanNumber(endPlayer[DATA_MAP.t5kills]),
            deads: cleanNumber(endPlayer[DATA_MAP.deads]),
            kp: cleanNumber(endPlayer[DATA_MAP.kp])
        };

        // 4. Calculate the "KvK Only" diffs
        const kvkStats = {
            id: id,
            name: endPlayer[DATA_MAP.name] || 'Unknown',
            startPower: startStats.power,
            powerChange: endStats.power - startStats.power,
            troopPowerChange: endStats.troopPower - startStats.troopPower,
            t1kills: endStats.t1 - startStats.t1,
            t2kills: endStats.t2 - startStats.t2,
            t3kills: endStats.t3 - startStats.t3,
            t4kills: endStats.t4 - startStats.t4,
            t5kills: endStats.t5 - startStats.t5,
            deads: endStats.deads - startStats.deads,
            rawKP: endStats.kp - startStats.kp // Raw KP from scanner
        };

        // 5. Apply our DKP formulas
        kvkStats.t4t5Kills = kvkStats.t4kills + kvkStats.t5kills;
        kvkStats.calcKP = (kvkStats.t4kills * settings.t4mult) + (kvkStats.t5kills * settings.t5mult);
        kvkStats.dkp = (kvkStats.deads * settings.deadsMult) + kvkStats.calcKP;
        
        // Target DKP
        const targetPercent = settings.targetPercent / 100;
        kvkStats.targetDKP = kvkStats.startPower * targetPercent;
        
        // DKP %
        if (kvkStats.targetDKP > 0) {
            kvkStats.dkpPercent = parseFloat(((kvkStats.dkp / kvkStats.targetDKP) * 100).toFixed(2));
        } else {
            kvkStats.dkpPercent = 0;
        }

        calculatedData.push(kvkStats);
    }

    setStatus(`Successfully calculated DKP for ${calculatedData.length} players.`);
    return calculatedData;
}


// --- Tab Rendering Functions ---

function renderAllTabs(data) {
    const fighterData = data.filter(p => p.calcKP > 0 && p.startPower >= 20000000)
                           .sort((a, b) => b.dkpPercent - a.dkpPercent);
    
    renderSnapshotTable(data);
    renderPlayerCards(data);
    renderFighterCards(fighterData);
    renderComparison(); // Re-render comparison in case selected players are in new data
    
    // Clear the chart so it redraws on next click
    const canvas = dom.chartCanvas;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas._chartRendered = false; 

    // Update search bars
    Object.values(dom.searchBars).forEach(bar => bar.disabled = false);
    
    // Auto-navigate to the snapshot
    activateTab('snapshot');
}

function renderSnapshotTable(data) {
    // 1. Get stats for heatmap normalization
    const kps = data.map(p => p.calcKP);
    const deads = data.map(p => p.deads);
    const dkps = data.map(p => p.dkpPercent);
    const t4t5s = data.map(p => p.t4t5Kills);

    const max = {
        kp: Math.max(...kps), kp_min: Math.min(...kps),
        deads: Math.max(...deads), deads_min: Math.min(...deads),
        dkp: Math.max(...dkps), dkp_min: Math.min(...dkps),
        t4t5: Math.max(...t4t5s), t4t5_min: Math.min(...t4t5s),
    };

    // 2. Sort data
    sortData(data);
    
    // 3. Generate Table HTML
    let tableHTML = `
        <table class="snapshot-table">
            <thead>
                <tr>
                    <th class="compare-checkbox-cell"></th>
                    <th data-sort="name">Name</th>
                    <th data-sort="calcKP">KvK KP</th>
                    <th data-sort="t4t5Kills">T4/T5 Kills</th>
                    <th data-sort="deads">Deads</th>
                    <th data-sort="dkpPercent">DKP %</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Use a string builder array for performance
    const rows = data.map(player => {
        const govId = player.id;
        const isChecked = selectedPlayers.includes(govId);

        const kpOpacity = normalize(player.calcKP, max.kp_min, max.kp);
        const t4t5Opacity = normalize(player.t4t5Kills, max.t4t5_min, max.t4t5);
        const deadsOpacity = normalize(player.deads, max.deads_min, max.deads);
        const dkpOpacity = normalize(player.dkpPercent, max.dkp_min, max.dkp);

        // This is the fix for the "Object object" bug. We are building the row with template literals.
        return `
            <tr data-id="${govId}" data-name="${player.name.toLowerCase()}">
                <td class="compare-checkbox-cell">
                    <input type="checkbox" class="compare-checkbox" data-id="${govId}" ${isChecked ? 'checked' : ''} title="Select to Compare">
                </td>
                <td title="${govId}">${player.name}</td>
                <td data-heatmap-color="green" style="--heatmap-opacity: ${kpOpacity};">${formatShort(player.calcKP)}</td>
                <td data-heatmap-color="green" style="--heatmap-opacity: ${t4t5Opacity};">${formatShort(player.t4t5Kills)}</td>
                <td data-heatmap-color="red" style="--heatmap-opacity: ${deadsOpacity};">${formatNumber(player.deads)}</td>
                <td data-heatmap-color="blue" style="--heatmap-opacity: ${dkpOpacity};">${player.dkpPercent}%</td>
            </tr>
        `;
    });

    tableHTML += rows.join('') + '</tbody></table>';
    dom.snapshotTableWrapper.innerHTML = tableHTML;
    
    // 4. Add event listeners
    dom.snapshotTableWrapper.querySelectorAll('.compare-checkbox').forEach(box => {
        box.addEventListener('change', handleCheck);
    });
    dom.snapshotTableWrapper.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', handleSort);
        if (th.dataset.sort === currentSort.column) {
            th.innerHTML += currentSort.direction === 'desc' ? ' &darr;' : ' &uarr;';
        }
    });
}

function renderPlayerCards(data) {
    // Use a string builder array for performance
    const cards = data.map(player => {
        const govId = player.id;
        const govName = player.name;
        const kvkKP = player.calcKP;
        const dkpPercent = player.dkpPercent;
        const isChecked = selectedPlayers.includes(govId);

        return `
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
    
    dom.playerGrid.innerHTML = cards.join('');
    
    // Add event listeners
    dom.playerGrid.querySelectorAll('.compare-checkbox').forEach(box => {
        box.addEventListener('change', handleCheck);
    });
}
/**
 * UNITY - KvK DKP Calculator
 * This is Part 3 of 3 of the main application script.
 * This part contains the remaining render functions, event listeners, and app initialization.
 */

function renderFighterCards(data) {
    if (data.length === 0) {
        dom.fighterGrid.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">No fighters found. (Min 20M Power & >0 KvK KP)</p>';
        return;
    }

    const cards = data.map((player, index) => {
        const govId = player.id;
        const govName = player.name;
        const kvkKP = player.calcKP;
        const dkpPercent = player.dkpPercent;
        const power = player.startPower;
        const isChecked = selectedPlayers.includes(govId);

        return `
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

    dom.fighterGrid.innerHTML = cards.join('');

    // Add event listeners
    dom.fighterGrid.querySelectorAll('.compare-checkbox').forEach(box => {
        box.addEventListener('change', handleCheck);
    });
}

function renderScatterChart() {
    // FIX: Only render if the tab is visible and not already rendered
    if (dom.chartCanvas._chartRendered) return;

    const chartData = allPlayerData.filter(p => p.calcKP > 0 || p.deads > 0);
    if (chartData.length === 0) return;

    const containerRect = dom.chartContainer.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) {
        console.error("Chart container has no size. Cannot render.");
        return; // Don't render if container isn't visible
    }

    // Set canvas size based on container
    const canvas = dom.chartCanvas;
    canvas.width = containerRect.width * 2; // High-DPI
    canvas.height = containerRect.height * 2;
    canvas.style.width = `${containerRect.width}px`;
    canvas.style.height = `${containerRect.height}px`;
    
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2); // Scale context for High-DPI

    const margin = { top: 20, right: 20, bottom: 50, left: 60 };
    const innerWidth = containerRect.width - margin.left - margin.right;
    const innerHeight = containerRect.height - margin.top - margin.bottom;

    // --- Averages for Quadrant Lines ---
    const avgKills = d3.mean(chartData, d => d.t4t5Kills);
    const avgDeads = d3.mean(chartData, d => d.deads);

    // Data for chart
    const plotData = chartData.map(d => {
        let quadrant = '';
        if (d.t4t5Kills >= avgKills && d.deads < avgDeads) quadrant = 'hero';
        else if (d.t4t5Kills >= avgKills && d.deads >= avgDeads) quadrant = 'warrior';
        else if (d.t4t5Kills < avgKills && d.deads >= avgDeads) quadrant = 'feeder';
        else quadrant = 'slacker';

        return {
            x: d.t4t5Kills,
            y: d.deads,
            dkpPercent: d.dkpPercent,
            name: d.name,
            quadrant: quadrant
        };
    });

    // Color Scale based on quadrant
    const color = d3.scaleOrdinal()
        .domain(['hero', 'warrior', 'feeder', 'slacker'])
        .range(['#3b82f6', '#22c55e', '#ef4444', '#6b7280']); // blue, green, red, gray

    // --- FIX: Smart Scales (95th Percentile) ---
    // This stops outliers from bunching up the data
    const xMax = d3.quantile(plotData.map(d => d.x).sort(d3.ascending), 0.95) * 1.05 || d3.max(plotData, d => d.x);
    const yMax = d3.quantile(plotData.map(d => d.y).sort(d3.ascending), 0.95) * 1.05 || d3.max(plotData, d => d.y);

    const x = d3.scaleLinear()
        .domain([0, xMax])
        .range([0, innerWidth]);

    const y = d3.scaleLinear()
        .domain([0, yMax])
        .range([innerHeight, 0]);
    
    const radius = 5;

    // --- Draw Chart ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(margin.left, margin.top);
    
    // --- Draw Quadrant Lines & Labels ---
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Y-Axis (Average Kills)
    const avgXPos = x(avgKills);
    ctx.beginPath();
    ctx.moveTo(avgXPos, 0);
    ctx.lineTo(avgXPos, innerHeight);
    ctx.stroke();

    // X-Axis (Average Deads)
    const avgYPos = y(avgDeads);
    ctx.beginPath();
    ctx.moveTo(0, avgYPos);
    ctx.lineTo(innerWidth, avgYPos);
    ctx.stroke();
    
    ctx.setLineDash([]);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px Roboto';

    ctx.textAlign = 'right';
    ctx.fillText('Heroes', avgXPos - 5, avgYPos + 10);
    ctx.fillText('Warriors', avgXPos - 5, avgYPos - 5);
    ctx.textAlign = 'left';
    ctx.fillText('Slackers', avgXPos + 5, avgYPos + 10);
    ctx.fillText('Feeders', avgXPos + 5, avgYPos - 5);
    
    // Draw Points
    plotData.forEach(d => {
        ctx.beginPath();
        ctx.arc(x(d.x), y(d.y), radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = color(d.quadrant);
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
    ctx.font = "14px Roboto";
    ctx.textAlign = "center";
    ctx.fillText("T4 + T5 Kills", innerWidth / 2, innerHeight + margin.bottom - 10);
    
    ctx.save();
    ctx.translate(-margin.left + 20, innerHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("KvK Deads", 0, 0);
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
    ctx.font = "12px Roboto";

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
    const tooltip = dom.chartTooltip;
    
    const quadtree = d3.quadtree()
        .x(d => xScale(d.x))
        .y(d => yScale(d.y))
        .addAll(plotData);

    const onMouseMove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const [x, y] = d3.pointer(e, canvas); // D3 handles scaling
        
        const [target] = quadtree.find(x, y, 10);

        if (target) {
            canvas.style.cursor = 'pointer';
            tooltip.innerHTML = `
                <strong>${target.name}</strong><br>
                Kills: ${formatShort(target.x)}<br>
                Deads: ${formatNumber(target.y)}<br>
                DKP %: ${target.dkpPercent}%
            `;
            tooltip.classList.remove('hidden');
            tooltip.classList.add('show');
            
            let tooltipX = x + margin.left + 15;
            let tooltipY = y + margin.top + 15;
            
            tooltip.style.left = `${tooltipX}px`;
            tooltip.style.top = `${tooltipY}px`;
            
        } else {
            canvas.style.cursor = 'default';
            tooltip.classList.remove('show');
        }
    };
    
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', () => {
        canvas.style.cursor = 'default';
        tooltip.classList.remove('show');
    });
}

function handleResize() {
    const canvas = dom.chartCanvas;
    if (canvas._chartRendered) {
        canvas._chartRendered = false; // Mark for redraw
        renderScatterChart(); // Redraw
    }
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
    renderSnapshotTable(allPlayerData); // Re-render the table
}

function sortData(data) {
    data.sort((a, b) => {
        let valA, valB;
        if (currentSort.column === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
        } else {
            valA = a[currentSort.column];
            valB = b[currentSort.column];
        }
        if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
}


// --- Search ---
function setupSearch() {
    Object.keys(dom.searchBars).forEach(key => {
        if (dom.searchBars[key]) {
            dom.searchBars[key].addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                filterViews(query, key);
            });
        }
    });
}
function filterViews(query, sourceTab) {
    const allRows = dom.snapshotTableWrapper.querySelectorAll('tbody tr');
    allRows.forEach(row => {
        const name = row.dataset.name;
        const id = row.dataset.id;
        row.style.display = (name.includes(query) || id.includes(query)) ? '' : 'none';
    });
    
    const allCards = dom.playerGrid.querySelectorAll('.player-card');
    allCards.forEach(card => {
        const name = card.dataset.name;
        const id = card.dataset.id;
        card.style.display = (name.includes(query) || id.includes(query)) ? 'block' : 'none';
    });

    const allFighterCards = dom.fighterGrid.querySelectorAll('.player-card');
    allFighterCards.forEach(card => {
        const name = card.dataset.name;
        const id = card.dataset.id;
        card.style.display = (name.includes(query) || id.includes(query)) ? 'block' : 'none';
    });

    Object.keys(dom.searchBars).forEach(key => {
        if (key !== sourceTab && dom.searchBars[key]) {
            dom.searchBars[key].value = query;
        }
    });
}


// --- Player Comparison ---
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
    dom.compareBtn.textContent = `Compare (${selectedPlayers.length})`;
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

dom.clearBtn.addEventListener('click', () => {
    selectedPlayers = [];
    document.querySelectorAll('.compare-checkbox').forEach(box => {
        box.checked = false;
    });
    updateCompareState();
});

function renderComparison() {
    if (selectedPlayers.length === 0) {
        dom.compareWrapper.innerHTML = '<p class="text-gray-500 text-center p-8">Select players to compare.</p>';
        return;
    }

    const playersToCompare = allPlayerData.filter(p => selectedPlayers.includes(p.id));
    
    const metrics = [
        ['Start Power', 'startPower', true, 'short'],
        ['Power +/-', 'powerChange', true, 'number'],
        ['Troop Power +/-', 'troopPowerChange', true, 'number'],
        ['KvK Deads', 'deads', false, 'number'], // Lower is better
        ['KvK KP (Formula)', 'calcKP', true, 'short'],
        ['T4+T5 Kills', 't4t5Kills', true, 'short'],
        ['T1-T3 Kills', (p) => p.t1kills + p.t2kills + p.t3kills, true, 'short'],
        ['DKP % Complete', 'dkpPercent', true, 'percent'],
        ['Total DKP', 'dkp', true, 'short'],
        ['Target DK', 'targetDKP', true, 'short']
    ];

    let tableHTML = '<table class="compare-table"><thead><tr><th>Metric</th>';
    playersToCompare.forEach(p => {
        tableHTML += `<th>${p.name}</th>`;
    });
    for (let i = 0; i < 3 - playersToCompare.length; i++) tableHTML += '<th>-</th>';
    tableHTML += '</tr></thead><tbody>';

    metrics.forEach(([label, key, higherIsBetter, format]) => {
        let row = `<tr><td>${label}</td>`;
        let values = [];
        
        playersToCompare.forEach(p => {
            const val = (typeof key === 'function') ? key(p) : p[key];
            let formatted;
            if (format === 'short') formatted = formatShort(val);
            else if (format === 'percent') formatted = `${val}%`;
            else formatted = formatNumber(val);
            
            values.push({ val, formatted });
        });

        const numericVals = values.map(v => v.val);
        const targetVal = higherIsBetter ? Math.max(...numericVals) : Math.min(...numericVals);
        const worstVal = higherIsBetter ? Math.min(...numericVals) : Math.max(...numericVals);

        values.forEach(v => {
            let cellClass = '';
            if (v.val === targetVal) cellClass = 'stat-winner';
            else if (v.val === worstVal && values.length > 1 && targetVal !== worstVal) cellClass = 'stat-loser';
            row += `<td class="${cellClass}">${v.formatted}</td>`;
        });
        
        for (let i = 0; i < 3 - playersToCompare.length; i++) row += '<td>-</td>';
        row += '</tr>';
        tableHTML += row;
    });

    tableHTML += '</tbody></table>';
    dom.compareWrapper.innerHTML = tableHTML;
}


// --- Tab Switching ---
function activateTab(tabName) {
    Object.keys(dom.tabs).forEach(key => {
        const isTarget = key === tabName;
        dom.tabs[key].btn.classList.toggle('active', isTarget);
        dom.tabs[key].content.classList.toggle('active', isTarget);

        if (key === 'chart' && isTarget && allPlayerData.length > 0) {
            renderScatterChart();
        }
        if (key === 'kdCompare' && isTarget) {
            populateKdCompareDropdowns();
        }
    });
}


// --- Local Storage Profile Management ---
const DB_KEY = 'UNITY_DKP_PROFILES';

function getSavedProfiles() {
    return JSON.parse(localStorage.getItem(DB_KEY) || '{}');
}

function saveProfile(profile) {
    try {
        const profiles = getSavedProfiles();
        profiles[profile.name] = profile;
        localStorage.setItem(DB_KEY, JSON.stringify(profiles));
        return true;
    } catch (e) {
        console.error("Error saving to localStorage", e);
        setStatus("Error: Could not save profile. Storage may be full.", true);
        return false;
    }
}

function loadProfile(profileName) {
    const profiles = getSavedProfiles();
    return profiles[profileName] || null;
}

function deleteProfile(profileName) {
    const profiles = getSavedProfiles();
    delete profiles[profileName];
    localStorage.setItem(DB_KEY, JSON.stringify(profiles));
    populateProfileDropdown();
}

function populateProfileDropdown() {
    const profiles = getSavedProfiles();
    const profileNames = Object.keys(profiles);
    
    if (profileNames.length === 0) {
        dom.profileSelect.innerHTML = '<option value="">-- No profiles found --</option>';
        return;
    }

    dom.profileSelect.innerHTML = profileNames.map(name => `<option value="${name}">${name}</option>`).join('');
}


// --- Kingdom Compare Logic ---
function populateKdCompareDropdowns() {
    const profiles = getSavedProfiles();
    const profileNames = Object.keys(profiles);
    
    if (profileNames.length === 0) {
        dom.kdProfileSelectA.innerHTML = '<option value="">-- No profiles --</option>';
        dom.kdProfileSelectB.innerHTML = '<option value="">-- No profiles --</option>';
        return;
    }

    const options = profileNames.map(name => `<option value="${name}">${name}</option>`).join('');
    dom.kdProfileSelectA.innerHTML = `<option value="">-- Select Profile A --</option>${options}`;
    dom.kdProfileSelectB.innerHTML = `<option value="">-- Select Profile B --</option>${options}`;
}

function runKdCompare() {
    const profileNameA = dom.kdProfileSelectA.value;
    const profileNameB = dom.kdProfileSelectB.value;

    if (!profileNameA || !profileNameB) {
        dom.kdCompareResult.innerHTML = '<p class="text-gray-500 text-center p-8">Please select two profiles to compare.</p>';
        return;
    }

    const profileA = loadProfile(profileNameA);
    const profileB = loadProfile(profileNameB);

    if (!profileA || !profileB) {
        setStatus("Error: Could not load one or more profiles.", true);
        return;
    }

    // Calculate summary stats for each profile
    const summaryA = calculateProfileSummary(profileA.data);
    const summaryB = calculateProfileSummary(profileB.data);

    // Render the "Baseball Card"
    renderKdCompareCard(profileNameA, summaryA, profileNameB, summaryB);
}

function calculateProfileSummary(playerData) {
    const summary = {
        governors: playerData.length,
        totalStartPower: 0,
        totalPowerChange: 0,
        totalTroopPowerChange: 0,
        totalT4Kills: 0,
        totalT5Kills: 0,
        totalT4T5Kills: 0,
        totalDeads: 0,
        totalCalcKP: 0,
        avgDKPPercent: 0
    };

    playerData.forEach(p => {
        summary.totalStartPower += p.startPower;
        summary.totalPowerChange += p.powerChange;
        summary.totalTroopPowerChange += p.troopPowerChange;
        summary.totalT4Kills += p.t4kills;
        summary.totalT5Kills += p.t5kills;
        summary.totalT4T5Kills += p.t4t5Kills;
        summary.totalDeads += p.deads;
        summary.totalCalcKP += p.calcKP;
    });

    summary.avgDKPPercent = d3.mean(playerData, d => d.dkpPercent) || 0;
    
    return summary;
}

function renderKdCompareCard(nameA, statsA, nameB, statsB) {
    const metrics = [
        { title: '# Governors', key: 'governors', higherIsBetter: true, format: 'number' },
        { title: 'Starting Power', key: 'totalStartPower', higherIsBetter: true, format: 'short' },
        { title: 'Power +/-', key: 'totalPowerChange', higherIsBetter: true, format: 'short' },
        { title: 'Troop Power +/-', key: 'totalTroopPowerChange', higherIsBetter: true, format: 'short' },
        { title: 'Total KvK KP', key: 'totalCalcKP', higherIsBetter: true, format: 'short' },
        { title: 'Total T4 Kills', key: 'totalT4Kills', higherIsBetter: true, format: 'short' },
        { title: 'Total T5 Kills', key: 'totalT5Kills', higherIsBetter: true, format: 'short' },
        { title: 'Total Kills', key: 'totalT4T5Kills', higherIsBetter: true, format: 'short' },
        { title: 'Total Deads', key: 'totalDeads', higherIsBetter: false, format: 'number' },
        { title: 'Avg. DKP %', key: 'avgDKPPercent', higherIsBetter: true, format: 'percent' }
    ];

    let statsGridHTML = '';
    metrics.forEach(metric => {
        const valA = statsA[metric.key];
        const valB = statsB[metric.key];
        
        let classA = '', classB = '';
        if (valA > valB) {
            classA = metric.higherIsBetter ? 'kd-winner' : 'kd-loser';
            classB = metric.higherIsBetter ? 'kd-loser' : 'kd-winner';
        } else if (valB > valA) {
            classB = metric.higherIsBetter ? 'kd-winner' : 'kd-loser';
            classA = metric.higherIsBetter ? 'kd-loser' : 'kd-winner';
        }

        const formatVal = (val) => {
            if (metric.format === 'short') return formatShort(val);
            if (metric.format === 'percent') return `${val.toFixed(1)}%`;
            return formatNumber(val);
        };

        statsGridHTML += `
            <div class="kd-stat-row">
                <span class="kd-stat-value ${classA}">${formatVal(valA)}</span>
                <span class="kd-stat-title">${metric.title}</span>
                <span class="kd-stat-value ${classB}">${formatVal(valB)}</span>
            </div>
        `;
    });

    const cardHTML = `
        <div class="kd-card-container">
            <header class="kd-header text-center">
                <h1 class="kd-title">Kingdom Performance</h1>
                <h2 class="kd-subtitle">Head-to-Head Comparison</h2>
            </header>
            <div class="kd-body">
                <div class="kd-profile-headers">
                    <div class="kd-profile-a"><span class="kd-profile-name">${nameA}</span></div>
                    <div class="kd-vs-circle">VS</div>
                    <div class="kd-profile-b"><span class="kd-profile-name">${nameB}</span></div>
                </div>
                <div class="kd-stats-grid">
                    ${statsGridHTML}
                </div>
            </div>
        </div>
    `;
    
    dom.kdCompareResult.innerHTML = cardHTML;
}


// --- Event Listeners & App Initialization ---

function setStatus(message, isError = false) {
    dom.loadStatus.textContent = message;
    dom.loadStatus.style.color = isError ? '#dc2626' : '#4b5563';
}

function initListeners() {
    // Tab Listeners
    Object.keys(dom.tabs).forEach(key => {
        dom.tabs[key].btn.addEventListener('click', () => activateTab(key));
    });
    
    // Search Listeners
    setupSearch();

    // Resize Listener
    window.addEventListener('resize', debounce(handleResize, 300));
    
    // Manage Data Listeners
    dom.runDKPBtn.addEventListener('click', handleSaveAndRun);
    dom.loadProfileBtn.addEventListener('click', handleLoadProfile);
    dom.deleteProfileBtn.addEventListener('click', handleDeleteProfile);

    // Kingdom Compare Listener
    dom.runKdCompareBtn.addEventListener('click', runKdCompare);
}

async function handleSaveAndRun() {
    setStatus("Processing...");
    const profileName = dom.profileNameInput.value.trim();
    const startFile = dom.startScanFile.files[0];
    const endFile = dom.endScanFile.files[0];

    if (!profileName || !startFile || !endFile) {
        setStatus("Error: Profile Name, Start Scan, and End Scan files are all required.", true);
        return;
    }

    try {
        const startScanText = await readFileAsText(startFile);
        const endScanText = await readFileAsText(endFile);
        
        const startScanData = parseCSV(startScanText);
        const endScanData = parseCSV(endScanText);
        
        if (!startScanData || !endScanData) {
            setStatus("Error: One or more CSV files failed to parse. Check file format.", true);
            return;
        }

        const settings = {
            t4mult: parseFloat(dom.settings.t4mult.value) || 0,
            t5mult: parseFloat(dom.settings.t5mult.value) || 0,
            deadsMult: parseFloat(dom.settings.deadsMult.value) || 0,
            targetPercent: parseFloat(dom.settings.targetPercent.value) || 0,
        };

        // Run the DKP calculation
        const calculatedData = runDKPCalculation(startScanData, endScanData, settings);
        
        // Save the *raw data* and *settings* to the profile
        const profile = {
            name: profileName,
            startScanRaw: startScanText,
            endScanRaw: endScanText,
            settings: settings,
            data: calculatedData, // Save the calculated data as well
            timestamp: new Date().toISOString()
        };

        if (saveProfile(profile)) {
            allPlayerData = calculatedData;
            currentProfileName = profileName;
            setStatus(`Successfully saved and ran profile: ${profileName}`);
            populateProfileDropdown();
            dom.profileSelect.value = profileName;
            renderAllTabs(allPlayerData);
        } else {
            // Error handled by saveProfile
        }
        
    } catch (e) {
        console.error("Error running DKP:", e);
        setStatus("Error: Failed to read files or run calculation.", true);
    }
}

function handleLoadProfile() {
    const profileName = dom.profileSelect.value;
    if (!profileName) {
        setStatus("Please select a profile to load.", true);
        return;
    }

    const profile = loadProfile(profileName);
    
    if (profile) {
        allPlayerData = profile.data;
        currentProfileName = profile.name;
        
        // Load settings into settings tab
        dom.settings.t4mult.value = profile.settings.t4mult;
        dom.settings.t5mult.value = profile.settings.t5mult;
        dom.settings.deadsMult.value = profile.settings.deadsMult;
        dom.settings.targetPercent.value = profile.settings.targetPercent;

        // Fill in data for "Create" tab
        dom.profileNameInput.value = profile.name;
        // We can't re-populate the file inputs, so we just show a message
        setStatus(`Loaded profile: ${profile.name}. (Last saved: ${new Date(profile.timestamp).toLocaleString()})`);

        renderAllTabs(allPlayerData);
    } else {
        setStatus(`Error: Could not find profile "${profileName}".`, true);
    }
}

function handleDeleteProfile() {
    const profileName = dom.profileSelect.value;
    if (!profileName) {
        setStatus("Please select a profile to delete.", true);
        return;
    }

    if (confirm(`Are you sure you want to permanently delete the profile "${profileName}"?`)) {
        deleteProfile(profileName);
        setStatus(`Deleted profile: ${profileName}`);
        if (currentProfileName === profileName) {
            // Clear the app if we deleted the loaded profile
            allPlayerData = [];
            currentProfileName = null;
            renderAllTabs([]);
        }
    }
}

// --- App Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
    initListeners();
    populateProfileDropdown();
    activateTab('manageData');
    setStatus("Welcome to UNITY. Please create a new profile or load an existing one.");
});
