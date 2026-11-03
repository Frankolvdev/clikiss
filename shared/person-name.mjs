// Keep this aligned with normalize_person_name() in PostgreSQL (migration 012).
export function normalizePersonName(value) {
 return value.normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('es-MX')
  .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu,(_,prefix,letter)=>prefix+letter.toLocaleUpperCase('es-MX'));
}
