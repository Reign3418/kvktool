/**
 * UNITY - KvK DKP Calculator
 * Part 2: Profile Management, DKP Calculation Logic
 */

// --- Local Storage & Profile Management ---

function loadProfilesFromStorage() {
    const profiles = localStorage.getItem('dkpProfiles');
    dkpProfiles = profiles ? JSON.parse(profiles) : {};
    updateProfileDropdown();
    populateKdCompareDropdowns(); 
}

function saveProfilesToStorage() {
    localStorage.setItem('dkpProfiles', JSON.stringify(dkpProfiles));
}

function updateProfileDropdown() {
    dom.profileSelect.innerHTML = ''; 
    
    const profileNames = Object.keys(dkpProfiles);

    if (profileNames.length === 0) {
        dom.profileSelect.innerHTML = '<option value="">-- No profiles found --</option>';
        return;
    }

    const blankOption = '<option value="">-- Select a profile --</option>';
    dom.profileSelect.innerHTML = blankOption;

    profileNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        dom.profileSelect.appendChild(option.cloneNode(true));
    });
}

function handleLoadProfile() {
    const profileName = dom.profileSelect.value;
    if (!profileName || !dkpProfiles[profileName]) {
        setStatus("Please select a valid profile to load.", true);
        return;
    }

    setStatus(`Loading profile: ${profileName}...`);
    
    const profile = dkpProfiles[profileName];
    calculatedPlayerData = profile.calculatedData;
    
    const settings = profile.dkpSettings;
    dom.settingsInputs.t4Mult.value = settings.t4Mult;
    dom.settingsInputs.t5Mult.value = settings.t5Mult;
    dom.settingsInputs.deadsMult.value = settings.deadsMult;
    dom.settingsInputs.targetPercent.value = settings.targetPercent;
    
    processFighterData();
    renderAllTabs();
    renderScatterChart();
    
    currentProfileName = profileName;
    dom.profileNameInput.value = profileName; 
    Object.values(dom.searchBars).forEach(bar => bar.disabled = false);
    setStatus(`Successfully loaded profile: ${profileName}`);
    activateTab('snapshot');
}

function handleDeleteProfile() {
    const profileName = dom.profileSelect.value;
    if (!profileName || !dkpProfiles[profileName]) {
        setStatus("Please select a valid profile to delete.", true);
        return;
    }

    if (confirm(`Are you sure you want to delete the profile "${profileName}"? This cannot be undone.`)) {
        delete dkpProfiles[profileName];
        saveProfilesToStorage();
        updateProfileDropdown();
        populateKdCompareDropdowns();
        setStatus(`Deleted profile: ${profileName}`);
        
        if (currentProfileName === profileName) {
            clearAllData();
        }
    }
}

function clearAllData() {
    calculatedPlayerData = [];
    fighterData = [];
    currentProfileName = null;
    dom.profileNameInput.value = "";
    Object.values(dom.searchBars).forEach(bar => {
        bar.disabled = true;
        bar.value = "";
    });
    renderAllTabs(); 
    renderScatterChart();
    setStatus("Please create a new DKP profile or load an existing one.");
    activateTab('manageData');
}

// --- DKP Calculation ---

async function runDkpCalculation() {
    setStatus("Calculating...");
    
    const profileName = dom.profileNameInput.value.trim();
    if (!profileName) {
        setStatus("Error: Please enter a Profile Name.", true);
        return;
    }
    
    const startFile = dom.startScanInput.files[0];
    const endFile = dom.endScanInput.files[0];

    if (!startFile && !endFile) {
        if (dkpProfiles[profileName]) {
            setStatus("Re-calculating with new settings...");
        } else {
            setStatus("Error: Please select both a Start Scan and End Scan file.", true);
            return;
        }
    }

    try {
        const currentSettings = {
            t4Mult: parseFloat(dom.settingsInputs.t4Mult.value) || 0,
            t5Mult: parseFloat(dom.settingsInputs.t5Mult.value) || 0,
            deadsMult: parseFloat(dom.settingsInputs.deadsMult.value) || 0,
            targetPercent: parseFloat(dom.settingsInputs.targetPercent.value) || 0,
        };
        
        let startScanData, endScanData;
        
        if (startFile && endFile) {
            const startScanText = await readFileAsText(startFile);
            const endScanText = await readFileAsText(endFile);
            startScanData = parseCSV(startScanText);
            endScanData = parseCSV(endScanText);
            
            if (!startScanData || !endScanData) return; 

            dkpProfiles[profileName] = {
                ...dkpProfiles[profileName],
                startScanRaw: startScanText,
                endScanRaw: endScanText,
            };

        } else if (dkpProfiles[profileName]) {
            startScanData = parseCSV(dkpProfiles[profileName].startScanRaw);
            endScanData = parseCSV(dkpProfiles[profileName].endScanRaw);
        } else {
            throw new Error("No scan data found to calculate.");
        }
        
        const endScanMap = new Map();
        endScanData.forEach(player => {
            endScanMap.set(player['Governor ID'], player);
        });
        
        calculateAllPlayerData(startScanData, endScanMap, currentSettings);
        
        dkpProfiles[profileName] = {
            ...dkpProfiles[profileName],
            calculatedData: calculatedPlayerData,
            dkpSettings: currentSettings
        };
        saveProfilesToStorage();
        
        currentProfileName = profileName;
        updateProfileDropdown();
        populateKdCompareDropdowns(); 
        dom.profileSelect.value = profileName; 
        
        processFighterData();
        renderAllTabs();
        renderScatterChart();
        Object.values(dom.searchBars).forEach(bar => bar.disabled = false);

        setStatus(`Successfully saved and calculated DKP for ${profileName}.`);
        activateTab('snapshot'); 

    } catch (err) {
        console.error("Error during DKP calculation:", err);
        setStatus(`Error: ${err.message}`, true);
    }
}


function calculateAllPlayerData(startData, endMap, settings) {
    calculatedPlayerData = startData.map(startPlayer => {
        const govId = startPlayer['Governor ID'];
        const endPlayer = endMap.get(govId);

        const startPower = cleanNumber(startPlayer['Power']);
        let endPower = 0, endTroopPower = 0;
        let endT1=0, endT2=0, endT3=0, endT4=0, endT5=0, endDeads=0;

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
        
        const numeric_t1 = Math.max(0, endT1 - startT1);
        const numeric_t2 = Math.max(0, endT2 - startT2);
        const numeric_t3 = Math.max(0, endT3 - startT3);
        const numeric_t4 = Math.max(0, endT4 - startT4);
        const numeric_t5 = Math.max(0, endT5 - startT5);
        const numeric_deads = Math.max(0, endDeads - startDeads);
        const numeric_power_plus = endPower - startPower;
        const numeric_troop_power_plus = endTroopPower - startTroopPower;
        const numeric_t4t5 = numeric_t4 + numeric_t5;

        const { t4Mult, t5Mult, deadsMult, targetPercent } = settings;
        
        const numeric_kvk_kp = (numeric_t4 * t4Mult) + (numeric_t5 * t5Mult);
        const numeric_kvk_dkp = (numeric_deads * deadsMult) + numeric_kvk_kp;
        const numeric_target_dkp = startPower * (targetPercent / 100);
        
        let numeric_dkp_percent = 0;
        if (numeric_target_dkp > 0) {
            numeric_dkp_percent = (numeric_kvk_dkp / numeric_target_dkp) * 100;
        }
        
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
