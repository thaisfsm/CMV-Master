import test from "node:test";
import assert from "node:assert/strict";
import { convertQuantity, ingredientCost, recipeCost, costPerPortion, theoreticalCmv, contributionMargin, priceVariation, realCmv, lossImpact } from "../lib/cmv.mjs";

test("converts mass and volume only within compatible dimensions", () => {
  assert.equal(convertQuantity(1, "kg", "g"), 1000);
  assert.equal(convertQuantity(1.5, "l", "ml"), 1500);
  assert.throws(() => convertQuantity(1, "kg", "ml"), /incompatíveis/);
});

test("calculates ingredient and recipe cost without intermediate rounding", () => {
  assert.equal(ingredientCost({ purchasePrice: 18, purchaseQuantity: 1, purchaseUnit: "kg", usedQuantity: 125, usedUnit: "g" }), 2.25);
  assert.equal(recipeCost([
    { purchasePrice: 10, purchaseQuantity: 1, purchaseUnit: "kg", usedQuantity: 100, usedUnit: "g" },
    { purchasePrice: 12, purchaseQuantity: 1, purchaseUnit: "l", usedQuantity: 50, usedUnit: "ml" },
  ]), 1.6);
});

test("requires positive yields and sales denominator", () => {
  assert.equal(costPerPortion(7, 4), 1.75);
  assert.equal(theoreticalCmv(250, 1000), 0.25);
  assert.throws(() => costPerPortion(7, 0), /rendimento/);
  assert.throws(() => theoreticalCmv(10, 0), /vendas/);
});

test("calculates margins, price variation, inventory CMV and loss impact", () => {
  assert.equal(contributionMargin(40, 25), 0.375);
  assert.deepEqual(priceVariation(10, 12), { absolute: 2, relative: 0.2 });
  assert.deepEqual(realCmv({ openingInventory: 100, purchases: 50, closingInventory: 30, salesRevenue: 400 }), { consumption: 120, ratio: 0.3 });
  assert.equal(lossImpact(2.5, 8), 20);
  assert.throws(() => realCmv({ openingInventory: 0, purchases: 0, closingInventory: 1, salesRevenue: 10 }), /negativo/);
  assert.throws(() => lossImpact(1, Number.NaN), /obrigatório/);
});
