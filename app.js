/**
 * 利回りウォッチャー - アプリケーションロジック（完全版・1株配当手入力対応）
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // State & Constants
    // ==========================================================================
    let stocks = [];      // [{code: '2914', targetYield: 4.0, manualDividend: 150}]
    let apiBaseUrl = '';  // APIのベースURL
    const fetchedData = {}; // 取得成功したデータのキャッシュ

    const STORAGE_KEY_CODES = 'rimawari_watcher_codes';
    const STORAGE_KEY_API = 'rimawari_watcher_api_url';

    const elements = {
        btnOpenSettings: document.getElementById('btn-open-settings'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        btnCancelSettings: document.getElementById('btn-cancel-settings'),
        btnSaveSettings: document.getElementById('btn-save-settings'),
        settingsModal: document.getElementById('settings-modal'),
        inputApiUrl: document.getElementById('input-api-url'),
        
        formRegisterStock: document.getElementById('form-register-stock'),
        inputStockCode: document.getElementById('input-stock-code'),
        inputTargetYield: document.getElementById('input-target-yield'),
        btnRefreshAll: document.getElementById('btn-refresh-all'),
        refreshIcon: document.getElementById('refresh-icon'),
        
        stockCardsContainer: document.getElementById('stock-cards-container'),
        emptyState: document.getElementById('empty-state'),
        
        statCount: document.getElementById('stat-count'),
        statAverageYield: document.getElementById('stat-average-yield')
    };

    // ==========================================================================
    // App Initialization
    // ==========================================================================
    function init() {
        try {
            const savedCodes = localStorage.getItem(STORAGE_KEY_CODES);
            if (savedCodes) {
                const parsed = JSON.parse(savedCodes);
                stocks = parsed.map(item => {
                    if (!item) return { code: '', targetYield: 4.0, manualDividend: null };
                    if (typeof item === 'string') return { code: item.toUpperCase(), targetYield: 4.0, manualDividend: null };
                    return { 
                        code: (item.code || '').toUpperCase(), 
                        targetYield: parseFloat(item.targetYield) || 4.0,
                        manualDividend: item.manualDividend !== undefined && item.manualDividend !== null ? parseFloat(item.manualDividend) : null
                    };
                }).filter(item => item.code !== '');
                
                // 辞書順ソート
                stocks.sort((a, b) => a.code.localeCompare(b.code));
            }

            apiBaseUrl = localStorage.getItem(STORAGE_KEY_API) || '';
            if (elements.inputApiUrl) elements.inputApiUrl.value = apiBaseUrl;

            updateEmptyStateVisibility();
            updateSummary();

            if (stocks.length > 0) {
                if (elements.stockCardsContainer) elements.stockCardsContainer.innerHTML = '';
                stocks.forEach(stock => {
                    if (stock && stock.code) {
                        createCardDOM(stock.code);
                        loadStockData(stock.code);
                    }
                });
            }
        } catch (e) {
            console.error('Initialization error:', e);
        }
        setupEventListeners();
    }

    function setupEventListeners() {
        if (elements.btnOpenSettings) elements.btnOpenSettings.addEventListener('click', openModal);
        if (elements.btnCloseModal) elements.btnCloseModal.addEventListener('click', closeModal);
        if (elements.btnCancelSettings) elements.btnCancelSettings.addEventListener('click', closeModal);
        if (elements.btnSaveSettings) elements.btnSaveSettings.addEventListener('click', saveSettings);
        if (elements.formRegisterStock) elements.formRegisterStock.addEventListener('submit', handleRegisterSubmit);
        if (elements.btnRefreshAll) elements.btnRefreshAll.addEventListener('click', refreshAllStocks);
    }

    function openModal() {
        if (elements.inputApiUrl) elements.inputApiUrl.value = apiBaseUrl;
        if (elements.settingsModal) elements.settingsModal.classList.add('show');
    }

    function closeModal() {
        if (elements.settingsModal) elements.settingsModal.classList.remove('show');
    }

    function saveSettings() {
        const urlInput = elements.inputApiUrl.value.trim();
        apiBaseUrl = urlInput;
        localStorage.setItem(STORAGE_KEY_API, apiBaseUrl);
        closeModal();
        refreshAllStocks();
    }

    // ==========================================================================
    // Stock Logic
    // ==========================================================================
    function handleRegisterSubmit(e) {
        if (e && e.preventDefault) e.preventDefault();
        
        const code = elements.inputStockCode.value.trim().toUpperCase();
        const targetYield = parseFloat(elements.inputTargetYield.value) || 4.0;

        if (!/^[A-Z0-9]{4,5}$/.test(code)) {
            alert('コードは4〜5桁の英数字で入力してください。');
            return;
        }

        if (stocks.some(s => s.code === code)) {
            alert(`コード: ${code} は既に登録されています。`);
            return;
        }

        stocks.push({ code, targetYield, manualDividend: null });
        stocks.sort((a, b) => a.code.localeCompare(b.code));
        localStorage.setItem(STORAGE_KEY_CODES, JSON.stringify(stocks));

        elements.inputStockCode.value = '';
        elements.inputTargetYield.value = '4.0';
        
        updateEmptyStateVisibility();
        
        renderAllCardsTemplate();
        stocks.forEach(s => loadStockData(s.code));
        updateSummary();
    }

    function renderAllCardsTemplate() {
        if (!elements.stockCardsContainer) return;
        elements.stockCardsContainer.innerHTML = '';
        stocks.forEach(stock => {
            createCardDOM(stock.code);
        });
    }

    function createCardDOM(code) {
        if (!elements.stockCardsContainer) return;
        if (document.getElementById(`card-${code}`)) return;

        const card = document.createElement('div');
        card.id = `card-${code}`;
        card.className = 'stock-card loading';
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <span class="stock-code">${code}</span>
                    <h3 class="stock-name">読込中...</h3>
                </div>
                <button class="btn-delete" data-code="${code}">×</button>
            </div>
            <div class="card-body">
                <div class="price-row">
                    <span class="stock-price">-- 円</span>
                    <span class="stock-change">--</span>
                </div>
                <div class="yield-badge-row">
                    <div class="yield-info">
                        <span class="yield-label">配当利回り</span>
                        <span class="stock-yield">-- %</span>
                    </div>
                    <div class="yield-info">
                        <span class="yield-label">1株配当</span>
                        <div class="yield-input-container">
                            <input type="number" step="0.5" class="input-card-dividend" data-code="${code}" placeholder="--">
                            <span class="yield-percent-symbol">円</span>
                        </div>
                    </div>
                </div>
                <div class="target-yield-row">
                    <span class="target-label">目標利回り:</span>
                    <input type="number" step="0.1" class="input-card-target" data-code="${code}" value="4.0">
                    <span class="target-unit">%</span>
                    <span class="achieved-badge" style="display:none;">🟢 目標達成</span>
                </div>
            </div>
        `;

        elements.stockCardsContainer.appendChild(card);

        card.querySelector('.btn-delete').addEventListener('click', () => deleteStock(code));
        
        const targetInput = card.querySelector('.input-card-target');
        const currentStock = stocks.find(s => s.code === code);
        if (currentStock) {
            targetInput.value = currentStock.targetYield;
        }
        targetInput.addEventListener('change', (e) => updateTargetYield(code, parseFloat(e.target.value)));

        // 1株配当の手入力イベント
        const dividendInput = card.querySelector('.input-card-dividend');
        dividendInput.addEventListener('change', (e) => updateManualDividend(code, e.target.value));
    }

    function loadStockData(code) {
        const card = document.getElementById(`card-${code}`);
        if (!card) return;

        if (!apiBaseUrl) {
            renderErrorCard(code, 'API URLが未設定です');
            return;
        }

        card.classList.add('loading');
        
        const baseUrlClean = apiBaseUrl.replace(/\/$/, '');
        fetch(`${baseUrlClean}/api/stock?code=${code}`)
            .then(res => {
                if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
                return res.json();
            })
            .then(data => {
                fetchedData[code] = data;
                renderSuccessCard(code, data);
                updateSummary();
            })
            .catch(err => {
                console.error(`Fetch error for ${code}:`, err);
                renderErrorCard(code, 'データ取得エラー');
            })
            .finally(() => {
                card.classList.remove('loading');
            });
    }

    function renderSuccessCard(code, data) {
        const card = document.getElementById(`card-${code}`);
        if (!card) return;

        card.className = 'stock-card';
        
        card.querySelector('.stock-name').textContent = data.name || '不明な銘柄';
        const priceVal = parseFloat(data.price) || 0;
        card.querySelector('.stock-price').textContent = `${priceVal.toLocaleString()} 円`;
        
        const changeEl = card.querySelector('.stock-change');
        const changeVal = parseFloat(data.change) || 0;
        const changePercentVal = parseFloat(data.changePercent) || 0;
        
        if (changeVal > 0) {
            changeEl.textContent = `+${changeVal.toLocaleString()} (+${changePercentVal.toFixed(2)}%)`;
            changeEl.className = 'stock-change up';
        } else if (changeVal < 0) {
            changeEl.textContent = `${changeVal.toLocaleString()} (${changePercentVal.toFixed(2)}%)`;
            changeEl.className = 'stock-change down';
        } else {
            changeEl.textContent = `0 (0.00%)`;
            changeEl.className = 'stock-change';
        }

        const stockConfig = stocks.find(s => s.code === code);
        const dividendInput = card.querySelector('.input-card-dividend');
        
        let currentDividend = 0;
        let currentYield = 0;

        if (stockConfig && stockConfig.manualDividend !== null) {
            // 1株配当に「手入力値」がある場合
            currentDividend = stockConfig.manualDividend;
            if (dividendInput) dividendInput.value = currentDividend;
            card.classList.add('manual-mode');
            
            // 手入力の配当金と、現在の取得株価を使って利回りを自動連動計算
            if (priceVal > 0) {
                currentYield = (currentDividend / priceVal) * 100;
            } else {
                currentYield = 0;
            }
        } else {
            // 自動取得値の場合
            currentDividend = parseFloat(data.dividend) || 0;
            if (dividendInput) {
                dividendInput.value = currentDividend > 0 ? currentDividend : '';
                dividendInput.placeholder = currentDividend > 0 ? currentDividend : '--';
            }
            card.classList.remove('manual-mode');
            currentYield = parseFloat(data.yield) || 0;
        }

        // 確定した利回り表示と目標達成判定
        card.querySelector('.stock-yield').textContent = `${currentYield.toFixed(2)} %`;

        const targetYield = stockConfig ? stockConfig.targetYield : 4.0;
        const badge = card.querySelector('.achieved-badge');
        
        if (currentYield >= targetYield && currentYield > 0) {
            card.classList.add('achieved');
            if (badge) badge.style.display = 'inline-block';
        } else {
            card.classList.remove('achieved');
            if (badge) badge.style.display = 'none';
        }
    }

    function renderErrorCard(code, message) {
        const card = document.getElementById(`card-${code}`);
        if (!card) return;
        card.className = 'stock-card error';
        card.querySelector('.stock-name').textContent = message;
        
        const stockConfig = stocks.find(s => s.code === code);
        const dividendInput = card.querySelector('.input-card-dividend');
        if (stockConfig && stockConfig.manualDividend !== null && dividendInput) {
            dividendInput.value = stockConfig.manualDividend;
        }
    }

    function deleteStock(code) {
        stocks = stocks.filter(s => s.code !== code);
        localStorage.setItem(STORAGE_KEY_CODES, JSON.stringify(stocks));
        
        const card = document.getElementById(`card-${code}`);
        if (card) card.remove();
        
        delete fetchedData[code];
        updateEmptyStateVisibility();
        updateSummary();
    }

    function updateTargetYield(code, newYield) {
        const stock = stocks.find(s => s.code === code);
        if (stock) {
            stock.targetYield = parseFloat(newYield) || 0;
            localStorage.setItem(STORAGE_KEY_CODES, JSON.stringify(stocks));
            
            if (fetchedData[code]) {
                renderSuccessCard(code, fetchedData[code]);
            }
        }
    }

    // 1株配当の手入力保存・再計算ロジック
    function updateManualDividend(code, valueStr) {
        const stock = stocks.find(s => s.code === code);
        if (stock) {
            if (valueStr.trim() === '') {
                stock.manualDividend = null; // 空欄にされたら自動取得に戻す
            } else {
                stock.manualDividend = parseFloat(valueStr) || 0;
            }
            localStorage.setItem(STORAGE_KEY_CODES, JSON.stringify(stocks));
            
            if (fetchedData[code]) {
                renderSuccessCard(code, fetchedData[code]);
            } else {
                const card = document.getElementById(`card-${code}`);
                if (card) renderSuccessCard(code, { name: card.querySelector('.stock-name').textContent, yield: 0, price: 0, change: 0, changePercent: 0, dividend: 0 });
            }
            updateSummary();
        }
    }

    function refreshAllStocks() {
        if (elements.refreshIcon) elements.refreshIcon.classList.add('spinning');
        
        stocks.forEach(stock => {
            const card = document.getElementById(`card-${stock.code}`);
            if (card) card.classList.add('loading');
        });
        
        const promises = stocks.map(stock => {
            return new Promise((resolve) => {
                const baseUrlClean = apiBaseUrl.replace(/\/$/, '');
                fetch(`${baseUrlClean}/api/stock?code=${stock.code}`)
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);
                        return res.json();
                    })
                    .then(data => {
                        fetchedData[stock.code] = data;
                        renderSuccessCard(stock.code, data);
                    })
                    .catch(err => {
                        console.error(`Refresh error for ${stock.code}:`, err);
                        renderErrorCard(stock.code, 'データ取得エラー');
                    })
                    .finally(() => {
                        const card = document.getElementById(`card-${stock.code}`);
                        if (card) card.classList.remove('loading');
                        resolve();
                    });
            });
        });

        Promise.all(promises).then(() => {
            updateSummary();
            if (elements.refreshIcon) {
                setTimeout(() => elements.refreshIcon.classList.remove('spinning'), 500);
            }
        });
    }

    function updateEmptyStateVisibility() {
        if (!elements.emptyState || !elements.stockCardsContainer) return;
        if (stocks.length === 0) {
            elements.emptyState.style.display = 'block';
            elements.stockCardsContainer.style.display = 'none';
        } else {
            elements.emptyState.style.display = 'none';
            elements.stockCardsContainer.style.display = 'grid';
        }
    }

    function updateSummary() {
        if (!elements.statCount || !elements.statAverageYield) return;
        
        const count = stocks.length;
        elements.statCount.textContent = `${count} 銘柄`;

        if (count === 0) {
            elements.statAverageYield.textContent = '0.00 %';
            return;
        }

        let sumYield = 0;
        stocks.forEach(stock => {
            if (stock.manualDividend !== null && fetchedData[stock.code]) {
                const price = parseFloat(fetchedData[stock.code].price) || 0;
                if (price > 0) {
                    sumYield += (stock.manualDividend / price) * 100;
                }
            } else if (fetchedData[stock.code]) {
                sumYield += parseFloat(fetchedData[stock.code].yield) || 0;
            }
        });
        const avg = sumYield / count;
        elements.statAverageYield.textContent = `${avg.toFixed(2)} %`;
    }

    // アプリ起動
    init();
});