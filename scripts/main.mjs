const MODULE_ID = "pf2e-creature-images";
const SETTING_CATALOG = "catalog";

let catalog = {};

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_CATALOG, {
    name: "Catálogo de imagens",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  game.settings.registerMenu(MODULE_ID, "catalogManager", {
    name: "Gerenciar catálogo de imagens",
    label: "Abrir catálogo",
    hint: "Consulte, edite, remova, importe e exporte associações de imagens.",
    icon: "fas fa-images",
    type: CatalogManager,
    restricted: true,
  });
});

Hooks.once("ready", async () => {
  catalog = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTING_CATALOG) ?? {});
  registerPf2eArtMappings();

  game.modules.get(MODULE_ID).api = {
    associate: associateImage,
    exportCatalog,
    importCatalog,
    syncWorldActors,
    getCatalog: () => foundry.utils.deepClone(catalog),
  };
});

Hooks.on("preCreateActor", (actor) => {
  const sourceId = getSourceId(actor);
  const entry = sourceId ? catalog[sourceId] : null;
  if (entry?.image && isPlaceholder(actor.img)) actor.updateSource({ img: entry.image });
});

Hooks.on("getActorSheetHeaderButtons", (application, buttons) => {
  const actor = application.actor;
  if (!canAssociate(actor)) return;

  buttons.unshift({
    class: `${MODULE_ID}-associate`,
    icon: "fas fa-image",
    label: "Associar imagem",
    onclick: () => runSafely(() => associateImage(actor)),
  });
});

Hooks.on("renderActorDirectory", (_application, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const footer = root?.querySelector(".directory-footer");
  if (!footer || footer.querySelector(`.${MODULE_ID}-sync`)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `${MODULE_ID}-sync`;
  button.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Sincronizar imagens';
  button.addEventListener("click", () => runSafely(() => syncWorldActors()));
  footer.append(button);
});

function canAssociate(actor) {
  return game.user.isGM && actor?.documentName === "Actor" && actor.type === "npc";
}

async function runSafely(operation) {
  try {
    return await operation();
  } catch (error) {
    console.error(`${MODULE_ID} |`, error);
    ui.notifications.error(`PF2e Creature Images: ${error.message ?? error}`);
  }
}


function getSourceId(actor) {
  const sourceId = actor?._stats?.compendiumSource ?? actor?.flags?.core?.sourceId;
  if (sourceId?.startsWith("Compendium.")) return sourceId;
  if (actor?.uuid?.startsWith("Compendium.")) return actor.uuid;
  return null;
}

function isPlaceholder(path) {
  if (!path) return true;
  return path.includes("icons/svg/mystery-man.svg") ||
    path.includes("systems/pf2e/icons/default-icons/");
}

async function associateImage(actor) {
  if (!canAssociate(actor)) return;

  const sourceId = getSourceId(actor);
  if (!sourceId) {
    ui.notifications.warn("Esta criatura não possui referência ao compêndio de origem.");
    return;
  }

  const current = catalog[sourceId]?.image ?? (isPlaceholder(actor.img) ? "" : actor.img);
  const formData = await foundry.applications.api.DialogV2.input({
    window: { title: `Associar imagem: ${actor.name}` },
    content: `
      <div class="form-group pf2e-creature-images-form">
        <label>URL ou caminho da imagem</label>
        <input type="text" name="image" value="${foundry.utils.escapeHTML(current)}"
          placeholder="https://assets.forge-vtt.com/.../criatura.webp" autofocus>
        <p class="hint">Cole o endereço da Asset Library do Forge ou um caminho acessível pelo Foundry.</p>
      </div>`,
    ok: { label: "Salvar" },
    modal: true,
  });

  if (!formData) return;
  const imageValue = formData.object?.image ?? formData.get?.("image") ?? formData.image;
  const image = String(imageValue ?? "").trim();
  if (!image) return;

  catalog[sourceId] = {
    image,
    name: actor.name,
    updatedAt: new Date().toISOString(),
  };
  await saveCatalog();
  registerPf2eArtMappings();

  if (!actor.pack) await actor.update({ img: image });
  ui.notifications.info(`Imagem associada a ${actor.name}.`);
}

async function saveCatalog() {
  await game.settings.set(MODULE_ID, SETTING_CATALOG, catalog);
}

function registerPf2eArtMappings() {
  const artMap = game.pf2e?.system?.moduleArt?.map;
  if (!(artMap instanceof Map)) return;

  for (const [uuid, entry] of Object.entries(catalog)) {
    if (entry?.image) artMap.set(uuid, { actor: entry.image });
  }
}

async function syncWorldActors({ overwrite = false } = {}) {
  if (!game.user.isGM) return;
  const updates = [];

  for (const actor of game.actors) {
    if (actor.type !== "npc") continue;
    const entry = catalog[getSourceId(actor)];
    if (!entry?.image || (!overwrite && !isPlaceholder(actor.img))) continue;
    updates.push({ _id: actor.id, img: entry.image });
  }

  if (!updates.length) {
    ui.notifications.info("Nenhuma imagem precisava ser sincronizada.");
    return 0;
  }

  await Actor.updateDocuments(updates);
  ui.notifications.info(`${updates.length} criatura(s) sincronizada(s).`);
  return updates.length;
}

function exportCatalog() {
  const json = JSON.stringify({ version: 1, mappings: catalog }, null, 2);
  foundry.utils.saveDataToFile(json, "application/json", "pf2e-creature-images.json");
}

async function importCatalog(data, { replace = false } = {}) {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  const mappings = parsed?.mappings ?? parsed;
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) {
    throw new Error("Catálogo inválido.");
  }

  const importedEntries = Object.entries(mappings).filter(isValidMapping);
  if (!importedEntries.length) throw new Error("O arquivo não contém associações válidas.");

  const imported = Object.fromEntries(importedEntries.map(([uuid, entry]) => [
    uuid,
    foundry.utils.deepClone(entry),
  ]));
  const existing = Object.fromEntries(Object.entries(catalog).filter(isValidMapping));
  catalog = replace ? imported : { ...existing, ...imported };
  await saveCatalog();
  registerPf2eArtMappings();
  return Object.keys(catalog).length;
}

function isValidMapping([uuid, entry]) {
  return uuid.startsWith("Compendium.") &&
    entry && typeof entry === "object" &&
    typeof entry.image === "string" && entry.image.length > 0;
}

class CatalogManager extends foundry.appv1.api.FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-catalog`,
      title: "PF2e Creature Images — Catálogo",
      template: `modules/${MODULE_ID}/templates/catalog-manager.hbs`,
      classes: [MODULE_ID, "catalog-manager"],
      width: 760,
      height: 640,
      resizable: true,
      closeOnSubmit: false,
      submitOnChange: false,
    });
  }

  async getData() {
    const entries = Object.entries(catalog)
      .map(([uuid, entry]) => ({
        uuid,
        name: entry.name || "Criatura sem nome",
        image: entry.image,
        source: formatSource(uuid),
        search: `${entry.name ?? ""} ${formatSource(uuid)} ${uuid}`.toLocaleLowerCase(game.i18n.lang),
        updatedAt: entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "—",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    return { entries, count: entries.length };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0];

    root.querySelector('[data-action="search"]')?.addEventListener("input", (event) => {
      const query = event.currentTarget.value.trim().toLocaleLowerCase(game.i18n.lang);
      for (const row of root.querySelectorAll("[data-catalog-entry]")) {
        row.hidden = query && !row.dataset.search.includes(query);
      }
    });

    root.querySelector('[data-action="export"]')?.addEventListener("click", () => exportCatalog());
    root.querySelector('[data-action="import"]')?.addEventListener("click", () => {
      root.querySelector('input[type="file"]')?.click();
    });
    root.querySelector('input[type="file"]')?.addEventListener("change", (event) => {
      runSafely(async () => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        await importCatalog(await file.text());
        ui.notifications.info("Catálogo importado.");
        this.render(false);
      });
      event.currentTarget.value = "";
    });
    root.querySelector('[data-action="sync"]')?.addEventListener("click", () => {
      runSafely(() => syncWorldActors()).then(() => this.render(false));
    });

    for (const button of root.querySelectorAll('[data-action="edit"]')) {
      button.addEventListener("click", () => runSafely(async () => {
        const uuid = button.closest("[data-catalog-entry]").dataset.uuid;
        const actor = await fromUuid(uuid);
        if (!actor) throw new Error("A criatura não foi encontrada no compêndio.");
        await associateImage(actor);
        this.render(false);
      }));
    }

    for (const button of root.querySelectorAll('[data-action="remove"]')) {
      button.addEventListener("click", () => runSafely(async () => {
        const row = button.closest("[data-catalog-entry]");
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Remover associação" },
          content: `<p>Remover a imagem associada a <strong>${foundry.utils.escapeHTML(row.dataset.name)}</strong>?</p>`,
          yes: { label: "Remover" },
          no: { label: "Cancelar" },
          modal: true,
        });
        if (!confirmed) return;

        delete catalog[row.dataset.uuid];
        game.pf2e?.system?.moduleArt?.map?.delete(row.dataset.uuid);
        await saveCatalog();
        this.render(false);
      }));
    }
  }

  async _updateObject() {}
}

function formatSource(uuid) {
  const match = /^Compendium\.([^.]+)\.([^.]+)\./.exec(uuid);
  return match ? `${match[1]} · ${match[2]}` : uuid;
}
