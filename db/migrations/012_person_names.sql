-- Enforce names at the persistence boundary, including imports and admin scripts.
CREATE FUNCTION normalize_person_name(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
 SELECT initcap(btrim(regexp_replace(normalize(value, NFC), '[[:space:]]+', ' ', 'g')));
$$;

CREATE FUNCTION normalize_person_name_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.name := normalize_person_name(NEW.name);
 RETURN NEW;
END;
$$;

CREATE TRIGGER user_person_name BEFORE INSERT OR UPDATE OF name ON "user"
FOR EACH ROW EXECUTE FUNCTION normalize_person_name_row();
CREATE TRIGGER profile_person_name BEFORE INSERT OR UPDATE OF name ON profiles
FOR EACH ROW EXECUTE FUNCTION normalize_person_name_row();

UPDATE "user" SET name = normalize_person_name(name)
WHERE name IS DISTINCT FROM normalize_person_name(name);
UPDATE profiles SET name = normalize_person_name(name)
WHERE name IS DISTINCT FROM normalize_person_name(name);
