import type { GameParams, Role, RoleParams } from "./index";

export interface ClassroomPreset {
  id: string;
  name: string;
  params: GameParams;
}

const specifications = [
  { id: "test", name: "Test", cash: 14000, stock: 180, demand: [60, 220, 20] },
  { id: "short", name: "Short", cash: 24000, stock: 240,
    demand: [90, 220, 65, 10, 290, 350, 55, 175, 245, 60] },
  { id: "medium", name: "Medium", cash: 26000, stock: 240,
    demand: [95, 225, 85, 65, 10, 240, 205, 105, 250, 310, 350, 55, 175, 235, 70] },
  { id: "standard", name: "Standard", cash: 28000, stock: 240,
    demand: [95, 225, 80, 235, 110, 65, 10, 285, 205, 90, 245, 120, 250, 315, 350, 55, 190, 240, 100, 170] },
  { id: "long", name: "Long", cash: 32000, stock: 240,
    demand: [95, 220, 80, 245, 120, 70, 240, 165, 60, 10, 295, 195, 85, 230, 110, 215, 65, 250, 155, 90, 200, 235, 325, 350, 55, 185, 210, 100, 205, 225] }
];

export const classroomPresets: ClassroomPreset[] = specifications.map(spec => ({
  id: `calibrated-v4-${spec.id}`,
  name: `${spec.name} - ${spec.demand.length} Rounds`,
  params: {
    totalRounds: spec.demand.length,
    marketDemand: [...spec.demand],
    orderLeadTime: 0,
    shipmentLeadTime: 0,
    roleParams: Object.fromEntries(
      (["Retailer", "Wholesaler", "Distributor", "Factory"] as Role[]).map((role, index) => [role, {
        initialCash: spec.cash,
        initialInventory: spec.stock,
        purchaseCost: 24 - index * 6,
        holdingCost: 1,
        backlogCost: 3,
        sellingPrice: 30 - index * 6
      }])
    ) as Record<Role, RoleParams>
  }
}));
