/**
 * UNITY - KvK DKP Calculator
 * Part 3: Rendering, Chart Logic, Search, and Initialization
 */

function renderAllTabs() {
    renderSnapshotTable();
    renderPlayerCards();
    renderFighterCards();
    // Chart renders on demand
}

function renderSnapshotTable() {
    if (calculatedPlayerData.length === 0) {
        dom.snapshotTableWrapper.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">Load or create a DKP profile to see results.</p>';
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
    
    dom.snapshotTableWrapper.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'snapshot-table';
    
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = [
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
    dom.snapshotTableWrapper.appendChild(table);
}

function renderPlayerCards() {
    dom.playerGrid.innerHTML = '';
    if (calculatedPlayerData.length === 0) {
        dom.playerGrid.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">Load or create a DKP profile to see results.</p>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    calculatedPlayerData.forEach(player => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player['DKP % Complete'];

        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.id = govId;
        card.dataset.name = govName.toLowerCase();

        card.innerHTML = `
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
        fragment.appendChild(card);
    });
    dom.playerGrid.appendChild(fragment);
}

function renderFighterCards() {
    dom.fighterGrid.innerHTML = '';
    if (fighterData.length === 0) {
        dom.fighterGrid.innerHTML = '<p class="text-gray-500 col-span-full text-center p-8">Load or create a DKP profile to see results. (Min 20M Power & >0 KvK KP)</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    fighterData.forEach((player, index) => {
        const govId = player['Governor ID'];
        const govName = player['Governor Name'];
        const kvkKP = player.numeric_kvk_kp;
        const dkpPercent = player['DKP % Complete'];
        const power = player.numeric_power;

        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.id = govId;
        card.dataset.name = govName.toLowerCase();
        
        card.innerHTML = `
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
        fragment.appendChild(card);
    });
    dom.fighterGrid.appendChild(fragment);
}

// --- Chart Functions ---

function getQuadrant(player, averages) {
    const kills = player.numeric_t4t5;
    const deads = player.numeric_deads;
    if (kills >= averages.kills && deads <= averages.deads) return { name: 'Hero', color: '#3b82f6' };
    if (kills >= averages.kills && deads > averages.deads) return { name: 'Warrior', color: '#22c55e' };
    if (kills < averages.kills && deads > averages.deads) return { name: 'Feeder', color: '#ef4444' };
    return { name: 'Slacker', color: '#6b7280' };
}

function renderScatterChart() {
    const canvas = dom.chartCanvas;
    const container = dom.chartContainer;
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

    const totalKills = d3.sum(chartData, d => d.numeric_t4t5);
    const totalDeads = d3.sum(chartData, d => d.numeric_deads);
    const avgKills = totalKills / chartData.length;
    const avgDeads = totalDeads / chartData.length;
    const averages = { kills: avgKills, deads: avgDeads };

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

    const xMax = d3.quantile(plotData.map(d => d.x).sort(d3.ascending), 0.95) * 1.05 || d3.max(plotData, d => d.x) || 1;
    const yMax = d3.quantile(plotData.map(d => d.y).sort(d3.ascending), 0.95) * 1.05 || d3.max(plotData, d => d.y) || 1;

    const x = d3.scaleLinear().domain([0, xMax]).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]);
    const radius = 5;

    ctx.save();
    ctx.translate(margin.left, margin.top);
    
    // Draw Quadrants
    const avgX = x(avgKills);
    const avgY = y(avgDeads);
    ctx.beginPath();
    ctx.strokeStyle = '#aaa';
    ctx.setLineDash([5, 5]);
    ctx.moveTo(avgX, 0); ctx.lineTo(avgX, innerHeight);
    ctx.moveTo(0, avgY); ctx.lineTo(innerWidth, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
    
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
    const quadtree = d3.quadtree().x(d => xScale(d.x)).y(d => yScale(d.y)).addAll(plotData);

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);
        const [target] = quadtree.find((x * 2) - margin.left, (y * 2) - margin.top, 10 * 2);

        if (target) {
            canvas.style.cursor = 'pointer';
            tooltip.innerHTML = `<strong>${target.name}</strong><br>T4/T5 Kills: ${formatShort(target.x)}<br>Deads: ${formatNumber(target.y)}<br>DKP %: ${target.dkpPercent}%`;
            tooltip.classList.add('show');
            tooltip.style.left = `${x + 15}px`;
            tooltip.style.top = `${y + 15}px`;
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

// --- Search & Sort ---

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
        row.style.display = (row.dataset.name.includes(query) || row.dataset.id.includes(query)) ? '' : 'none';
    });
    const allCards = dom.playerGrid.querySelectorAll('.player-card');
    allCards.forEach(card => {
        card.style.display = (card.dataset.name.includes(query) || card.dataset.id.includes(query)) ? 'block' : 'none';
    });
    const allFighterCards = dom.fighterGrid.querySelectorAll('.player-card');
    allFighterCards.forEach(card => {
        card.style.display = (card.dataset.name.includes(query) || card.dataset.id.includes(query)) ? 'block' : 'none';
    });
    Object.keys(dom.searchBars).forEach(key => {
        if (key !== sourceTab && dom.searchBars[key]) {
            dom.searchBars[key].value = query;
        }
    });
}

// --- App Entry Point ---
function handleResize() {
    if (dom.tabs.chart.content.classList.contains('active')) {
        renderScatterChart();
    }
}

function activateTab(tabName) {
    if (!tabName) tabName = 'manageData';
    Object.keys(dom.tabs).forEach(key => {
        const isTarget = key === tabName;
        dom.tabs[key].btn.classList.toggle('active', isTarget);
        dom.tabs[key].content.classList.toggle('active', isTarget);
        if (key === 'chart' && isTarget) renderScatterChart();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!dom.runDkpBtn) return;
    
    setupSearch();
    dom.runDkpBtn.addEventListener('click', runDkpCalculation);
    dom.loadProfileBtn.addEventListener('click', handleLoadProfile);
    dom.deleteProfileBtn.addEventListener('click', handleDeleteProfile);
    // Removed runKdCompareBtn listener
    window.addEventListener('resize', debounce(handleResize, 250));

    Object.keys(dom.tabs).forEach(key => {
        if (dom.tabs[key] && dom.tabs[key].btn) {
            dom.tabs[key].btn.addEventListener('click', () => activateTab(key));
        }
    });
    
    loadProfilesFromStorage();
    populateProfileDropdown();
    activateTab('manageData');
    setStatus("Welcome to UNITY. Please create a new profile or load an existing one.");
});
