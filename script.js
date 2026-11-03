// ============================================================
//  🎯 SUIVI D'OBJECTIFS & XP — script.js (version 3)
//  Nouveautés :
//   • Chaque objectif a un TITRE + une DESCRIPTION
//   • Sous-catégories imbriquées SANS limite de profondeur
//     (Catégorie > Paris > Musées > …)
//   • Migration automatique des anciennes données Supabase
// ============================================================
const SUPABASE_URL = 'https://gqjizrupxnpjzbhpnlby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdxaml6cnVweG5wanpiaHBubGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODMzOTQsImV4cCI6MjEwODg1OTM5NH0.oSyq9cgoAIAIah6d78FgkyBJ0xkHgAz9-wUy18It8VY';
const STORAGE_BUCKET = 'images'; // bucket Supabase Storage (public)

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------
// MODÈLE DE DONNÉES
//   data.categories = {
//     "Voyage": {                      ← catégorie (racine)
//       image: "…",                    ← optionnelle
//       objectives: [ {name, description, xp, completed, date, image} ],
//       children: {                     ← sous-catégories (récursif !)
//         "Paris": {
//           image: null, objectives: [],
//           children: {
//             "Musées": { image: null, objectives: [...], children: {} }
//           }
//         }
//       }
//     }
//   }
// ------------------------------------------------------------
let data = { categories: {
    "Sport": {
        image: "images/sport.png",
        objectives: [],
        children: {
            "Trail": {
                image: null,
                objectives: [
                    { name: "Courir 10 km", description: "Un 10 km sur route, allure libre.", xp: 200, completed: false, date: null, image: "images/trail.png" },
                    { name: "Faire un trail de 20 km", description: "Trail nature avec dénivelé, en autonomie.", xp: 500, completed: false, date: null, image: "images/trail.png" }
                ],
                children: {}
            },
            "Natation": {
                image: null,
                objectives: [
                    { name: "Nager 1 km", description: "En continu, sans arrêt aux bassins.", xp: 150, completed: false, date: null, image: "images/natation.png" }
                ],
                children: {}
            }
        }
    },
    "Santé": {
        image: "images/sante.png",
        objectives: [],
        children: {
            "Alimentation": {
                image: null,
                objectives: [
                    { name: "Manger 5 fruits par jour", description: "Cinq portions de fruits ou légumes chaque jour.", xp: 100, completed: false, date: null, image: "images/fruits.png" }
                ],
                children: {}
            }
        }
    }
}};

// État de navigation : chemin dans l'arbre, ex. ["Voyage", "Paris", "Musées"]
let currentPath = [];
let activeTab = 'categories';

// État d'ouverture du menu (nœuds ouverts/fermés à la main)
const uiExpanded = new Set();
const uiCollapsed = new Set();

// ============================================================
//  OUTILS
// ============================================================
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
}

function newEmptyNode() {
    return { image: null, objectives: [], children: {} };
}

// Renvoie le nœud correspondant à un chemin ["Catégorie", "Sous", "Sous-sous"]
function getNode(path) {
    if (path.length === 0) return null;
    let node = data.categories[path[0]];
    for (let i = 1; i < path.length && node; i++) {
        node = node.children ? node.children[path[i]] : null;
    }
    return node;
}

const pathKey = path => path.join('\u0001');

function samePath(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

function pathStartsWith(prefix, full) {
    return prefix.length <= full.length && prefix.every((v, i) => v === full[i]);
}

function isExpanded(path) {
    const k = pathKey(path);
    return (pathStartsWith(path, currentPath) || uiExpanded.has(k)) && !uiCollapsed.has(k);
}

// Parcourt récursivement tous les objectifs d'un nœud
function walkObjectives(node, fn) {
    if (!node) return;
    (node.objectives || []).forEach(fn);
    for (const child of Object.values(node.children || {})) walkObjectives(child, fn);
}

// ------------------------------------------------------------
//  MIGRATION des anciennes données (format v2 → v3)
//  L'ancien format plaçait les sous-catégories directement
//  dans la catégorie ; le nouveau utilise objectives/children.
// ------------------------------------------------------------
function migrateObjectives(list) {
    return (list || []).map(o => ({
        name: o.name || 'Objectif',
        description: o.description || '',
        xp: Number(o.xp) || 0,
        completed: !!o.completed,
        date: o.date || null,
        image: o.image || null
    }));
}

function migrateNode(node) {
    // Nouveau format déjà en place : on normalise juste les objectifs
    if (node && Array.isArray(node.objectives) && node.children && typeof node.children === 'object') {
        node.objectives = migrateObjectives(node.objectives);
        if (!('image' in node)) node.image = null;
        for (const [k, v] of Object.entries(node.children)) node.children[k] = migrateNode(v);
        return node;
    }
    // Ancien format : { image?, "Sous-catégorie": [objectifs], … }
    const fresh = newEmptyNode();
    for (const [key, value] of Object.entries(node || {})) {
        if (key === 'image' && typeof value === 'string') { fresh.image = value; continue; }
        if (Array.isArray(value)) {
            fresh.children[key] = { image: null, objectives: migrateObjectives(value), children: {} };
        }
    }
    return fresh;
}

function migrateData() {
    for (const name of Object.keys(data.categories)) {
        data.categories[name] = migrateNode(data.categories[name]);
    }
}

// ------------------------------------------------------------
//  NOTIFICATIONS TOAST
// ------------------------------------------------------------
function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '⛔', info: '💡' };
    el.innerHTML = `<span class="toast-icon">${icons[type] || '💡'}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add('hide');
        setTimeout(() => el.remove(), 400);
    }, 3200);
}

// ------------------------------------------------------------
//  FENÊTRES MODALES
// ------------------------------------------------------------
function showModal({ title, bodyHTML = '', confirmText = 'Valider', cancelText = 'Annuler', danger = false, onConfirm, onMount }) {
    return new Promise(resolve => {
        const overlay = document.getElementById('modal-overlay');
        const box = document.getElementById('modal-box');
        box.innerHTML = `
            <h3>${escapeHtml(title)}</h3>
            <div class="modal-body">${bodyHTML}</div>
            <div class="modal-actions">
                ${cancelText ? `<button class="btn btn-ghost" id="modal-cancel">${escapeHtml(cancelText)}</button>` : ''}
                <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${escapeHtml(confirmText)}</button>
            </div>`;
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('visible'));

        let closed = false;
        function close(value) {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey);
            overlay.removeEventListener('click', onOverlayClick);
            overlay.classList.remove('visible');
            setTimeout(() => { overlay.style.display = 'none'; }, 200);
            resolve(value);
        }

        const confirmBtn = document.getElementById('modal-confirm');
        let busy = false; // protège contre le double-clic
        confirmBtn.addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            const result = onConfirm ? await onConfirm() : true;
            busy = false;
            if (result === false) return;
            close(result);
        });
        const cancelBtn = document.getElementById('modal-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', () => close(null));
        const onOverlayClick = (e) => { if (e.target === overlay) close(null); };
        overlay.addEventListener('click', onOverlayClick);

        function onKey(e) {
            if (e.key === 'Escape') close(null);
            else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.type !== 'file') {
                e.preventDefault();
                confirmBtn.click();
            }
        }
        document.addEventListener('keydown', onKey);

        const firstInput = box.querySelector('input, textarea');
        if (firstInput) setTimeout(() => { firstInput.focus(); firstInput.select && firstInput.select(); }, 60);

        // Défilement automatique vers la ligne surlignée (table des niveaux)
        const highlight = box.querySelector('.xp-row-current');
        if (highlight) setTimeout(() => highlight.scrollIntoView({ block: 'center' }), 150);

        if (onMount) onMount(box);
    });
}

async function showConfirm(title, message, { confirmText = 'Supprimer' } = {}) {
    const ok = await showModal({
        title,
        bodyHTML: `<p>${escapeHtml(message)}</p>`,
        confirmText,
        danger: true
    });
    return ok === true;
}

async function showPrompt(title, { label = '', value = '', placeholder = '', type = 'text', allowEmpty = false } = {}) {
    const labelHTML = label ? `<label>${escapeHtml(label)}</label>` : '';
    const result = await showModal({
        title,
        bodyHTML: labelHTML + `<input type="${type}" id="modal-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`,
        confirmText: 'Valider',
        onConfirm: () => {
            const v = document.getElementById('modal-input').value.trim();
            if (!v && !allowEmpty) { toast('Le champ ne peut pas être vide.', 'error'); return false; }
            return v;
        }
    });
    return result;
}

// ------------------------------------------------------------
//  ENVOI D'IMAGES VERS SUPABASE STORAGE
// ------------------------------------------------------------
async function uploadImage(file) {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext) ? ext : 'png';
    const path = `categories/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return urlData.publicUrl;
}

// ============================================================
//  CONNEXION / DÉCONNEXION
// ============================================================
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { toast("Entre ton email et ton mot de passe.", 'error'); return; }

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { toast('Connexion échouée : ' + error.message, 'error'); return; }

    document.getElementById('login-overlay').classList.remove('visible');
    setTimeout(() => { document.getElementById('login-overlay').style.display = 'none'; }, 200);
    await init();
}

async function logout() {
    await sb.auth.signOut();
    location.reload();
}

async function refreshAuthUI() {
    const { data: { user } } = await sb.auth.getUser();
    const el = document.getElementById('user-email');
    if (el && user) el.textContent = user.email;
}

// ============================================================
//  CHARGEMENT / SAUVEGARDE (Supabase)
// ============================================================
async function loadData() {
    const { data: rows, error } = await sb
        .from('app_data')
        .select('data')
        .limit(1);

    if (error) {
        toast('Impossible de charger les données : ' + error.message, 'error');
        migrateData();
        return;
    }

    let migratedFromLocal = false;

    if (rows && rows.length > 0 && rows[0].data && Object.keys(rows[0].data).length > 0) {
        data = rows[0].data;
    } else {
        // Première visite : migration de l'ancien localStorage (une seule fois)
        const savedData = localStorage.getItem('objectivesData');
        if (savedData) {
            data = JSON.parse(savedData);
            migratedFromLocal = true;
        }
    }

    migrateData(); // convertit l'ancien format vers l'arborescence, sans rien perdre
    if (migratedFromLocal) await saveData();
}

async function saveData() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { toast('Non connecté : sauvegarde impossible.', 'error'); return; }

    const { error } = await sb
        .from('app_data')
        .upsert(
            { user_id: user.id, data: data, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
        );

    if (error) toast('Erreur lors de la sauvegarde : ' + error.message, 'error');
}

// ============================================================
//  XP ET NIVEAU
// ============================================================
function calculateXPAndLevel() {
    let totalXP = 0;
    for (const root of Object.values(data.categories)) {
        walkObjectives(root, o => { if (o.completed) totalXP += o.xp; });
    }

    let level = 1;
    let currentThreshold = 0;
    let nextThreshold = 0;
    for (let lvl = 2; lvl <= 201; lvl++) {
        const threshold = (lvl === 2 ? 0 : currentThreshold) + Math.floor(50 + (lvl * 2));
        if (totalXP >= threshold) { level = lvl; currentThreshold = threshold; }
        else { nextThreshold = threshold; break; }
    }

    const xpRemaining = nextThreshold > 0 ? nextThreshold - totalXP : 0;
    const span = nextThreshold > 0 ? nextThreshold - currentThreshold : 1;
    const progress = nextThreshold > 0
        ? Math.min(100, Math.round(((totalXP - currentThreshold) / span) * 100))
        : 100;

    return { totalXP, level, xpForNextLevel: nextThreshold, xpRemaining, progress };
}

function updateXPSummary() {
    const { totalXP, level, xpRemaining, progress } = calculateXPAndLevel();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('total-xp', totalXP);
    set('level', level);
    set('xp-to-next-level', xpRemaining > 0 ? `${xpRemaining} XP avant le niveau ${level + 1}` : 'Niveau max atteint ! 🏆');
    const fill = document.getElementById('level-progress-fill');
    if (fill) fill.style.width = progress + '%';
    const lvlText = document.getElementById('level-progress-text');
    if (lvlText) lvlText.textContent = progress + ' %';
}

// Statistiques d'un nœud (objectifs récursifs, toutes profondeurs)
function nodeStats(node) {
    let totalXP = 0, completedXP = 0, total = 0, done = 0;
    walkObjectives(node, o => {
        total++;
        totalXP += o.xp;
        if (o.completed) { done++; completedXP += o.xp; }
    });
    return { totalXP, completedXP, total, done, percentage: totalXP > 0 ? Math.round((completedXP / totalXP) * 100) : 0 };
}

// En-tête commun à toutes les vues. titleHTML accepte du HTML
// (utilisé pour le fil d'Ariane Catégorie › Sous › Sous-sous).
function headerHTML(titleHTML, { back = false } = {}) {
    return `
        <div class="header">
            <div class="header-title">
                ${back ? '<button class="btn btn-ghost back-btn" id="back-btn" title="Retour">←</button>' : ''}
                <h2>${titleHTML}</h2>
            </div>
            <div class="xp-summary">
                <span class="xp-pill">⚡ XP Total&nbsp;: <strong id="total-xp">0</strong></span>
                <span class="xp-pill level-pill">🏅 Niveau&nbsp;: <strong id="level">1</strong></span>
                <div class="level-progress">
                    <div class="progress-bar slim"><div class="progress-fill" id="level-progress-fill"></div></div>
                    <span class="level-progress-label"><span id="xp-to-next-level"></span> · <span id="level-progress-text"></span></span>
                </div>
                <button class="btn btn-ghost btn-xp-table" id="btn-xp-table" title="Voir la table des niveaux (1 à 200)">Niveaux</button>
            </div>
        </div>`;
}

// ------------------------------------------------------------
//  Table des niveaux (1 à 200)
// ------------------------------------------------------------
async function showXPTable() {
    const { level: currentLevel } = calculateXPAndLevel();
    let cumulative = 0;
    let rowsHTML = '';
    for (let lvl = 1; lvl <= 200; lvl++) {
        const step = lvl === 1 ? 0 : Math.floor(50 + (lvl * 2)); // XP pour passer du niveau précédent à celui-ci
        if (lvl >= 2) cumulative += step;
        rowsHTML += `<tr${lvl === currentLevel ? ' class="xp-row-current"' : ''}>
            <td>Niveau ${lvl}</td>
            <td>${lvl === 1 ? '—' : '+' + step}</td>
            <td>${cumulative}</td>
        </tr>`;
    }
    await showModal({
        title: 'Table des niveaux (1 → 200)',
        bodyHTML: `
            <div class="xp-table-wrap">
                <table class="xp-table">
                    <thead>
                        <tr><th>Niveau</th><th>XP pour y arriver</th><th>XP totale</th></tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
            <div class="xp-table-nav">
                <button class="btn btn-ghost" id="xp-top">↑ Haut du tableau</button>
                <button class="btn btn-ghost" id="xp-mine">↓ Mon niveau</button>
            </div>
            <p class="modal-hint">💡 Tu es actuellement au niveau ${currentLevel} — la ligne est surlignée. Le tableau se déroule à l'intérieur du cadre.</p>`,
        confirmText: 'Fermer',
        cancelText: null,
        onMount: (box) => {
            const wrap = box.querySelector('.xp-table-wrap');
            box.querySelector('#xp-top').addEventListener('click', () => {
                wrap.scrollTo({ top: 0, behavior: 'smooth' });
            });
            box.querySelector('#xp-mine').addEventListener('click', () => {
                const row = box.querySelector('.xp-row-current');
                if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    });
}

// ============================================================
//  NAVIGATION
// ============================================================
function setTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.tab-button').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
    });
}

function switchTab(tabName) {
    setTab(tabName);
    if (tabName === 'summary') renderSummaryView();
    else renderMain();
}

function renderMain() {
    // Sécurité : si le chemin pointe vers des nœuds disparus, on remonte
    while (currentPath.length > 0 && !getNode(currentPath)) {
        currentPath = currentPath.slice(0, -1);
    }
    if (currentPath.length === 0) renderHomeView();
    else renderNodeView();
}

function refreshAll() {
    renderSidebar();
    if (activeTab === 'summary') renderSummaryView();
    else renderMain();
}

// ============================================================
//  VUE 1 — Accueil (grille des catégories)
// ============================================================
function buildCategoryCard(category) {
    const root = data.categories[category];
    const { totalXP, completedXP, percentage } = nodeStats(root);
    const card = document.createElement('div');
    card.className = 'category-card';

    const imageUrl = root.image;
    const visual = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="" class="category-image" onerror="this.remove()">`
        : `<div class="category-image category-placeholder">${escapeHtml(category.charAt(0).toUpperCase())}</div>`;

    card.innerHTML = `
        <div class="category-image-container">${visual}</div>
        <div class="category-card-body">
            <h3>${escapeHtml(category)}</h3>
            <div class="progress-container">
                <div class="progress-bar"><div class="progress-fill" style="width:${percentage}%"></div></div>
                <span>${completedXP} / ${totalXP} XP · ${percentage}&nbsp;%</span>
            </div>
        </div>`;

    card.addEventListener('click', () => {
        currentPath = [category];
        setTab('categories');
        renderMain();
        renderSidebar();
    });
    return card;
}

function renderHomeView() {
    const main = document.querySelector('.main');
    const nb = Object.keys(data.categories).length;
    main.innerHTML = headerHTML('Catégories') + `
        <div class="categories-grid" id="categories-grid"></div>
        <p class="hint">${nb === 0
            ? '👋 Bienvenue ! Crée ta première catégorie dans le menu à gauche.'
            : '💡 Astuce : clique sur une carte pour l\'explorer, ou déplie l\'arborescence dans le menu.'}</p>`;

    const grid = document.getElementById('categories-grid');
    for (const category of Object.keys(data.categories)) {
        grid.appendChild(buildCategoryCard(category));
    }
    updateXPSummary();
}

// ============================================================
//  VUE 2 — N'importe quel niveau de l'arbre
//  (catégorie, sous-catégorie, sous-sous-catégorie, …)
//  Affiche : fil d'Ariane, sous-catégories enfants,
//  objectifs (titre + description), et formulaires d'ajout.
// ============================================================
function renderNodeView() {
    const path = currentPath;
    const node = getNode(path);
    if (!node) { currentPath = []; renderHomeView(); return; }

    const isCategory = path.length === 1;
    const childrenNames = Object.keys(node.children);

    // Fil d'Ariane cliquable : Voyage › Paris › Musées
    const crumbs = path.map((seg, i) =>
        `<span class="crumb${i === path.length - 1 ? ' crumb-current' : ''}" data-depth="${i}">${escapeHtml(seg)}</span>`
    ).join('<span class="crumb-sep">›</span>');

    const main = document.querySelector('.main');
    main.innerHTML = headerHTML(`<span class="crumbs">${crumbs}</span>`, { back: true }) + `
        <div class="category-toolbar">
            ${isCategory ? `<button class="btn btn-ghost" id="btn-edit-image">🖼️ Changer l'image</button>` : ''}
            <button class="btn btn-ghost" id="btn-rename-node">✏️ Renommer</button>
            <button class="btn btn-danger-ghost" id="btn-delete-node">🗑️ Supprimer</button>
        </div>
        <div class="subcategories-summary" id="children-summary"></div>
        <div class="objectives" id="objectives"></div>
        <div class="card-form">
            <h3>Nouvel objectif</h3>
            <div class="form-row">
                <input type="text" id="new-objective" placeholder="Titre de l'objectif" maxlength="100">
                <input type="number" id="new-xp" placeholder="XP" min="0" max="1000" value="100">
                <button class="btn btn-primary" id="btn-add-objective">Ajouter</button>
            </div>
            <div class="form-row">
                <input type="text" id="new-objective-desc" placeholder="📝 Description (optionnelle)">
            </div>
            <div class="form-row">
                <input type="text" id="new-objective-image" placeholder="🖼️ URL de l'image (optionnel)">
            </div>
        </div>
        <div class="card-form">
            <h3>Nouvelle sous-catégorie</h3>
            <div class="form-row">
                <input type="text" id="new-subcategory" placeholder="Ex. : Musées, Restaurants…" maxlength="50">
                <button class="btn btn-primary" id="btn-add-subcategory">Ajouter</button>
            </div>
        </div>`;

    // ---- Cartes des sous-catégories enfants ----
    const childrenSummary = document.getElementById('children-summary');
    for (const childName of childrenNames) {
        const child = node.children[childName];
        const stats = nodeStats(child);
        const hasSubChildren = Object.keys(child.children).length > 0;

        const card = document.createElement('div');
        card.className = 'subcategory-card';
        card.innerHTML = `
            <div class="subcategory-card-head">
                <h4>${escapeHtml(childName)}${hasSubChildren ? ' <span class="subtree-badge">📂</span>' : ''}</h4>
                <div class="header-actions">
                    <button class="icon-btn edit" title="Renommer">✏️</button>
                    <button class="icon-btn delete" title="Supprimer">🗑️</button>
                </div>
            </div>
            <div class="progress-container">
                <div class="progress-bar"><div class="progress-fill" style="width:${stats.percentage}%"></div></div>
                <span>${stats.completedXP} / ${stats.totalXP} XP · ${stats.percentage}&nbsp;% · ${stats.done}/${stats.total} objectifs</span>
            </div>`;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.icon-btn')) return;
            currentPath = [...path, childName];
            renderMain();
            renderSidebar();
        });
        card.querySelector('.edit').addEventListener('click', (e) => { e.stopPropagation(); renameNode([...path, childName]); });
        card.querySelector('.delete').addEventListener('click', (e) => { e.stopPropagation(); deleteNode([...path, childName]); });
        childrenSummary.appendChild(card);
    }
    if (childrenNames.length === 0) {
        childrenSummary.innerHTML = '<p class="hint">Aucune sous-catégorie ici — et bonne nouvelle : chaque sous-catégorie peut elle-même contenir des sous-catégories, sans limite de profondeur.</p>';
    }

    // ---- Objectifs (titre + description) ----
    const list = document.getElementById('objectives');
    node.objectives.forEach((objective, index) => {
        const el = document.createElement('div');
        el.className = `objective ${objective.completed ? 'completed' : ''}`;
        const imageHTML = objective.image
            ? `<img src="${escapeHtml(objective.image)}" alt="" class="objective-image" onerror="this.remove()">`
            : '';
        const descHTML = objective.description
            ? `<span class="objective-desc">${escapeHtml(objective.description)}</span>`
            : '';
        el.innerHTML = `
            ${imageHTML}
            <div class="objective-text">
                <span class="objective-name">${escapeHtml(objective.name)} <span class="xp-tag">+${objective.xp}&nbsp;XP</span></span>
                ${descHTML}
                ${objective.completed ? `<span class="completed-date">✅ Complété le ${escapeHtml(objective.date || '?')}</span>` : ''}
            </div>
            <div class="objective-actions">
                <button class="icon-btn edit" title="Modifier">✏️</button>
                <button class="icon-btn complete" title="${objective.completed ? 'Remettre en non terminé' : 'Marquer comme complété'}">${objective.completed ? '↩️' : '✅'}</button>
                <button class="icon-btn delete" title="Supprimer">🗑️</button>
            </div>`;
        el.querySelector('.complete').addEventListener('click', () => completeObjective(path, index));
        el.querySelector('.delete').addEventListener('click', () => deleteObjective(path, index));
        el.querySelector('.edit').addEventListener('click', () => editObjective(path, index));
        list.appendChild(el);
    });
    if (node.objectives.length === 0) {
        list.innerHTML = '<p class="hint">Aucun objectif à ce niveau — ajoute le premier ci-dessous.</p>';
    }

    // ---- Boutons de la vue ----
    document.getElementById('back-btn').addEventListener('click', () => {
        currentPath = path.slice(0, -1);
        renderMain();
        renderSidebar();
    });
    document.getElementById('btn-rename-node').addEventListener('click', () => renameNode(path));
    document.getElementById('btn-delete-node').addEventListener('click', () => deleteNode(path));
    const imgBtn = document.getElementById('btn-edit-image');
    if (imgBtn) imgBtn.addEventListener('click', () => editCategoryImage(path[0]));

    // Fil d'Ariane : remonter à un ancêtre
    main.querySelectorAll('.crumb').forEach(crumb => {
        crumb.addEventListener('click', () => {
            currentPath = path.slice(0, Number(crumb.dataset.depth) + 1);
            renderMain();
            renderSidebar();
        });
    });

    // ---- Formulaires ----
    const subInput = document.getElementById('new-subcategory');
    document.getElementById('btn-add-subcategory').addEventListener('click', () => addChild(path, subInput.value));
    subInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addChild(path, subInput.value); });

    const objInput = document.getElementById('new-objective');
    const descInput = document.getElementById('new-objective-desc');
    const xpInput = document.getElementById('new-xp');
    const imgInput = document.getElementById('new-objective-image');
    const submitObjective = () => addObjective(path, objInput.value, descInput.value, xpInput.value, imgInput.value);
    document.getElementById('btn-add-objective').addEventListener('click', submitObjective);
    [objInput, descInput, xpInput, imgInput].forEach(input => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitObjective(); }));

    updateXPSummary();
}

// ============================================================
//  VUE 3 — Synthèse globale
// ============================================================
function renderSummaryView() {
    let totalObjectives = 0, completedObjectives = 0, totalXPAll = 0, completedXPAll = 0;
    for (const root of Object.values(data.categories)) {
        walkObjectives(root, o => {
            totalObjectives++;
            totalXPAll += o.xp;
            if (o.completed) { completedObjectives++; completedXPAll += o.xp; }
        });
    }
    const pct = totalXPAll > 0 ? Math.round((completedXPAll / totalXPAll) * 100) : 0;
    const { level } = calculateXPAndLevel();

    const main = document.querySelector('.main');
    main.innerHTML = headerHTML('Synthèse globale') + `
        <div class="stats-row">
            <div class="stat-card"><span class="stat-value">${completedXPAll}</span><span class="stat-label">XP gagnés</span></div>
            <div class="stat-card"><span class="stat-value">${completedObjectives}/${totalObjectives}</span><span class="stat-label">Objectifs complétés</span></div>
            <div class="stat-card"><span class="stat-value">${pct}&nbsp;%</span><span class="stat-label">Progression globale</span></div>
            <div class="stat-card"><span class="stat-value">${level}</span><span class="stat-label">Niveau</span></div>
        </div>
        <div class="categories-grid" id="categories-grid"></div>`;

    const grid = document.getElementById('categories-grid');
    for (const category of Object.keys(data.categories)) {
        grid.appendChild(buildCategoryCard(category));
    }
    updateXPSummary();
}

// ============================================================
//  MENU LATÉRAL — arborescence récursive
//  Chaque nœud : [▼] Nom  ➕ ✏️ 🗑️
// ============================================================
function renderSidebar() {
    const container = document.getElementById('categories');
    if (!container) return;
    container.innerHTML = '';
    for (const name of Object.keys(data.categories)) {
        renderSidebarNode(name, [name], 0, container);
    }
}

function renderSidebarNode(name, path, depth, parentEl) {
    const node = getNode(path);
    if (!node) return;

    const hasChildren = Object.keys(node.children).length > 0;
    const selected = samePath(path, currentPath);
    const expanded = hasChildren && isExpanded(path);

    const wrap = document.createElement('div');
    wrap.className = 'category' + (depth > 0 ? ' nested' : '') + (expanded ? '' : ' collapsed');

    const header = document.createElement('div');
    header.className = 'category-header' + (selected ? ' selected' : '');
    header.innerHTML = `
        <span class="node-title">
            <span class="icon" style="${hasChildren ? '' : 'visibility:hidden'}">▼</span>
            <h3>${escapeHtml(name)}</h3>
        </span>
        <div class="header-actions">
            <button class="icon-btn add" title="Nouvelle sous-catégorie">➕</button>
            <button class="icon-btn edit" title="Renommer">✏️</button>
            <button class="icon-btn delete" title="Supprimer">🗑️</button>
        </div>`;

    header.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-btn');
        if (btn) {
            e.stopPropagation();
            if (btn.classList.contains('add')) {
                // Navigation + focus sur le formulaire de création
                uiCollapsed.delete(pathKey(path));
                currentPath = path.slice();
                setTab('categories');
                renderMain();
                renderSidebar();
                const input = document.getElementById('new-subcategory');
                if (input) input.focus();
            } else if (btn.classList.contains('edit')) {
                renameNode(path);
            } else if (btn.classList.contains('delete')) {
                deleteNode(path);
            }
            return;
        }
        // La flèche ▼ ouvre/ferme sans naviguer
        if (e.target.closest('.icon')) {
            e.stopPropagation();
            const k = pathKey(path);
            if (isExpanded(path)) { uiCollapsed.add(k); uiExpanded.delete(k); }
            else { uiExpanded.add(k); uiCollapsed.delete(k); }
            renderSidebar();
            return;
        }
        // Clic sur le nom : navigation + ouverture
        e.stopPropagation();
        uiCollapsed.delete(pathKey(path));
        currentPath = path.slice();
        setTab('categories');
        renderMain();
        renderSidebar();
    });

    const childrenWrap = document.createElement('div');
    childrenWrap.className = 'subcategories';
    for (const childName of Object.keys(node.children)) {
        renderSidebarNode(childName, [...path, childName], depth + 1, childrenWrap);
    }

    wrap.appendChild(header);
    wrap.appendChild(childrenWrap);
    parentEl.appendChild(wrap);
}

// ============================================================
//  OPÉRATIONS — CATÉGORIES ET SOUS-CATÉGORIES (tout niveau)
// ============================================================
async function addCategory(value) {
    const name = (value || '').trim();
    if (!name) { toast('Donne un nom à ta catégorie.', 'error'); return; }
    if (data.categories[name]) { toast('Cette catégorie existe déjà.', 'error'); return; }

    data.categories[name] = newEmptyNode();
    const input = document.getElementById('new-category');
    if (input) input.value = '';
    await saveData();
    refreshAll();
    toast(`Catégorie « ${name} » créée 🎉`, 'success');
}

// Ajoute une sous-catégorie dans le nœud courant — à TOUT niveau
async function addChild(path, value) {
    const node = getNode(path);
    if (!node) return;
    const name = (value || '').trim();
    if (!name) { toast('Donne un nom à ta sous-catégorie.', 'error'); return; }
    if (node.children[name]) { toast('Ce nom existe déjà ici.', 'error'); return; }

    node.children[name] = newEmptyNode();
    await saveData();
    renderSidebar();
    renderMain();
    toast(`Sous-catégorie « ${name} » créée 🎉`, 'success');
}

// Renomme un nœud à n'importe quel niveau
async function renameNode(path) {
    const oldName = path[path.length - 1];
    const isCategory = path.length === 1;
    const newName = await showPrompt(isCategory ? 'Renommer la catégorie' : 'Renommer la sous-catégorie', {
        label: 'Nouveau nom',
        value: oldName,
        placeholder: oldName
    });
    if (!newName || newName === oldName) return;

    const parent = isCategory ? data.categories : getNode(path.slice(0, -1)).children;
    if (parent[newName]) { toast('Ce nom existe déjà ici.', 'error'); return; }

    // On reconstruit l'objet pour conserver l'ordre
    const rebuilt = Object.fromEntries(
        Object.entries(parent).map(([k, v]) => [k === oldName ? newName : k, v])
    );
    if (isCategory) data.categories = rebuilt;
    else getNode(path.slice(0, -1)).children = rebuilt;

    currentPath = [...path.slice(0, -1), newName];
    await saveData();
    refreshAll();
    toast('Renommé ✨', 'success');
}

// Supprime un nœud (et toute sa descendance)
async function deleteNode(path) {
    const name = path[path.length - 1];
    const isCategory = path.length === 1;
    const ok = await showConfirm(
        isCategory ? 'Supprimer la catégorie' : 'Supprimer la sous-catégorie',
        `Supprimer « ${name} » et tout son contenu (sous-catégories et objectifs) ? Cette action est irréversible.`
    );
    if (!ok) return;

    if (isCategory) {
        delete data.categories[name];
    } else {
        const parentChildren = getNode(path.slice(0, -1)).children;
        delete parentChildren[name];
    }

    // Si on se trouvait dans la branche supprimée, on remonte au parent
    if (pathStartsWith(path, currentPath)) {
        currentPath = path.slice(0, -1);
    }
    await saveData();
    refreshAll();
    toast('Supprimé', 'success');
}

// ------------------------------------------------------------
//  Image d'une catégorie (upload Supabase Storage ou URL)
// ------------------------------------------------------------
async function editCategoryImage(category) {
    const current = data.categories[category].image || '';
    const result = await showModal({
        title: '🖼️ Image de la catégorie',
        bodyHTML: `
            <p class="modal-hint">Choisis une image depuis ton appareil (envoyée dans Supabase Storage) ou colle une URL. Laisse tout vide pour retirer l'image.</p>
            <label>Depuis ton appareil</label>
            <input type="file" id="modal-file" accept="image/*">
            <label>Ou par URL</label>
            <input type="text" id="modal-url" placeholder="https://… ou images/mon-image.png" value="${escapeHtml(current)}">`,
        confirmText: 'Enregistrer',
        onConfirm: async () => {
            const file = document.getElementById('modal-file').files[0];
            const url = document.getElementById('modal-url').value.trim();
            try {
                if (file) return { image: await uploadImage(file) };
                return { image: url || null };
            } catch (err) {
                toast('Envoi impossible : ' + err.message, 'error');
                return false;
            }
        }
    });
    if (!result) return;

    data.categories[category].image = result.image;
    await saveData();
    refreshAll();
    toast('Image mise à jour 🖼️', 'success');
}

// ============================================================
//  OPÉRATIONS — OBJECTIFS (titre + description)
// ============================================================
async function addObjective(path, nameValue, descValue, xpValue, imageValue) {
    const node = getNode(path);
    if (!node) return;

    const name = (nameValue || '').trim();
    const description = (descValue || '').trim();
    const xp = parseInt(xpValue, 10);
    const image = (imageValue || '').trim() || null;

    if (!name || isNaN(xp) || xp < 0 || xp > 1000) {
        toast('Champs invalides : titre obligatoire, XP entre 0 et 1000.', 'error');
        return;
    }

    node.objectives.push({ name, description, xp, completed: false, date: null, image });
    await saveData();
    renderNodeView();
    toast('Objectif ajouté 🎯', 'success');
}

async function editObjective(path, index) {
    const node = getNode(path);
    const o = node.objectives[index];
    const result = await showModal({
        title: "Modifier l'objectif",
        bodyHTML: `
            <label>Titre</label>
            <input type="text" id="edit-obj-name" value="${escapeHtml(o.name)}" maxlength="100">
            <label>Description</label>
            <textarea id="edit-obj-desc" maxlength="500">${escapeHtml(o.description || '')}</textarea>
            <label>XP (0 à 1000)</label>
            <input type="number" id="edit-obj-xp" value="${o.xp}" min="0" max="1000">`,
        confirmText: 'Enregistrer',
        onConfirm: () => {
            const name = document.getElementById('edit-obj-name').value.trim();
            const description = document.getElementById('edit-obj-desc').value.trim();
            const xp = parseInt(document.getElementById('edit-obj-xp').value, 10);
            if (!name || isNaN(xp) || xp < 0 || xp > 1000) {
                toast('Champs invalides (XP entre 0 et 1000).', 'error');
                return false;
            }
            return { name, description, xp };
        }
    });
    if (!result) return;

    o.name = result.name;
    o.description = result.description;
    o.xp = result.xp;
    await saveData();
    renderNodeView();
    toast('Objectif modifié ✨', 'success');
}

async function completeObjective(path, index) {
    const node = getNode(path);
    const o = node.objectives[index];

    if (o.completed) {
        const ok = await showConfirm('Annuler la complétion', `Remettre « ${o.name} » en non terminé (l'XP sera retirée) ?`, { confirmText: 'Annuler la complétion' });
        if (!ok) return;
        o.completed = false;
        o.date = null;
        await saveData();
        renderNodeView();
        toast('Objectif remis en cours', 'info');
        return;
    }

    const date = await showPrompt('Date de réalisation', {
        label: 'Quand as-tu atteint cet objectif ?',
        type: 'date',
        value: new Date().toISOString().split('T')[0]
    });
    if (!date) return;

    o.completed = true;
    o.date = date;
    await saveData();
    renderNodeView();
    toast(`+${o.xp} XP — bravo ! 🎉`, 'success');
}

async function deleteObjective(path, index) {
    const node = getNode(path);
    const o = node.objectives[index];
    const ok = await showConfirm("Supprimer l'objectif", `Supprimer « ${o.name} » ?`);
    if (!ok) return;

    node.objectives.splice(index, 1);
    await saveData();
    renderNodeView();
    toast('Objectif supprimé', 'success');
}

// ============================================================
//  DÉMARRAGE
// ============================================================
async function init() {
    await loadData();
    renderSidebar();
    setTab('categories');
    renderMain();
    updateXPSummary();
    refreshAuthUI();
}

let staticUIWired = false;
function wireStaticUI() {
    if (staticUIWired) return;
    staticUIWired = true;

    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    const catInput = document.getElementById('new-category');
    document.getElementById('btn-add-category').addEventListener('click', () => addCategory(catInput.value));
    catInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCategory(catInput.value); });

    document.getElementById('btn-logout').addEventListener('click', logout);

    // Bouton "Niveaux" : présent dans toutes les vues (contenu régénéré),
    // on branche donc un seul écouteur global sur le document.
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-xp-table')) showXPTable();
    });

    document.getElementById('btn-login').addEventListener('click', login);
    document.getElementById('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    document.getElementById('login-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('login-password').focus(); });
}

window.onload = async function () {
    wireStaticUI();

    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        await init();
    } else {
        const overlay = document.getElementById('login-overlay');
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('visible'));
    }
};
