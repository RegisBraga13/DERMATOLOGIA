import { DERMATOLOGIA_SPECIALTY } from "./dermatologia/index.js";

export const SPECIALTIES = Object.freeze({
  dermatologia: DERMATOLOGIA_SPECIALTY
});

export function specialtyById(id) {
  return SPECIALTIES[id] || null;
}

export function isSpecialtyRecord(record, specialtyId) {
  return Boolean(record && record.specialty === specialtyId);
}
