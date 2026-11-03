-- Preserve internal test membership and credentials; clean only display copy.
UPDATE profiles SET name=replace(name,' · Prueba',''),bio=replace(replace(bio,' Cuenta de prueba con datos ficticios.',''),' Perfil sintético para pruebas; no representa a una persona real.','') WHERE synthetic;
UPDATE "user" u SET name=p.name FROM profiles p WHERE p.user_id=u.id AND p.synthetic;
UPDATE posts SET caption=replace(replace(caption,' Contenido de una cuenta de prueba.',''),' Contenido sintético de prueba.','') WHERE author_id IN(SELECT user_id FROM profiles WHERE synthetic);
