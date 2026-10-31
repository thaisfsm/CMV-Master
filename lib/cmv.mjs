const MASS = new Set(["g", "kg"]);
const VOLUME = new Set(["ml", "l"]);

export function convertQuantity(value, from, to) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Quantidade inválida.");
  if (from === to) return value;
  if (MASS.has(from) && MASS.has(to)) return from === "kg" ? value * 1000 : value / 1000;
  if (VOLUME.has(from) && VOLUME.has(to)) return from === "l" ? value * 1000 : value / 1000;
  throw new Error("Unidades incompatíveis; informe uma conversão explícita.");
}

export function ingredientCost({ purchasePrice, purchaseQuantity, purchaseUnit, usedQuantity, usedUnit }) {
  if (![purchasePrice, purchaseQuantity, usedQuantity].every(Number.isFinite)) throw new Error("Informe preço e quantidades válidas.");
  if (purchasePrice < 0 || purchaseQuantity <= 0 || usedQuantity < 0) throw new Error("Preço ou quantidade inválidos.");
  const normalizedPurchase = convertQuantity(purchaseQuantity, purchaseUnit, usedUnit);
  return (purchasePrice / normalizedPurchase) * usedQuantity;
}

export function recipeCost(components) {
  if (!Array.isArray(components) || components.length === 0) throw new Error("A receita precisa de ingredientes cadastrados.");
  return components.reduce((sum, item) => sum + ingredientCost(item), 0);
}

export function costPerPortion(totalCost, yieldCount) {
  if (!Number.isFinite(totalCost) || totalCost < 0) throw new Error("Custo total inválido.");
  if (!Number.isFinite(yieldCount) || yieldCount <= 0) throw new Error("O rendimento precisa ser maior que zero.");
  return totalCost / yieldCount;
}

export function theoreticalCmv(consumptionCost, salesRevenue) {
  if (!Number.isFinite(consumptionCost) || !Number.isFinite(salesRevenue) || consumptionCost < 0 || salesRevenue <= 0) {
    throw new Error("Consumo válido e vendas maiores que zero são obrigatórios.");
  }
  return consumptionCost / salesRevenue;
}

export function contributionMargin(salePrice, unitCost) {
  if (!Number.isFinite(salePrice) || salePrice <= 0) throw new Error("Preço de venda precisa ser maior que zero.");
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Custo unitário inválido.");
  return (salePrice - unitCost) / salePrice;
}

export function priceVariation(previousPrice, currentPrice) {
  if (!Number.isFinite(previousPrice) || previousPrice <= 0) throw new Error("Preço anterior precisa ser maior que zero.");
  if (!Number.isFinite(currentPrice) || currentPrice < 0) throw new Error("Preço atual inválido.");
  return { absolute: currentPrice - previousPrice, relative: (currentPrice - previousPrice) / previousPrice };
}

export function realCmv({ openingInventory, purchases, closingInventory, salesRevenue }) {
  for (const [label, value] of Object.entries({ openingInventory, purchases, closingInventory })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} precisa ser um valor não negativo e conhecido.`);
  }
  if (!Number.isFinite(salesRevenue) || salesRevenue <= 0) throw new Error("Receita de vendas precisa ser maior que zero.");
  const consumption = openingInventory + purchases - closingInventory;
  if (consumption < 0) throw new Error("Consumo calculado negativo; revise inventário e compras do período.");
  return { consumption, ratio: consumption / salesRevenue };
}

export function lossImpact(quantity, unitCost) {
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Quantidade de perda inválida.");
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Custo unitário conhecido é obrigatório.");
  return quantity * unitCost;
}
