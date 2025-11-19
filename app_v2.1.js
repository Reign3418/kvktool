/**
 * UNITY - KvK DKP Calculator
 * Part 1: Setup, Global State, DOM Cache, Utilities, and Parsing
 */

// --- App State ---
let calculatedPlayerData = [];
let fighterData = [];
let selectedPlayers = []; // Kept for potential future use but not used in UI
let currentSort = { column: 'numeric_dkp_percent', direction: 'desc' };
let dkpProfiles = {}; 
let currentProfileName = null; 

// --- DOM Element Refs ---
window.dom = {
    loadStatus: document.getElementById('load-status'),
    runDkpBtn: document.getElementById('run-dkp-btn'),
    loadProfileBtn: document.getElementById('load-profile-btn'),
    deleteProfileBtn: document.getElementById('delete-profile-btn'),
    profileSelect: document.getElementById('profile-select'),
    profileNameInput: document.getElementById('profile-name'),
    startScanInput: document.getElementById('start-scan-file'),
    endScanInput: document.getElementById('end-scan-file'),

    tabs: {
        manageData: { btn: document.getElementById('btn-manage-data'), content: document.getElementById('content-manage-data') },
        settings: { btn: document.getElementById('btn-settings'), content: document.getElementById('content-settings') },
        snapshot: { btn: document.getElementById('btn-snapshot'), content: document.getElementById('content-snapshot') },
        playerCards: { btn: document.getElementById('btn-player-cards'), content: document.getElementById('content-player-cards') },
        fighters: { btn: document.getElementById('btn-fighters'), content: document.getElementById('content-fighters') },
        chart: { btn: document.getElementById('btn-chart'), content: document.getElementById('content-chart') }
    },

    searchBars: {
        snapshot: document.getElementById('search-bar-snapshot'),
        playerCards: document.getElementById('search-bar-player-cards'),
        fighters: document.getElementById('search-bar-fighters')
    },

    settingsInputs: {
        t4Mult: document.getElementById('setting-t4-mult'),
        t5Mult: document.getElementById('setting-t5-mult'),
        deadsMult: document.getElementById('setting-deads-mult'),
        targetPercent: document.getElementById('setting-target-percent')
    },

    playerGrid: document.getElementById('player-grid'),
    fighterGrid: document.getElementById('fighter-grid'),
    snapshotTableWrapper: document.getElementById('snapshot-table-wrapper'),

    // Removed compare elements
    chartContainer: document.querySelector('.chart-container'),
    chartCanvas: document.getElementById('scatter-chart'),
    chartTooltip: document.getElementById('chart-tooltip')
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
    if (max === min || isNaN(val) || !isFinite(val)) return 0;
    return (val - min) / (max - min);
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function setStatus(message, isError = false) {
    if (dom.loadStatus) {
        dom.loadStatus.textContent = message;
        dom.loadStatus.style.color = isError ? '#dc2626' : '#4b5563';
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        if (!file) { reject(new Error("No file provided.")); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function parseCSV(data) {
    try {
        const lines = data.trim().split('\n');
        if (lines.length === 0) return null;
        if (lines[0].charCodeAt(0) === 0xFEFF) lines[0] = lines[0].substring(1);

        const headers = lines.shift().split(',').map(h => h.trim().replace(/"/g, '').replace(/\r/g, ''));
        
        // UPDATED DATA MAP with correct headers
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
            kp: "Kill Points"
        };
        
        const csvHeaders = new Set(headers);
        let missingHeaders = [];
        Object.values(DATA_MAP).forEach(headerName => {
            if (!csvHeaders.has(headerName)) missingHeaders.push(headerName);
        });

        if (missingHeaders.length > 0) {
            throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
        }

        const headerIndices = {};
        for (const key in DATA_MAP) {
            headerIndices[key] = headers.indexOf(DATA_MAP[key]);
        }

        return lines.map(line => {
            const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            let player = {};
            for (const key in headerIndices) {
                const index = headerIndices[key];
                player[DATA_MAP[key]] = (values[index] || '').trim().replace(/"/g, '').replace(/\r/g, '');
            }
            return player;
        }).filter(p => p[DATA_MAP.id]); 

    } catch (e) {
        console.error("Failed to parse CSV", e);
        setStatus(`Error: ${e.message}. Check file format.`, true);
        return null;
    }
}
