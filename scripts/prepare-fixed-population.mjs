import {mkdir,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const destination='assets/test-users/population.json';
try{await access(destination);console.log('El catálogo fijo ya existe; no se modifica.');process.exit(0);}catch{}
const first=['Valeria','Mariana','Fernanda','Camila','Daniela','Regina','Paola','Sofía','Andrea','Renata','Lucía','Gabriela','Carolina','Adriana','Natalia','Elena','Claudia','Diana','Patricia','Alejandra','Isabel','Victoria','Jimena','Julia','Emilia'];
const last=['García','Hernández','López','Martínez','Ramírez','Torres','Flores','Rivera','Morales','Castillo','Mendoza','Vargas','Romero','Navarro','Santos','Ortega','Aguilar','Medina','Cruz','Reyes'];
const cities=[['Ciudad de México, México',19.43,-99.13],['Guadalajara, Jalisco, México',20.67,-103.35],['Monterrey, Nuevo León, México',25.69,-100.32],['Puebla, México',19.04,-98.2],['Tulancingo, Hidalgo, México',20.08,-98.37],['Mérida, Yucatán, México',20.97,-89.59],['Querétaro, México',20.59,-100.39],['Cancún, Quintana Roo, México',21.16,-86.85],['Puerto Vallarta, Jalisco, México',20.65,-105.23],['Oaxaca, México',17.07,-96.73],['Morelia, Michoacán, México',19.7,-101.19],['San Luis Potosí, México',22.16,-100.98],['Tijuana, Baja California, México',32.51,-117.04],['León, Guanajuato, México',21.12,-101.68],['Veracruz, México',19.18,-96.14],['Cuernavaca, Morelos, México',18.92,-99.23]];
const rows=Array.from({length:500},(_,i)=>{
 const key=`persona-${String(i+1).padStart(4,'0')}`,hash=createHash('sha256').update(`conecta-fixed-population-v1:${key}`).digest(),age=18+hash[0]%14,city=cities[hash[1]%cities.length],permutation=i*137%500;
 return {key,name:`${first[Math.floor(permutation/20)]} ${last[permutation%20]} ${last[hash[2]%20]}`,age,gender:'Mujer',location:city[0],latitude:city[1],longitude:city[2],bio:'Me gustan las buenas conversaciones y descubrir lugares nuevos.',interests:[['Música','Café','Viajes','Fotografía','Cine'][hash[3]%5],'Caminatas'],adventure:hash[4]%3!==0};
});
await mkdir('assets/test-users',{recursive:true});await writeFile(destination,JSON.stringify(rows,null,2),'utf8');console.log('Catálogo fijo creado: 500 mujeres, edades ficticias 18–31.');
