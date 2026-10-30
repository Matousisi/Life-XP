// ============================================================
//  🎯 SUIVI D'OBJECTIFS & XP — script.js (version 2)
//  Corrections : accès aux catégories, clé "image" qui cassait
//  tout, apostrophes dans les noms, bouton ✏️ pour renommer,
//  envoi d'images vers Supabase Storage, design modernisé.
// ============================================================
const SUPABASE_URL = 'https://gqjizrupxnpjzbhpnlby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdxaml6cnVweG5wanpiaHBubGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODMzOTQsImV4cCI6MjEwODg1OTM5NH0.oSyq9cgoAIAIah6d78FgkyBJ0xkHgAz9-wUy18It8VY';
const STORAGE_BUCKET = 'images'; // nom du bucket Supabase Storage (à créer une fois, public)

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Données initiales de démonstration (utilisées uniquement si
// rien n'est trouvé dans le cloud ni dans localStorage).
let data = {
    categories: {
        "Sport": {
            image: "images/sport.png",
            "Trail": [
                { name: "Courir 10 km", xp: 200, completed: false, date: null, image: "images/trail.png" },
                { name: "Faire un trail de 20 km", xp: 500, completed: false, date: null, image: "images/trail.png" }
            ],
            "Natation": [
                { name: "Nager 1 km", xp: 150, completed: false, date: null, image: "images/natation.png" }
            ]
        },
        "Santé": {
            image: "images/sante.png",
            "Alimentation": [
                { name: "Manger 5 fruits par jour", xp: 100, completed: false, date: null, image: "images/fruits.png" }
            ]
        }
    }
};

// État de navigation
let currentCategory = null;
let currentSubCategory = null;
let activeTab = 'categories';

// ============================================================
//  OUTILS
// ============================================================

// 🔴 BUG CORRIGÉ : les noms contenant des apostrophes ou des
// guillemets ("Rock'n'roll", "Bien-être") cassaient les anciens
// onclick="...('...')". On n'utilise plus de onclick en dur :
// les boutons sont branchés en JavaScript (addEventListener).
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
}

// 🔴 BUG CORRIGÉ (cause du "je n'arrive plus à accéder") :
// dans data.categories, la clé "image" est une CHAÎNE et non
// un tableau d'objectifs. L'ancien code parcourait toutes les
// clés et appelait .forEach dessus → plantage silencieux.
// Cette fonction ne renvoie que les VRAIES sous-catégories.
function getSubCategories(category) {
    const subs = {};
    if (!data.categories[category]) return subs;
    for (const [key, value] of Object.entries(data.categories[category])) {
        if (Array.isArray(value)) subs[key] = value;
    }
    return subs;
}

// ------------------------------------------------------------
//  NOTIFICATIONS (remplacent alert() — plus moderne)
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
//  FENÊTRES MODALES (remplacent alert / confirm / prompt)
//  Chaque fonction renvoie une Promesse : on l'utilise avec await.
// ------------------------------------------------------------
function showModal({ title, bodyHTML = '', confirmText = 'Valider', cancelText = 'Annuler', danger = false, onConfirm }) {
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
        let busy = false; // protège contre le double-clic (pendant un envoi d'image par ex.)
        confirmBtn.addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            const result = onConfirm ? await onConfirm() : true;
            busy = false;
            if (result === false) return; // invalide : on laisse la modale ouverte
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

        // Focus automatique sur le premier champ
        const firstInput = box.querySelector('input, textarea');
        if (firstInput) setTimeout(() => { firstInput.focus(); firstInput.select && firstInput.select(); }, 60);

        // Défilement automatique vers la ligne surlignée (table des niveaux)
        const highlight = box.querySelector('.xp-row-current');
        if (highlight) setTimeout(() => highlight.scrollIntoView({ block: 'center' }), 150);
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
    return result; // texte saisi, ou null si annulé
}

// ------------------------------------------------------------
//  ENVOI D'IMAGES VERS SUPABASE STORAGE
//  (sujet 3) — nécessite un bucket public nommé "images"
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
        return;
    }

    if (rows && rows.length > 0 && rows[0].data && Object.keys(rows[0].data).length > 0) {
        data = rows[0].data;
        return;
    }

    // Première visite : migration de l'ancien localStorage (une seule fois)
    const savedData = localStorage.getItem('objectivesData');
    if (savedData) {
        data = JSON.parse(savedData);
        await saveData();
    }
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
    for (const category of Object.keys(data.categories)) {
        for (const objectives of Object.values(getSubCategories(category))) {
            objectives.forEach(o => { if (o.completed) totalXP += o.xp; });
        }
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

function categoryStats(category) {
    let totalXP = 0, completedXP = 0;
    for (const objectives of Object.values(getSubCategories(category))) {
        objectives.forEach(o => {
            totalXP += o.xp;
            if (o.completed) completedXP += o.xp;
        });
    }
    return { totalXP, completedXP, percentage: totalXP > 0 ? Math.round((completedXP / totalXP) * 100) : 0 };
}

// ------------------------------------------------------------
//  Table des niveaux (1 à 200) — affichée dans une modale
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
            <p class="modal-hint">💡 Tu es actuellement au niveau ${currentLevel} — la ligne est surlignée.</p>`,
        confirmText: 'Fermer',
        cancelText: null // simple consultation : pas de bouton "Annuler"
    });
}

// En-tête commun à toutes les vues (titre + XP + niveau)
function headerHTML(title, { back = false } = {}) {
    return `
        <div class="header">
            <div class="header-title">
                ${back ? '<button class="btn btn-ghost back-btn" id="back-btn" title="Retour">←</button>' : ''}
                <h2>${escapeHtml(title)}</h2>
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

// ============================================================
//  NAVIGATION ENTRE LES VUES
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
    // Sécurité : si l'état pointe vers des données disparues, on remet à zéro
    if (currentCategory && !data.categories[currentCategory]) { currentCategory = null; currentSubCategory = null; }
    if (currentCategory && currentSubCategory && !Array.isArray(data.categories[currentCategory][currentSubCategory])) {
        currentSubCategory = null;
    }
    if (currentCategory && currentSubCategory) renderSubCategoryView();
    else if (currentCategory) renderCategoryView();
    else renderHomeView();
}

function refreshAll() {
    renderCategories();
    if (activeTab === 'summary') renderSummaryView();
    else renderMain();
}

// ============================================================
//  VUE 1 — "Mes Catégories" (grille de cartes)
// ============================================================
function buildCategoryCard(category) {
    const { totalXP, completedXP, percentage } = categoryStats(category);
    const card = document.createElement('div');
    card.className = 'category-card';

    const imageUrl = data.categories[category].image;
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
        currentCategory = category;
        currentSubCategory = null;
        setTab('categories');
        renderMain();
        renderCategories();
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
            : '💡 Astuce : clique sur une carte pour voir ses sous-catégories, ou déplie une catégorie dans le menu.'}</p>`;

    const grid = document.getElementById('categories-grid');
    for (const category of Object.keys(data.categories)) {
        grid.appendChild(buildCategoryCard(category));
    }
    updateXPSummary();
}

// ============================================================
//  VUE 2 — Détail d'une catégorie (sous-catégories + création)
//  ✨ SUJET 1 : le formulaire de création de sous-catégorie
//  vit maintenant ICI, toujours accessible.
// ============================================================
function renderCategoryView() {
    const category = currentCategory;
    const subs = getSubCategories(category);

    const main = document.querySelector('.main');
    main.innerHTML = headerHTML(category, { back: true }) + `
        <div class="category-toolbar">
            <button class="btn btn-ghost" id="btn-edit-image">🖼️ Changer l'image</button>
            <button class="btn btn-ghost" id="btn-rename-category">✏️ Renommer</button>
            <button class="btn btn-danger-ghost" id="btn-delete-category">🗑️ Supprimer</button>
        </div>
        <div class="subcategories-summary" id="subcategories-summary"></div>
        <div class="card-form">
            <h3>➕ Nouvelle sous-catégorie</h3>
            <div class="form-row">
                <input type="text" id="new-subcategory" placeholder="Ex. : Trail, Natation…" maxlength="50">
                <button class="btn btn-primary" id="btn-add-subcategory">Ajouter</button>
            </div>
        </div>
        ${Object.keys(subs).length === 0 ? '<p class="hint">Aucune sous-catégorie pour le moment — crée la première ci-dessous !</p>' : ''}`;

    // Cartes des sous-catégories
    const summary = document.getElementById('subcategories-summary');
    for (const [sub, objectives] of Object.entries(subs)) {
        let t = 0, c = 0;
        objectives.forEach(o => { t += o.xp; if (o.completed) c += o.xp; });
        const pct = t > 0 ? Math.round((c / t) * 100) : 0;
        const nbDone = objectives.filter(o => o.completed).length;

        const card = document.createElement('div');
        card.className = 'subcategory-card';
        card.innerHTML = `
            <div class="subcategory-card-head">
                <h4>${escapeHtml(sub)}</h4>
                <div class="header-actions">
                    <button class="icon-btn edit" title="Renommer">✏️</button>
                    <button class="icon-btn delete" title="Supprimer">🗑️</button>
                </div>
            </div>
            <div class="progress-container">
                <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                <span>${c} / ${t} XP · ${pct}&nbsp;% · ${nbDone}/${objectives.length} objectifs</span>
            </div>`;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.icon-btn')) return;
            currentSubCategory = sub;
            renderMain();
            renderCategories();
        });
        card.querySelector('.edit').addEventListener('click', (e) => { e.stopPropagation(); renameSubCategory(category, sub); });
        card.querySelector('.delete').addEventListener('click', (e) => { e.stopPropagation(); deleteSubCategory(category, sub); });
        summary.appendChild(card);
    }

    // Boutons de la vue
    document.getElementById('back-btn').addEventListener('click', () => {
        currentCategory = null; currentSubCategory = null;
        renderMain(); renderCategories();
    });
    document.getElementById('btn-rename-category').addEventListener('click', () => renameCategory(category));
    document.getElementById('btn-edit-image').addEventListener('click', () => editCategoryImage(category));
    document.getElementById('btn-delete-category').addEventListener('click', () => deleteCategory(category));

    const subInput = document.getElementById('new-subcategory');
    document.getElementById('btn-add-subcategory').addEventListener('click', () => addSubCategory(subInput.value));
    subInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSubCategory(subInput.value); });

    updateXPSummary();
}

// ============================================================
//  VUE 3 — Détail d'une sous-catégorie (objectifs)
// ============================================================
function renderSubCategoryView() {
    const category = currentCategory;
    const sub = currentSubCategory;
    const objectives = data.categories[category][sub];

    const main = document.querySelector('.main');
    main.innerHTML = headerHTML(`${category} › ${sub}`, { back: true }) + `
        <div class="objectives" id="objectives"></div>
        <div class="card-form">
            <h3>➕ Nouvel objectif</h3>
            <div class="form-row">
                <input type="text" id="new-objective" placeholder="Ex. : Courir 10 km" maxlength="100">
                <input type="number" id="new-xp" placeholder="XP" min="0" max="1000" value="100">
                <button class="btn btn-primary" id="btn-add-objective">Ajouter</button>
            </div>
            <div class="form-row">
                <input type="text" id="new-objective-image" placeholder="🖼️ URL de l'image (optionnel)">
            </div>
        </div>`;

    const list = document.getElementById('objectives');
    objectives.forEach((objective, index) => {
        const el = document.createElement('div');
        el.className = `objective ${objective.completed ? 'completed' : ''}`;
        const imageHTML = objective.image
            ? `<img src="${escapeHtml(objective.image)}" alt="" class="objective-image" onerror="this.remove()">`
            : '';
        el.innerHTML = `
            ${imageHTML}
            <div class="objective-text">
                <span class="objective-name">${escapeHtml(objective.name)} <span class="xp-tag">+${objective.xp}&nbsp;XP</span></span>
                ${objective.completed ? `<span class="completed-date">✅ Complété le ${escapeHtml(objective.date || '?')}</span>` : ''}
            </div>
            <div class="objective-actions">
                <button class="icon-btn edit" title="Modifier">✏️</button>
                <button class="icon-btn complete" title="${objective.completed ? 'Remettre en non terminé' : 'Marquer comme complété'}">${objective.completed ? '↩️' : '✅'}</button>
                <button class="icon-btn delete" title="Supprimer">🗑️</button>
            </div>`;
        el.querySelector('.complete').addEventListener('click', () => completeObjective(category, sub, index));
        el.querySelector('.delete').addEventListener('click', () => deleteObjective(category, sub, index));
        el.querySelector('.edit').addEventListener('click', () => editObjective(category, sub, index));
        list.appendChild(el);
    });
    if (objectives.length === 0) list.innerHTML = '<p class="hint">Aucun objectif ici — ajoute le premier ci-dessous !</p>';

    document.getElementById('back-btn').addEventListener('click', () => {
        currentSubCategory = null;
        renderMain(); renderCategories();
    });

    const objInput = document.getElementById('new-objective');
    const xpInput = document.getElementById('new-xp');
    const imgInput = document.getElementById('new-objective-image');
    const submit = () => addObjective(objInput.value, xpInput.value, imgInput.value);
    document.getElementById('btn-add-objective').addEventListener('click', submit);
    [objInput, xpInput, imgInput].forEach(input => input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));

    updateXPSummary();
}

// ============================================================
//  VUE 4 — Synthèse globale (onglet 📊)
// ============================================================
function renderSummaryView() {
    let totalObjectives = 0, completedObjectives = 0, totalXPAll = 0, completedXPAll = 0;
    for (const category of Object.keys(data.categories)) {
        for (const objectives of Object.values(getSubCategories(category))) {
            objectives.forEach(o => {
                totalObjectives++;
                totalXPAll += o.xp;
                if (o.completed) { completedObjectives++; completedXPAll += o.xp; }
            });
        }
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
//  MENU LATÉRAL (accordéon)
//  ✨ SUJET 2 : bouton ✏️ pour renommer, à côté de 🗑️ et ➕.
// ============================================================
function renderCategories() {
    const container = document.getElementById('categories');
    if (!container) return;
    container.innerHTML = '';

    for (const [category] of Object.entries(data.categories)) {
        const categoryElement = document.createElement('div');
        categoryElement.className = 'category' + (currentCategory === category ? '' : ' collapsed');

        const header = document.createElement('div');
        header.className = 'category-header' + (currentCategory === category ? ' selected' : '');
        header.innerHTML = `
            <h3>${escapeHtml(category)}</h3>
            <div class="header-actions">
                <button class="icon-btn add" title="Nouvelle sous-catégorie">➕</button>
                <button class="icon-btn edit" title="Renommer">✏️</button>
                <button class="icon-btn delete" title="Supprimer">🗑️</button>
                <span class="icon">▼</span>
            </div>`;

        header.addEventListener('click', (e) => {
            const btn = e.target.closest('.icon-btn');
            if (btn) {
                e.stopPropagation();
                if (btn.classList.contains('add')) {
                    // ✨ SUJET 1 : accès direct à la création de sous-catégorie
                    currentCategory = category;
                    currentSubCategory = null;
                    setTab('categories');
                    renderMain();
                    renderCategories();
                    const input = document.getElementById('new-subcategory');
                    if (input) input.focus();
                } else if (btn.classList.contains('edit')) {
                    renameCategory(category);
                } else if (btn.classList.contains('delete')) {
                    deleteCategory(category);
                }
                return;
            }
            e.stopPropagation();
            const wasCollapsed = categoryElement.classList.contains('collapsed');
            container.querySelectorAll('.category').forEach(c => c.classList.add('collapsed'));
            if (wasCollapsed) {
                categoryElement.classList.remove('collapsed');
                currentCategory = category;
                currentSubCategory = null;
                setTab('categories');
                renderMain();
            } else if (currentCategory === category) {
                currentCategory = null;
                currentSubCategory = null;
                renderMain();
            }
            renderCategories();
        });

        const subsEl = document.createElement('div');
        subsEl.className = 'subcategories';
        for (const sub of Object.keys(getSubCategories(category))) {
            const subEl = document.createElement('div');
            subEl.className = 'subcategory' + (currentCategory === category && currentSubCategory === sub ? ' active' : '');
            subEl.innerHTML = `
                <span>${escapeHtml(sub)}</span>
                <div class="header-actions">
                    <button class="icon-btn edit" title="Renommer">✏️</button>
                    <button class="icon-btn delete" title="Supprimer">🗑️</button>
                </div>`;
            subEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.icon-btn');
                if (btn) {
                    e.stopPropagation();
                    if (btn.classList.contains('edit')) renameSubCategory(category, sub);
                    else if (btn.classList.contains('delete')) deleteSubCategory(category, sub);
                    return;
                }
                e.stopPropagation();
                currentCategory = category;
                currentSubCategory = sub;
                setTab('categories');
                renderMain();
                renderCategories();
            });
            subsEl.appendChild(subEl);
        }

        categoryElement.appendChild(header);
        categoryElement.appendChild(subsEl);
        container.appendChild(categoryElement);
    }
}

// ============================================================
//  OPÉRATIONS — CATÉGORIES
// ============================================================
async function addCategory(value) {
    const name = (value || '').trim();
    if (!name) { toast('Donne un nom à ta catégorie.', 'error'); return; }
    if (data.categories[name]) { toast('Cette catégorie existe déjà.', 'error'); return; }

    data.categories[name] = {};
    const input = document.getElementById('new-category');
    if (input) input.value = '';
    await saveData();
    refreshAll();
    toast(`Catégorie « ${name} » créée 🎉`, 'success');
}

async function renameCategory(category) {
    const newName = await showPrompt('Renommer la catégorie', { label: 'Nouveau nom', value: category, placeholder: category });
    if (!newName || newName === category) return;
    if (data.categories[newName]) { toast('Cette catégorie existe déjà.', 'error'); return; }

    // On reconstruit l'objet pour conserver l'ordre des catégories
    data.categories = Object.fromEntries(
        Object.entries(data.categories).map(([k, v]) => [k === category ? newName : k, v])
    );
    if (currentCategory === category) currentCategory = newName;
    await saveData();
    refreshAll();
    toast('Catégorie renommée ✨', 'success');
}

async function deleteCategory(category) {
    const ok = await showConfirm('Supprimer la catégorie', `Supprimer « ${category} » et toutes ses sous-catégories ? Cette action est irréversible.`);
    if (!ok) return;

    delete data.categories[category];
    if (currentCategory === category) { currentCategory = null; currentSubCategory = null; }
    await saveData();
    refreshAll();
    toast('Catégorie supprimée', 'success');
}

// ------------------------------------------------------------
//  Image d'une catégorie (sujet 3) : fichier OU URL
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
//  OPÉRATIONS — SOUS-CATÉGORIES
// ============================================================
async function addSubCategory(value) {
    if (!currentCategory) { toast("Sélectionne d'abord une catégorie.", 'error'); return; }
    const name = (value || '').trim();
    if (!name) { toast('Donne un nom à ta sous-catégorie.', 'error'); return; }
    if (data.categories[currentCategory][name]) { toast('Cette sous-catégorie existe déjà.', 'error'); return; }

    data.categories[currentCategory][name] = [];
    await saveData();
    renderCategories();
    renderMain();
    toast(`Sous-catégorie « ${name} » créée 🎉`, 'success');
}

async function renameSubCategory(category, sub) {
    const newName = await showPrompt('Renommer la sous-catégorie', { label: 'Nouveau nom', value: sub, placeholder: sub });
    if (!newName || newName === sub) return;
    if (data.categories[category][newName]) { toast('Cette sous-catégorie existe déjà.', 'error'); return; }

    const content = data.categories[category];
    data.categories[category] = Object.fromEntries(
        Object.entries(content).map(([k, v]) => [k === sub ? newName : k, v])
    );
    if (currentCategory === category && currentSubCategory === sub) currentSubCategory = newName;
    await saveData();
    refreshAll();
    toast('Sous-catégorie renommée ✨', 'success');
}

async function deleteSubCategory(category, sub) {
    const ok = await showConfirm('Supprimer la sous-catégorie', `Supprimer « ${sub} » et tous ses objectifs ? Cette action est irréversible.`);
    if (!ok) return;

    delete data.categories[category][sub];
    if (currentCategory === category && currentSubCategory === sub) currentSubCategory = null;
    await saveData();
    refreshAll();
    toast('Sous-catégorie supprimée', 'success');
}

// ============================================================
//  OPÉRATIONS — OBJECTIFS
// ============================================================
async function addObjective(nameValue, xpValue, imageValue) {
    if (!currentCategory || !currentSubCategory) { toast("Sélectionne d'abord une sous-catégorie.", 'error'); return; }

    const name = (nameValue || '').trim();
    const xp = parseInt(xpValue, 10);
    const image = (imageValue || '').trim() || null;

    if (!name || isNaN(xp) || xp < 0 || xp > 1000) {
        toast('Champs invalides (XP entre 0 et 1000).', 'error');
        return;
    }

    data.categories[currentCategory][currentSubCategory].push({
        name, xp, completed: false, date: null, image
    });
    await saveData();
    renderSubCategoryView();
    toast('Objectif ajouté 🎯', 'success');
}

async function editObjective(category, sub, index) {
    const o = data.categories[category][sub][index];
    const result = await showModal({
        title: "Modifier l'objectif",
        bodyHTML: `
            <label>Nom</label>
            <input type="text" id="edit-obj-name" value="${escapeHtml(o.name)}" maxlength="100">
            <label>XP (0 à 1000)</label>
            <input type="number" id="edit-obj-xp" value="${o.xp}" min="0" max="1000">`,
        confirmText: 'Enregistrer',
        onConfirm: () => {
            const name = document.getElementById('edit-obj-name').value.trim();
            const xp = parseInt(document.getElementById('edit-obj-xp').value, 10);
            if (!name || isNaN(xp) || xp < 0 || xp > 1000) {
                toast('Champs invalides (XP entre 0 et 1000).', 'error');
                return false;
            }
            return { name, xp };
        }
    });
    if (!result) return;

    o.name = result.name;
    o.xp = result.xp;
    await saveData();
    renderSubCategoryView();
    toast('Objectif modifié ✨', 'success');
}

async function completeObjective(category, sub, index) {
    const o = data.categories[category][sub][index];

    if (o.completed) {
        const ok = await showConfirm('Annuler la complétion', `Remettre « ${o.name} » en non terminé (l'XP sera retirée) ?`, { confirmText: 'Annuler la complétion' });
        if (!ok) return;
        o.completed = false;
        o.date = null;
        await saveData();
        renderSubCategoryView();
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
    renderSubCategoryView();
    toast(`+${o.xp} XP — bravo ! 🎉`, 'success');
}

async function deleteObjective(category, sub, index) {
    const o = data.categories[category][sub][index];
    const ok = await showConfirm("Supprimer l'objectif", `Supprimer « ${o.name} » ?`);
    if (!ok) return;

    data.categories[category][sub].splice(index, 1);
    await saveData();
    renderSubCategoryView();
    toast('Objectif supprimé', 'success');
}

// ============================================================
//  DÉMARRAGE
// ============================================================
async function init() {
    await loadData();
    renderCategories();
    setTab('categories');
    renderMain();
    updateXPSummary();
    refreshAuthUI();
}

// Branchement unique des éléments statiques de index.html
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

    // Supabase vérifie s'il a gardé une session
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        await init();
    } else {
        const overlay = document.getElementById('login-overlay');
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('visible'));
    }
};
