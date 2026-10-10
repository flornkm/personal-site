import type { GeometryData } from "../engine/geometry";
import type { BoneDef } from "../engine/skeleton";

// The slice of the game's core/types.ts the model builders need.

// Bone names the animator drives. The character module defines the hierarchy and offsets but must
// provide every one of these.
export const BONE_NAMES = [
  "root", // on the ground under the pelvis; the skeleton's rootMatrix places and turns it
  "pelvis",
  "spine",
  "chest",
  "neck",
  "head",
  "upperArmL",
  "foreArmL",
  "handL",
  "upperArmR",
  "foreArmR",
  "handR",
  "thighL",
  "shinL",
  "footL",
  "thighR",
  "shinR",
  "footR",
  // Free bone on the head kept for the contract (helmet plume or hat props can ride on it).
  "accessory",
] as const;
export type BoneName = (typeof BONE_NAMES)[number];

export interface CharacterDims {
  // Top of the hair (not the accessory) above the ground.
  height: number;
  // Pelvis joint above the ground, bind pose.
  hipHeight: number;
  // Distance between the two thigh joints.
  hipWidth: number;
  thighLength: number;
  shinLength: number;
  // Ankle joint above the ground with the sole flat.
  ankleHeight: number;
  // Ankle joint to the toe tip, and ankle to the heel, along +Z.
  toeLength: number;
  heelLength: number;
  shoulderWidth: number;
  upperArmLength: number;
  foreArmLength: number;
  // Collision capsule.
  radius: number;
}

export interface CharacterAsset {
  geometry: GeometryData;
  bones: BoneDef[];
  dims: CharacterDims;
}
