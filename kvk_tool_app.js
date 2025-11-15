// --- App State ---
let calculatedPlayerData = []; // Processed data for the *currently loaded* profile
let fighterData = [];
let selectedPlayers = []; // Array of Governor IDs
let currentSort = { column: 'numeric_dkp_percent', direction: 'desc' };
let dkpProfiles = {}; // Object to hold all saved profiles
let currentProfileName = null; // The name of the profile currently loaded

// --- DOM Element Refs ---
const loadStatus = document.getElementById('load-status');
const runDkpBtn = document.getElementById('run-dkp-btn');
const loadProfileBtn = document.getElementById('load-profile-btn');
const deleteProfileBtn = document.getElementById('delete-profile-btn');
const profileSelect = document.getElementById('profile-select');
const profileNameInput = document.getElementById('profile-name');

// Scan Data File Inputs
const startScanInput = document.getElementById('start-scan-file');
const endScanInput = document.getElementById('end-scan-file');

const tabs = {
    manageData: { btn: document.getElementById('btn-manage-data'), content: document.getElementById('content-manage-data') },
    settings: { btn: document.getElementById('btn-settings'), content: document.getElementById('content-settings') },
    snapshot: { btn: document.getElementById('btn-snapshot'), content: document.getElementById('content-snapshot') },
    playerCards: { btn: document.getElementById('btn-player-cards'), content: document.getElementById('content-player-cards') },
    fighters: { btn: document.getElementById('btn-fighters'), content: document.getElementById('content-fighters') },
    compare: { btn: document.getElementById('btn-compare'), content: document.getElementById('content-compare') },
    chart: { btn: document.getElementById('btn-chart'), content: document.getElementById('content-chart') },
    kdCompare: { btn: document.getElementById('btn-kd-compare'), content: document.getElementById('content-kd-compare') }
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

const kdProfileSelectA = document.getElementById('kd-profile-select-a');
const kdProfileSelectB = document.getElementById('kd-profile-select-b');
const runKdCompareBtn = document.getElementById('run-kd-compare-btn');
const kdCompareResult = document.getElementById('kd-compare-result');


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

// --- Data Parsing & File Reading ---

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error("No file provided."));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function parseCSV(data) {
    const lines = data.trim().split('\n');
    const headers = lines.shift().split(',').map(h => h.trim().replace(/"/g, ''));
    
    return lines.map(line => {
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        let player = {};
        headers.forEach((header, index) => {
            player[header] = (values[index] || '').trim().replace(/"/g, '');
        });
        return player;
    });
}

// --- Local Storage & Profile Management ---

function loadProfilesFromStorage() {
    const profiles = localStorage.getItem('dkpProfiles');
    dkpProfiles = profiles ? JSON.parse(profiles) : {};
    updateProfileDropdown();
}

function saveProfilesToStorage() {
    localStorage.setItem('dkpProfiles', JSON.stringify(dkpProfiles));
}

function updateProfileDropdown() {
    profileSelect.innerHTML = ''; // Clear existing options
    kdProfileSelectA.innerHTML = '';
    kdProfileSelectB.innerHTML = '';
    
    const profileNames = Object.keys(dkpProfiles);

    if (profileNames.length === 0) {
        const defaultOption = '<option value="">-- No profiles found --</option>';
        profileSelect.innerHTML = defaultOption;
        kdProfileSelectA.innerHTML = defaultOption;
        kdProfileSelectB.innerHTML = defaultOption;
        return;
    }

    const blankOption = '<option value="">-- Select a profile --</option>';
    profileSelect.innerHTML = blankOption;
    kdProfileSelectA.innerHTML = blankOption;
    kdProfileSelectB.innerHTML = blankOption;

    profileNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        
        profileSelect.appendChild(option.cloneNode(true));
        kdProfileSelectA.appendChild(option.cloneNode(true));
        kdProfileSelectB.appendChild(option.cloneNode(true));
    });
}

function handleLoadProfile() {
    const profileName = profileSelect.value;
    if (!profileName || !dkpProfiles[profileName]) {
        loadStatus.textContent = "Please select a valid profile to load.";
        return;
    }

    loadStatus.textContent = `Loading profile: ${profileName}...`;
    
    // 1. Load data from storage
    const profile = dkpProfiles[profileName];
    calculatedPlayerData = profile.calculatedData;
    
    // 2. Load settings into the settings tab
    const settings = profile.dkpSettings;
    settingsInputs.t4Mult.value = settings.t4Mult;
    settingsInputs.t5Mult.value = settings.t5Mult;
    settingsInputs.deadsMult.value = settings.deadsMult;
    settingsInputs.targetPercent.value = settings.targetPercent;
    
    // 3. Process and render
    processFighterData();
    renderAllTabs();
    
    // 4. Update state
    currentProfileName = profileName;
    profileNameInput.value = profileName; // Set name in case of re-save
    Object.values(searchBars).forEach(bar => bar.disabled = false);
    loadStatus.textContent = `Successfully loaded profile: ${profileName}`;
    activateTab('snapshot'); // Show the results!
    
    // FIX: Manually trigger chart render *after* tab is visible
    if (tabs.chart.btn.classList.contains('active')) {
        renderScatterChart();
    }
}

function handleDeleteProfile() {
    const profileName = profileSelect.value;
    if (!profileName || !dkpProfiles[profileName]) {
        loadStatus.textContent = "Please select a valid profile to delete.";
        return;
    }

    if (confirm(`Are you sure you want to delete the profile "${profileName}"? This cannot be undone.`)) {
        delete dkpProfiles[profileName];
        saveProfilesToStorage();
        updateProfileDropdown();
        loadStatus.textContent = `Deleted profile: ${profileName}`;
        
        if (currentProfileName === profileName) {
            clearAllData();
        }
    }
}

function clearAllData() {
    calculatedPlayerData = [];
    fighterData = [];
    selectedPlayers = [];
    currentProfileName = null;
    profileNameInput.value = "";
    Object.values(searchBars).forEach(bar => {
        bar.disabled = true;
        bar.value = "";
    });
    renderAllTabs();
    renderScatterChart(); // Re-render to show "no data" message
    loadStatus.textContent = "Please create a new DKP profile or load an existing one.";
    activateTab('manageData');
}

// --- DKP Calculation ---

async function runDkpCalculation() {
    loadStatus.textContent = "Calculating...";
    
    const profileName = profileNameInput.value.trim();
    if (!profileName) {
        loadStatus.textContent = "Error: Please enter a Profile Name.";
        return;
    }
    
    const startFile = startScanInput.files[0];
    const endFile = endScanInput.files[0];

    // Check if we are re-saving a profile. If so, file uploads are optional.
    if (!startFile && !endFile) {
        if (dkpProfiles[profileName]) {
            loadStatus.textContent = "Re-calculating with new settings...";
        } else {
            // This is a new profile and files are missing
            loadStatus.textContent = "Error: Please select both a Start Scan and End Scan file.";
            return;
        }
    }

    try {
        // 1. Get new settings from inputs
        const currentSettings = {
            t4Mult: parseFloat(settingsInputs.t4Mult.value) || 0,
            t5Mult: parseFloat(settingsInputs.t5Mult.value) || 0,
            deadsMult: parseFloat(settingsInputs.deadsMult.value) || 0,
            targetPercent: parseFloat(settingsInputs.targetPercent.value) || 0,
        };
        
        // 2. Get scan data
        let startScanData, endScanData;
        
        if (startFile && endFile) {
            // New files were uploaded
            const startScanText = await readFileAsText(startFile);
            const endScanText = await readFileAsText(endFile);
            startScanData = parseCSV(startScanText);
            endScanData = parseCSV(endScanText);
            
            // Save the raw text to the profile for re-calculation
            dkpProfiles[profileName] = {
                ...dkpProfiles[profileName], // Keep any old data
                startScanRaw: startScanText,
                endScanRaw: endScanText,
            };

        } else if (dkpProfiles[profileName] && dkpProfiles[profileName].startScanRaw) {
            // No new files, re-calculate from saved raw data
            startScanData = parseCSV(dkpProfiles[profileName].startScanRaw);
            endScanData = parseCSV(dkpProfiles[profileName].endScanRaw);
        } else {
            throw new Error("No scan data found to calculate.");
        }
        
        // 3. Create a fast lookup map for the "End Scan" data
        const endScanMap = new Map();
        endScanData.forEach(player => {
            endScanMap.set(player['Governor ID'], player);
        });
        
        // 4. Calculate all player data
        calculateAllPlayerData(startScanData, endScanMap, currentSettings);
        
        // 5. Save the *results* and *settings* to the profile
        dkpProfiles[profileName] = {
            ...dkpProfiles[profileName], // Keep raw scan data
            calculatedData: calculatedPlayerData,
            dkpSettings: currentSettings
        };
        saveProfilesToStorage();
        
        // 6. Update UI
        currentProfileName = profileName;
        updateProfileDropdown();
        profileSelect.value = profileName; // Select the new profile
        
        processFighterData();
        renderAllTabs();
        Object.values(searchBars).forEach(bar => bar.disabled = false);

        loadStatus.textContent = `Successfully saved and calculated DKP for ${profileName}.`;
        activateTab('snapshot'); // Show the results!

    } catch (err) {
        console.error("Error during DKP calculation:", err);
        loadStatus.textContent = `Error: ${err.message}`;
    }
}


/**
 * This function calculates all DKP stats based on the two scans
 */
function calculateAllPlayerData(startData, endMap, settings) {
    calculatedPlayerData = startData.map(startPlayer => {
        const govId = startPlayer['Governor ID'];
        const endPlayer = endMap.get(govId);

        // --- Calculate Stats from Before/After ---
        const startPower = cleanNumber(startPlayer['Power']);
        let endPower = 0;
        let endTroopPower = 0;
        let endT1 = 0, endT2 = 0, endT3 = 0, endT4 = 0, endT5 = 0, endDeads = 0;

        // If player isn't in the end scan, they get 0 for all end stats
        if (endPlayer) {
            endPower = cleanNumber(endPlayer['Power']);
            endTroopPower = cleanNumber(endPlayer['Troop Power']);
            endT1 = cleanNumber(endPlayer['T1 Kills']);
            endT2 = cleanNumber(endPlayer['T2 Kills']);
            endT3 = cleanNumber(endPlayer['T3 Kills']);
            endT4 = cleanNumber(endPlayer['T4 Kills']);
            endT5 = cleanNumber(endPlayer['T5 Kills']);
            endDeads = cleanNumber(endPlayer['Deads']);
        }
        
        const startTroopPower = cleanNumber(startPlayer['Troop Power']);
        const startT1 = cleanNumber(startPlayer['T1 Kills']);
        const startT2 = cleanNumber(startPlayer['T2 Kills']);
        const startT3 = cleanNumber(startPlayer['T3 Kills']);
        const startT4 = cleanNumber(startPlayer['T4 Kills']);
        const startT5 = cleanNumber(startPlayer['T5 Kills']);
        const startDeads = cleanNumber(startPlayer['Deads']);
        
        // These are the KvK-only stats
        const numeric_t1 = Math.max(0, endT1 - startT1);
        const numeric_t2 = Math.max(0, endT2 - startT2);
        const numeric_t3 = Math.max(0, endT3 - startT3);
        const numeric_t4 = Math.max(0, endT4 - startT4);
        const numeric_t5 = Math.max(0, endT5 - startT5);
        const numeric_deads = Math.max(0, endDeads - startDeads);
        const numeric_power_plus = endPower - startPower;
        const numeric_troop_power_plus = endTroopPower - startTroopPower;
        const numeric_t4t5 = numeric_t4 + numeric_t5;

        // --- Calculate DKP Stats from Settings ---
        const { t4Mult, t5Mult, deadsMult, targetPercent } = settings;
        
        const numeric_kvk_kp = (numeric_t4 * t4Mult) + (numeric_t5 * t5Mult);
        
        const numeric_kvk_dkp = (numeric_deads * deadsMult) + numeric_kvk_kp;
        
        const numeric_target_dkp = startPower * (targetPercent / 100);
        
        let numeric_dkp_percent = 0;
        if (numeric_target_dkp > 0) {
            numeric_dkp_percent = (numeric_kvk_dkp / numeric_target_dkp) * 100;
        }
        
        // Return a new object matching the structure our tabs expect
        return {
            'Governor ID': govId,
            'Governor Name': startPlayer['Governor Name'],
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
            'DKP % Complete': numeric_dkp_percent.toFixed(0),
            
            // Keep pre-calculated numerics for sorting
            numeric_kvk_kp: numeric_kvk_kp,
            numeric_deads: numeric_deads,
            numeric_dkp_percent: numeric_dkp_percent,
            numeric_power: startPower,
            numeric_t4t5: numeric_t4t5
        };
    });
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
    renderComparison();
    // Chart is rendered on-demand when tab is clicked
}

function renderSnapshotTable() {
    if (calculatedPlayerData.length === 0) {
        snapshotTableWrapper.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">Load or create a DKP profile to see results.</p>';
        return;
    }
    
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
        tdDKP.textContent = `${player['DKP % Complete']}%`;
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
    if (calculatedPlayerData.length === 0) {
        playerGrid.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">Load or create a DKP profile to see results.</p>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    calculatedPlayerData.forEach(player => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player['DKP % Complete'];
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
    if (fighterData.length === 0) {
        fighterGrid.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">Load or create a DKP profile to see results. (Min 20M Power & >0 KvK KP)</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    fighterData.forEach((player, index) => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player['DKP % Complete'];
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
    if (chartData.length === 0) {
        ctx.font = "16px Inter";
        ctx.fillStyle = "#6b7280";
        ctx.textAlign = "center";
        ctx.fillText("Load or create a DKP profile to see chart data.", width / 2, height / 2);
        return;
    }

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
            dkpPercent: d['DKP % Complete'],
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
            // Get the value. Note: 'DKP % Complete' is already a string
            const rawValue = p[metric];
            const isPercent = metric === 'DKP % Complete';
            
            values.push({
                val: isPercent ? parseFloat(rawValue) : rawValue,
                formatted: isPercent ? `${rawValue}%` : formatNumber(rawValue)
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
    if (!tabName) {
        tabName = 'manageData';
    }
    
    Object.keys(tabs).forEach(key => {
        const isTarget = key === tabName;
        tabs[key].btn.classList.toggle('active', isTarget);
        tabs[key].content.classList.toggle('active', isTarget);

        if (key === 'chart' && isTarget) {
            renderScatterChart();
        }
    });
}

// --- Resize Handling ---
function handleResize() {
    if (tabs.chart.content.classList.contains('active')) {
        renderScatterChart();
    }
}

// --- Kingdom Compare Logic ---

function calculateKingdomSummary(profileData) {
    if (!profileData || profileData.length === 0) {
        return {
            governorCount: 0,
            totalStartPower: 0,
            totalPowerChange: 0,
            totalTroopPowerChange: 0,
            totalKillsT4: 0,
            totalKillsT5: 0,
            totalKillsT4T5: 0,
            totalDeads: 0,
            totalKP: 0,
            totalDKP: 0,
            avgDKPPercent: 0
        };
    }

    const summary = profileData.reduce((acc, player) => {
        acc.totalStartPower += player['Starting Power'];
        acc.totalPowerChange += player['Power +/-'];
        acc.totalTroopPowerChange += player['Troop Power'];
        acc.totalKillsT4 += player['T4 Kills'];
        acc.totalKillsT5 += player['T5 Kills'];
        acc.totalKillsT4T5 += player['T4+T5 Combined'];
        acc.totalDeads += player['Kvk only Deads'];
        acc.totalKP += player['kvk only KP'];
        acc.totalDKP += player['KVK DKP'];
        acc.sumDKPPercent += player.numeric_dkp_percent;
        return acc;
    }, {
        governorCount: profileData.length,
        totalStartPower: 0,
        totalPowerChange: 0,
        totalTroopPowerChange: 0,
        totalKillsT4: 0,
        totalKillsT5: 0,
        totalKillsT4T5: 0,
        totalDeads: 0,
        totalKP: 0,
        totalDKP: 0,
        sumDKPPercent: 0
    });

    summary.avgDKPPercent = (summary.sumDKPPercent / summary.governorCount).toFixed(1);
    return summary;
}

function renderKingdomComparison() {
    const profileNameA = kdProfileSelectA.value;
    const profileNameB = kdProfileSelectB.value;

    if (!profileNameA || !profileNameB) {
        kdCompareResult.innerHTML = '<p class="text-gray-500 text-center p-8">Select two profiles and click "Compare" to see the results.</p>';
        return;
    }
    
    if (profileNameA === profileNameB) {
        kdCompareResult.innerHTML = '<p class="text-red-500 text-center p-8">Please select two different profiles to compare.</p>';
        return;
    }

    const profileA = dkpProfiles[profileNameA];
    const profileB = dkpProfiles[profileNameB];

    if (!profileA || !profileB) {
        kdCompareResult.innerHTML = '<p class="text-red-500 text-center p-8">Error loading profile data. Please try re-saving the profiles.</p>';
        return;
    }

    const summaryA = calculateKingdomSummary(profileA.calculatedData);
    const summaryB = calculateKingdomSummary(profileB.calculatedData);

    const stats = [
        { title: '# Governors', key: 'governorCount', short: false, winner: (a, b) => a > b },
        { title: 'Total Starting Power', key: 'totalStartPower', short: true, winner: (a, b) => a > b },
        { title: 'Total Power +/-', key: 'totalPowerChange', short: true, winner: (a, b) => a > b },
        { title: 'Total Troop Power +/-', key: 'totalTroopPowerChange', short: true, winner: (a, b) => a > b },
        { title: 'Total KvK KP', key: 'totalKP', short: true, winner: (a, b) => a > b },
        { title: 'Total T4 Kills', key: 'totalKillsT4', short: true, winner: (a, b) => a > b },
        { title: 'Total T5 Kills', key: 'totalKillsT5', short: true, winner: (a, b) => a > b },
        { title: 'Total T4/T5 Kills', key: 'totalKillsT4T5', short: true, winner: (a, b) => a > b },
        { title: 'Total Deads', key: 'totalDeads', short: true, winner: (a, b) => a < b }, // Lower is better
        { title: 'Average DKP %', key: 'avgDKPPercent', short: false, winner: (a, b) => a > b, suffix: '%' }
    ];

    let statsHTML = '';
    stats.forEach(stat => {
        const valA = summaryA[stat.key];
        const valB = summaryB[stat.key];
        const suffix = stat.suffix || '';
        
        const valAStr = (stat.short ? formatShort(valA) : formatNumber(valA)) + suffix;
        const valBStr = (stat.short ? formatShort(valB) : formatNumber(valB)) + suffix;

        let classA = 'kd-stat-value';
        let classB = 'kd-stat-value';
        
        if (stat.winner(valA, valB)) {
            classA = 'kd-stat-value kd-winner';
            classB = 'kd-stat-value kd-loser';
        } else if (stat.winner(valB, valA)) {
            classB = 'kd-stat-value kd-winner';
            classA = 'kd-stat-value kd-loser';
        }

        statsHTML += `
            <div class="kd-stat-row">
                <span class="${classA}">${valAStr}</span>
                <span class="kd-stat-title">${stat.title}</span>
                <span class="${classB}">${valBStr}</span>
            </div>
        `;
    });

    const cardHTML = `
        <div class="kd-card-container">
            <header class="kd-header text-center">
                <h1>Kingdom Comparison</h1>
                <h2>Summary of Stats</h2>
            </header>
            <div class="kd-body">
                <div class="kd-profile-headers">
                    <div class="kd-profile-a">
                        <span class="kd-profile-name">${profileNameA}</span>
                    </div>
                    <div class="kd-vs-circle">VS</div>
                    <div class="kd-profile-b">
                        <span class="kd-profile-name">${profileNameB}</span>
                    </div>
                </div>
                <div class="kd-stats-grid">
                    ${statsHTML}
                </div>
            </div>
        </div>
    `;
    
    kdCompareResult.innerHTML = cardHTML;
}


// --- App Entry Point ---

document.addEventListener('DOMContentLoaded', () => {
    // Set default tab to 'manageData'
    activateTab('manageData');
    
    // Wire up search
    setupSearch();
    
    // Wire up Profile buttons
    runDkpBtn.addEventListener('click', runDkpCalculation);
    loadProfileBtn.addEventListener('click', handleLoadProfile);
    deleteProfileBtn.addEventListener('click', handleDeleteProfile);
    runKdCompareBtn.addEventListener('click', renderKingdomComparison);
    
    // Wire up resize listener
    window.addEventListener('resize', debounce(handleResize, 250));
    
    // Load profiles from storage on start
    loadProfilesFromStorage();
});
