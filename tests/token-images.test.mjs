import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
function setup() {
  const hooks = {};
  const context = vm.createContext({
    Hooks: { once() {}, on(name, callback) { hooks[name] = callback; } },
    foundry: { appv1: { api: { FormApplication: class {} } } },
  });
  vm.runInContext(source, context);
  return { context, hooks };
}

test("token image updates both paths with the ring enabled or disabled", () => {
  const { context } = setup();
  for (const enabled of [true, false]) {
    context.actor = { img: "portrait.webp", prototypeToken: {
      texture: { src: "old.webp" }, ring: { enabled, subject: { texture: "old-subject.webp" } },
    } };
    const result = vm.runInContext('getImageUpdates(actor, { image: "new.webp", tokenImage: "token.webp" })', context);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      ...(enabled ? { "prototypeToken.ring.enabled": false } : {}),
      "prototypeToken.texture.src": "token.webp",
      "prototypeToken.ring.subject.texture": "token.webp",
    });
  }
});

test("legacy entries preserve tokens and custom portraits", () => {
  const { context } = setup();
  assert.equal(vm.runInContext('Object.keys(getImageUpdates({ img: "custom.webp" }, { image: "new.webp" })).length', context), 0);
  assert.equal(vm.runInContext('getImageUpdates({ img: "icons/svg/mystery-man.svg" }, { image: "new.webp" }).img', context), "new.webp");
  assert.equal(vm.runInContext('isValidMapping(["Compendium.pf2e.pack.Actor.id", { image: "new.webp" }])', context), true);
  assert.equal(vm.runInContext('isValidMapping(["Compendium.pf2e.pack.Actor.id", { image: "new.webp", tokenImage: 123 }])', context), false);
});

test("future actor imports apply both token paths using the source UUID", () => {
  const { context, hooks } = setup();
  vm.runInContext('catalog["Compendium.pf2e.pack.Actor.id"] = { image: "portrait.webp", tokenImage: "token.webp" }', context);
  let applied;
  hooks.preCreateActor({
    img: "icons/svg/mystery-man.svg",
    _stats: { compendiumSource: "Compendium.pf2e.pack.Actor.id" },
    updateSource(data) { applied = data; },
  });
  assert.equal(applied.img, "portrait.webp");
  assert.equal(applied["prototypeToken.texture.src"], "token.webp");
  assert.equal(applied["prototypeToken.ring.subject.texture"], "token.webp");
  assert.equal(applied["prototypeToken.ring.enabled"], false);
});

test("disables the ring even when both token image paths already match", () => {
  const { context } = setup();
  context.actor = { img: "portrait.webp", prototypeToken: {
    texture: { src: "token.webp" }, ring: { enabled: true, subject: { texture: "token.webp" } },
  } };
  const result = vm.runInContext('getImageUpdates(actor, { image: "portrait.webp", tokenImage: "token.webp" })', context);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { "prototypeToken.ring.enabled": false });
});
