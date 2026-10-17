"use client";

import type { SceneBlock } from "@/lib/blocks/kinds/scene";
import { PhotosynthesisScene, PlantCellScene } from "./plant";
import { DistributionScene, LineGraphScene, MarketScene } from "./charts";
import { ProcessScene } from "./process";
import "./scenes.css";

export function SceneView({ block }: { block: SceneBlock }) {
  const ka = block.locale === "ka";
  if (block.id === "photosynthesis") return <PhotosynthesisScene ka={ka} title={block.title} />;
  if (block.id === "plant-cell") return <PlantCellScene ka={ka} title={block.title} />;
  if (block.id === "supply-demand") return <MarketScene ka={ka} title={block.title} />;
  if (block.id === "normal-distribution" || block.id === "t-distribution") return <DistributionScene ka={ka} title={block.title} student={block.id === "t-distribution"} cutoff={block.cutoff} region={block.region} df={block.id === "t-distribution" ? block.df : undefined} />;
  if (block.id === "line-graph") return <LineGraphScene ka={ka} title={block.title} slope={block.slope} intercept={block.intercept} />;
  return <ProcessScene block={block} />;
}
