// ============================================================
//  ÉTAPE 0 — CONFIGURATION : REMPLACE LES 2 VALEURS CI-DESSOUS
//  (Projet Supabase → Settings → API)
// ============================================================
const SUPABASE_URL = 'https://gqjizrupxnpjzbhpnlby.supabase.co/';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdxaml6cnVweG5wanpiaHBubGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODMzOTQsImV4cCI6MjEwODg1OTM5NH0.oSyq9cgoAIAIah6d78FgkyBJ0xkHgAz9-wUy18It8VY';

// Création du "client" : l'objet qui saura parler à Supabase.
// La clé "anon" est une clé PUBLIQUE : sans danger, car les règles
// RLS de la table n'autorisent que ton compte connecté.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Données initiales avec images
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

// Variables globales
let currentCategory = null;
let currentSubCategory = null;

// ============================================================
//  CHARGEMENT / SAUVEGARDE — le seul vrai changement de fond :
//  localStorage est remplacé par Supabase (dans le cloud).
//  "async" = la fonction met du temps (réseau) : ceux qui
//  l'appellent doivent utiliser "await" pour attendre la fin.
// ============================================================
async function loadData() {
    // 1. On demande la ligne de données de l'utilisateur connecté.
    //    (La règle RLS filtre automatiquement : on ne peut voir que SA ligne.)
    const { data: rows, error } = await sb
        .from('app_data')
        .select('data')
        .limit(1);

    if (error) {
        alert("Impossible de charger les données : " + error.message);
        return;
    }

    // 2. S'il y a une ligne en ligne (:-)) on l'utilise.
    if (rows && rows.length > 0 && rows[0].data && Object.keys(rows[0].data).length > 0) {
        data = rows[0].data;
        return;
    }

    // 3. Sinon, première visite : on migre les anciennes données
    //    localStorage vers Supabase (une seule fois), si elles existent.
    const savedData = localStorage.getItem('objectivesData');
    if (savedData) {
        data = JSON.parse(savedData);
        await saveData();
    }
}

async function saveData() {
    // On récupère l'utilisateur connecté (pour remplir user_id).
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        alert("Non connecté : sauvegarde impossible.");
        return;
    }

    // "upsert" = UPDATE si une ligne existe déjà pour ce compte,
    //            INSERT sinon. Comme ça, pas besoin de gérer les deux cas.
    const { error } = await sb
        .from('app_data')
        .upsert(
            { user_id: user.id, data: data, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }   // une seule ligne par utilisateur
        );

    if (error) alert("Erreur lors de la sauvegarde : " + error.message);
}

// ============================================================
//  CONNEXION — petit écran d'authentification avant l'appli
// ============================================================
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
        alert("Entre ton email et ton mot de passe.");
        return;
    }

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        alert("Connexion échouée : " + error.message);
        return;
    }

    document.getElementById('login-overlay').style.display = 'none';
    await init();
}

// Calculer l'XP total, le niveau et l'XP restant
function calculateXPAndLevel() {
    let totalXP = 0;
    for (const category of Object.keys(data.categories)) {
        for (const subCategory of Object.keys(data.categories[category])) {
            data.categories[category][subCategory].forEach(objective => {
                if (objective.completed) totalXP += objective.xp;
            });
        }
    }

    let level = 1;
    let xpRequired = 0;
    let xpForNextLevel = 0;
    for (let lvl = 2; lvl <= 201; lvl++) {
        xpRequired += Math.floor(50 + (lvl * 2));
        if (totalXP >= xpRequired) level = lvl;
        else { xpForNextLevel = xpRequired; break; }
    }
    const xpRemaining = xpForNextLevel - totalXP;
    return { totalXP, level, xpForNextLevel, xpRemaining };
}

// Mettre à jour l'XP et le niveau
function updateXPSummary() {
    const { totalXP, level, xpForNextLevel, xpRemaining } = calculateXPAndLevel();
    document.getElementById('total-xp').textContent = totalXP;
    document.getElementById('level').textContent = level;
    document.getElementById('xp-to-next-level').textContent =
        `${totalXP} / ${xpForNextLevel} XP ${xpRemaining > 0 ? `(+${xpRemaining} XP pour le niveau ${level + 1})` : "(Niveau max !)"}`;
}

// Initialiser l'application
async function init() {
    await loadData();
    renderCategories();
    document.querySelectorAll('.tab-button')[0].classList.add('active');
    document.getElementById('categories-tab').style.display = 'block';
    renderMainCategories();
    updateXPSummary();
}

// Basculer entre les onglets
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));

    document.getElementById(`${tabName}-tab`).style.display = 'block';
    event.target.classList.add('active');

    if (tabName === 'summary') renderSummary();
    else if (tabName === 'categories') {
        if (currentCategory && !currentSubCategory) renderCategorySummary(currentCategory);
        else if (currentSubCategory) renderSubCategorySummary(currentCategory, currentSubCategory);
        else renderMainCategories();
    }
}

// Rendre les catégories (menu accordéon)
function renderCategories() {
    const categoriesContainer = document.getElementById('categories');
    if (!categoriesContainer) return;
    categoriesContainer.innerHTML = '';

    for (const [category, subCategories] of Object.entries(data.categories)) {
        const categoryElement = document.createElement('div');
        categoryElement.className = 'category collapsed';

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';
        categoryHeader.innerHTML = `
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <h3>${category}</h3>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <button class="delete-category" onclick="event.stopPropagation(); deleteCategory('${category}')" title="Supprimer la catégorie">🗑️</button>
                    <span class="icon">▼</span>
                </div>
            </div>
        `;
        categoryHeader.onclick = (e) => {
            if (e.target.classList.contains('delete-category') || e.target.classList.contains('icon')) return;
            e.stopPropagation();
            toggleCategory(category);
        };

        const subCategoriesElement = document.createElement('div');
        subCategoriesElement.className = 'subcategories';

        for (const subCategory of Object.keys(subCategories)) {
            const subCategoryElement = document.createElement('div');
            subCategoryElement.className = 'subcategory';
            subCategoryElement.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>${subCategory}</span>
                    <button class="delete-subcategory" onclick="event.stopPropagation(); deleteSubCategory('${category}', '${subCategory}')" title="Supprimer la sous-catégorie">🗑️</button>
                </div>
            `;
            subCategoryElement.onclick = (e) => {
                if (e.target.classList.contains('delete-subcategory')) return;
                e.stopPropagation();
                currentCategory = category;
                currentSubCategory = subCategory;
                renderSubCategorySummary(category, subCategory);
                document.getElementById('add-subcategory').style.display = 'flex';
                document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
                document.querySelector('.tab-button[onclick*="categories"]').classList.add('active');
                document.getElementById('categories-tab').style.display = 'block';
            };
            subCategoriesElement.appendChild(subCategoryElement);
        }

        categoryElement.appendChild(categoryHeader);
        categoryElement.appendChild(subCategoriesElement);
        categoriesContainer.appendChild(categoryElement);
    }
}

// Basculer l'affichage des sous-catégories
function toggleCategory(category) {
    const categoryElement = event.currentTarget.parentElement;
    categoryElement.classList.toggle('collapsed');
    if (!categoryElement.classList.contains('collapsed')) {
        currentCategory = category;
        document.getElementById('add-subcategory').style.display = 'flex';
    } else {
        document.getElementById('add-subcategory').style.display = 'none';
    }
}

// Supprimer une catégorie
async function deleteCategory(category) {
    if (!confirm(`Voulez-vous vraiment supprimer la catégorie "${category}" et toutes ses sous-catégories ? Cette action est irréversible.`)) {
        return;
    }
    delete data.categories[category];
    await saveData();
    renderCategories();
    renderMainCategories();
    currentCategory = null;
    currentSubCategory = null;
}

// Supprimer une sous-catégorie
async function deleteSubCategory(category, subCategory) {
    if (!confirm(`Voulez-vous vraiment supprimer la sous-catégorie "${subCategory}" et tous ses objectifs ? Cette action est irréversible.`)) {
        return;
    }
    delete data.categories[category][subCategory];
    await saveData();
    renderCategories();
    if (currentCategory === category && currentSubCategory === subCategory) {
        currentSubCategory = null;
        renderCategorySummary(category);
    }
}

// Rendre la synthèse d'une sous-catégorie
function renderSubCategorySummary(category, subCategory) {
    const mainContent = document.querySelector('.main');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="header">
            <h2 id="current-section">${category} > ${subCategory}</h2>
            <div class="xp-summary">
                <span>XP Total: <strong id="total-xp">0</strong></span>
                <span>Niveau: <strong id="level">1</strong></span>
                <span id="xp-to-next-level">0 / 0 XP</span>
            </div>
        </div>
        <div class="objectives" id="objectives"></div>
        <div class="add-objective">
            <input type="text" id="new-objective" placeholder="Nouvel objectif">
            <input type="number" id="new-xp" placeholder="XP (0 à 1000)" min="0" max="1000">
            <input type="text" id="new-objective-image" placeholder="URL de l'image (optionnel)">
            <button onclick="addObjective()">➕ Ajouter</button>
        </div>
        <div class="add-subcategory" id="add-subcategory" style="display: none;">
            <input type="text" id="new-subcategory" placeholder="Nouvelle sous-catégorie">
            <button onclick="addSubCategory()">➕ Ajouter</button>
        </div>
    `;

    const objectivesContainer = document.getElementById('objectives');
    if (!objectivesContainer) return;

    data.categories[category][subCategory].forEach((objective, index) => {
        const objectiveElement = document.createElement('div');
        objectiveElement.className = `objective ${objective.completed ? 'completed' : ''}`;

        let imageHTML = objective.image ? `<img src="${objective.image}" alt="${objective.name}" class="objective-image">` : '';
        const dateText = objective.completed && objective.date ? `<span class="completed-date">Complété le ${objective.date}</span>` : '';

        objectiveElement.innerHTML = `
            ${imageHTML}
            <div class="objective-text">
                <span class="objective-name">${objective.name} (+${objective.xp} XP)</span>
                ${dateText}
            </div>
            <div class="objective-actions">
                ${!objective.completed ? `<button class="complete" onclick="event.stopPropagation(); completeObjective('${category}', '${subCategory}', ${index})">✅ Compléter</button>` : ''}
                <button class="delete" onclick="event.stopPropagation(); deleteObjective('${category}', '${subCategory}', ${index})">🗑️ Supprimer</button>
            </div>
        `;

        objectivesContainer.appendChild(objectiveElement);
    });

    updateXPSummary();
    document.getElementById('add-subcategory').style.display = 'flex';
}

// Rendre la synthèse globale
function renderSummary() {
    const mainContent = document.querySelector('.main');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="header">
            <h2>Synthèse par catégorie</h2>
            <div class="xp-summary">
                <span>XP Total: <strong id="total-xp">0</strong></span>
                <span>Niveau: <strong id="level">1</strong></span>
                <span id="xp-to-next-level">0 / 0 XP</span>
            </div>
        </div>
        <div class="categories-grid" id="categories-grid"></div>
    `;

    const categoriesGrid = document.getElementById('categories-grid');
    if (!categoriesGrid) return;

    for (const [category, subCategories] of Object.entries(data.categories)) {
        let totalXP = 0, completedXP = 0;
        for (const subCategory of Object.keys(subCategories)) {
            data.categories[category][subCategory].forEach(objective => {
                totalXP += objective.xp;
                if (objective.completed) completedXP += objective.xp;
            });
        }
        const percentage = totalXP > 0 ? Math.round((completedXP / totalXP) * 100) : 0;
        const imageUrl = data.categories[category].image || 'images/default.png';

        const categoryCard = document.createElement('div');
        categoryCard.className = 'category-card';
        categoryCard.innerHTML = `
            <div class="category-image-container">
                <img src="${imageUrl}" alt="${category}" class="category-image">
            </div>
            <h3>${category}</h3>
            <div class="progress-container">
                <div class="progress-bar"><div class="progress-fill" style="width: ${percentage}%"></div></div>
                <span>${completedXP} / ${totalXP} XP (${percentage}%)</span>
            </div>
        `;

        categoryCard.onclick = () => {
            currentCategory = category;
            currentSubCategory = null;
            switchTab('categories');
            document.querySelectorAll('.category-header').forEach(header => {
                header.parentElement.classList.toggle('collapsed', !header.textContent.includes(category));
            });
            renderCategorySummary(category);
        };

        categoriesGrid.appendChild(categoryCard);
    }
    updateXPSummary();
}

// Rendre la synthèse d'une catégorie (sans détailler les objectifs)
function renderCategorySummary(category) {
    const mainContent = document.querySelector('.main');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="header">
            <h2>${category}</h2>
            <div class="xp-summary">
                <span>XP Total: <strong id="total-xp">0</strong></span>
                <span>Niveau: <strong id="level">1</strong></span>
                <span id="xp-to-next-level">0 / 0 XP</span>
            </div>
        </div>
        <div class="subcategories-summary" id="subcategories-summary"></div>
    `;

    const subcategoriesSummary = document.getElementById('subcategories-summary');
    if (!subcategoriesSummary) return;

    for (const [subCategory, objectives] of Object.entries(data.categories[category])) {
        let totalXP = 0, completedXP = 0;
        objectives.forEach(objective => {
            totalXP += objective.xp;
            if (objective.completed) completedXP += objective.xp;
        });
        const percentage = totalXP > 0 ? Math.round((completedXP / totalXP) * 100) : 0;

        const subCategoryCard = document.createElement('div');
        subCategoryCard.className = 'subcategory-card';
        subCategoryCard.innerHTML = `
            <h4>${subCategory}</h4>
            <div class="progress-container">
                <div class="progress-bar"><div class="progress-fill" style="width: ${percentage}%"></div></div>
                <span>${completedXP} / ${totalXP} XP (${percentage}%)</span>
            </div>
        `;
        subcategoriesSummary.appendChild(subCategoryCard);
    }
    updateXPSummary();
}

// Affiche les catégories principales
function renderMainCategories() {
    const mainContent = document.querySelector('.main');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="header">
            <h2>Mes Catégories</h2>
            <div class="xp-summary">
                <span>XP Total: <strong id="total-xp">0</strong></span>
                <span>Niveau: <strong id="level">1</strong></span>
                <span id="xp-to-next-level">0 / 0 XP</span>
            </div>
        </div>
        <div class="categories-grid" id="categories-grid"></div>
    `;

    const categoriesGrid = document.getElementById('categories-grid');
    if (!categoriesGrid) return;

    for (const [category, subCategories] of Object.entries(data.categories)) {
        let totalXP = 0, completedXP = 0;
        for (const subCategory of Object.keys(subCategories)) {
            data.categories[category][subCategory].forEach(objective => {
                totalXP += objective.xp;
                if (objective.completed) completedXP += objective.xp;
            });
        }
        const percentage = totalXP > 0 ? Math.round((completedXP / totalXP) * 100) : 0;
        const imageUrl = data.categories[category].image || 'images/default.png';

        const categoryCard = document.createElement('div');
        categoryCard.className = 'category-card';
        categoryCard.innerHTML = `
            <div class="category-image-container">
                <img src="${imageUrl}" alt="${category}" class="category-image">
            </div>
            <h3>${category}</h3>
            <div class="progress-container">
                <div class="progress-bar"><div class="progress-fill" style="width: ${percentage}%"></div></div>
                <span>${completedXP} / ${totalXP} XP (${percentage}%)</span>
            </div>
        `;

        categoryCard.onclick = () => {
            currentCategory = category;
            currentSubCategory = null;
            switchTab('categories');
            document.querySelectorAll('.category-header').forEach(header => {
                header.parentElement.classList.toggle('collapsed', !header.textContent.includes(category));
            });
            renderCategorySummary(category);
        };
        categoriesGrid.appendChild(categoryCard);
    }
    updateXPSummary();
}

// Marquer un objectif comme complété (avec demande de date)
async function completeObjective(category, subCategory, index) {
    const newDate = prompt("Date de réalisation (YYYY-MM-DD) :", new Date().toISOString().split('T')[0]);
    if (newDate === null) return;

    data.categories[category][subCategory][index].completed = true;
    data.categories[category][subCategory][index].date = newDate;
    await saveData();
    renderSubCategorySummary(category, subCategory);
}

// Supprimer un objectif
async function deleteObjective(category, subCategory, index) {
    data.categories[category][subCategory].splice(index, 1);
    await saveData();
    renderSubCategorySummary(category, subCategory);
}

// Ajouter une catégorie
async function addCategory() {
    const newCategoryInput = document.getElementById('new-category');
    if (!newCategoryInput) return;
    const newCategory = newCategoryInput.value.trim();
    if (newCategory && !data.categories[newCategory]) {
        data.categories[newCategory] = {};
        newCategoryInput.value = '';
        await saveData();
        renderCategories();
        renderMainCategories();
    } else {
        alert("La catégorie existe déjà ou est vide.");
    }
}

// Ajouter une sous-catégorie
async function addSubCategory() {
    if (!currentCategory) {
        alert("Veuillez sélectionner une catégorie d'abord.");
        return;
    }
    const newSubCategoryInput = document.getElementById('new-subcategory');
    if (!newSubCategoryInput) return;
    const newSubCategory = newSubCategoryInput.value.trim();
    if (newSubCategory && !data.categories[currentCategory][newSubCategory]) {
        data.categories[currentCategory][newSubCategory] = [];
        newSubCategoryInput.value = '';
        await saveData();
        renderCategories();
        document.querySelectorAll('.category-header').forEach(header => {
            if (header.textContent.includes(currentCategory)) {
                header.parentElement.classList.remove('collapsed');
                const subCategoryElement = Array.from(header.nextElementSibling.children)
                    .find(el => el.textContent.includes(newSubCategory));
                if (subCategoryElement) subCategoryElement.click();
            }
        });
    } else {
        alert("La sous-catégorie existe déjà ou est vide.");
    }
}

// Ajouter un objectif (sans date à la création)
async function addObjective() {
    if (!currentCategory || !currentSubCategory) {
        alert("Veuillez sélectionner une sous-catégorie d'abord.");
        return;
    }
    const newObjectiveInput = document.getElementById('new-objective');
    const newXPInput = document.getElementById('new-xp');
    const newObjectiveImageInput = document.getElementById('new-objective-image');
    if (!newObjectiveInput || !newXPInput) return;

    const newObjective = newObjectiveInput.value.trim();
    const newXP = parseInt(newXPInput.value);
    const newObjectiveImage = newObjectiveImageInput ? newObjectiveImageInput.value.trim() : null;

    if (newObjective && !isNaN(newXP) && newXP >= 0 && newXP <= 1000) {
        data.categories[currentCategory][currentSubCategory].push({
            name: newObjective,
            xp: newXP,
            completed: false,
            date: null,
            image: newObjectiveImage || null
        });
        newObjectiveInput.value = '';
        newXPInput.value = '';
        if (newObjectiveImageInput) newObjectiveImageInput.value = '';
        await saveData();
        renderSubCategorySummary(currentCategory, currentSubCategory);
    } else {
        alert("Champs invalides (XP entre 0 et 1000).");
    }
}

// ============================================================
//  DÉMARRAGE — au chargement de la page :
//  1. Supabase vérifie s'il a gardé une session (cookie interne)
//  2. Si oui → on lance l'appli directement
//  3. Si non → on affiche l'écran de connexion
// ============================================================
window.onload = async function () {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        await init();
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
    }
};